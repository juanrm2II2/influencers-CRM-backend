import 'dotenv/config';
import { createApp } from './app';
import { logger } from './logger';
import { validateEnv } from './validateEnv';
import { initializeKeyProvider, destroyKeyProvider } from './services/keyProvider';
import { tokenBlocklist } from './services/tokenBlocklist';
import { supabase } from './services/supabase';

/**
 * Verify that the Supabase JS client exposes `auth.admin.signOut` so that
 * `logout` can globally revoke the user's refresh tokens (audit L2).
 *
 * If the SDK ever removes or renames this method we want a fatal startup
 * error rather than the silent skip we previously logged at runtime — a
 * compromised access token paired with an unrevoked refresh token would
 * otherwise let an attacker keep minting fresh access tokens until the
 * refresh-token TTL expires.
 */
function assertSupabaseAdminSignOut(): void {
  const admin = (
    supabase as unknown as {
      auth: { admin?: { signOut?: unknown } };
    }
  ).auth?.admin;
  if (!admin || typeof admin.signOut !== 'function') {
    throw new Error(
      'supabase.auth.admin.signOut is unavailable — global refresh-token revocation cannot be performed. ' +
        'Update @supabase/supabase-js or check service-role key permissions.',
    );
  }
}

// ---------------------------------------------------------------------------
// Validate required environment variables at startup
// ---------------------------------------------------------------------------
validateEnv();
assertSupabaseAdminSignOut();

const app = createApp();

/**
 * Validate the PORT environment variable (audit L2).
 *
 * `process.env.PORT` is consumed verbatim by `app.listen`.  Mistyped
 * values (`PORT=foo`, `PORT=` …) reach Node and produce an opaque
 * TypeError at start-up rather than a structured fatal log.  Coerce
 * with `Number()` and fall back to 3001 when the result is not a
 * finite integer in the valid TCP port range.
 */
function resolvePort(): number {
  const raw = process.env.PORT;
  if (raw === undefined || raw === '') {
    return 3001;
  }
  const parsed = Number(raw);
  const isValidPort =
    Number.isFinite(parsed) &&
    Number.isInteger(parsed) &&
    parsed >= 1 &&
    parsed <= 65535;
  if (!isValidPort) {
    logger.warn(
      { rawPort: raw },
      `Invalid PORT environment variable "${raw}"; falling back to 3001`,
    );
    return 3001;
  }
  return parsed;
}

const PORT = resolvePort();

// ---------------------------------------------------------------------------
// Global error handlers — log fatal errors and exit cleanly
// ---------------------------------------------------------------------------
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Async bootstrap: initialise the key provider (env / KMS / Secrets Manager)
// then start the HTTP server.
// ---------------------------------------------------------------------------
(async () => {
  try {
    await initializeKeyProvider();
  } catch (err) {
    logger.fatal({ err }, 'Failed to initialize JWT key provider');
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, `Server running on port ${PORT}`);
  });

  // -------------------------------------------------------------------------
  // Graceful shutdown on SIGTERM / SIGINT
  // -------------------------------------------------------------------------
  const SHUTDOWN_TIMEOUT_MS = 10_000; // 10 seconds

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal, closing server…');

    // Force exit if graceful shutdown takes too long
    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close((err) => {
      clearTimeout(forceExit);
      if (err) {
        logger.error({ err }, 'Error while closing HTTP server');
      } else {
        logger.info('HTTP server closed');
      }
      tokenBlocklist.destroy();
      destroyKeyProvider();
      process.exit(err ? 1 : 0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})();

export default app;

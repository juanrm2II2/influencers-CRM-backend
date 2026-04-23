import { buildApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { defaultJobs, registerJobs } from './jobs/scheduler';

const app = buildApp();
const port = env().PORT;

const server = app.listen(port, () => {
  logger.info({ port, env: env().NODE_ENV }, 'server listening');
});

const jobs = registerJobs(defaultJobs());

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'shutdown signal received');
  jobs.stop();
  server.close((err) => {
    if (err) {
      logger.error({ err }, 'error during server close');
      process.exit(1);
    }
    process.exit(0);
  });
  // Hard-exit if close hangs.
  setTimeout(() => {
    logger.warn('force exit after 10s');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandledRejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaughtException');
  process.exit(1);
});

import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { logger } from '../config/logger';

export interface Job {
  name: string;
  schedule: string;
  run: () => Promise<void>;
}

/**
 * Registers all background jobs. In MVP we use in-process node-cron; the
 * swap to BullMQ + Redis is isolated to this module (jobs themselves are
 * side-effect-only async functions, not tied to node-cron).
 */
export function registerJobs(jobs: Job[]): { stop: () => void } {
  if (!env().JOBS_ENABLED) {
    logger.info('JOBS_ENABLED=false, skipping scheduled jobs');
    return { stop: () => {} };
  }

  const tasks: ScheduledTask[] = [];
  for (const job of jobs) {
    if (!cron.validate(job.schedule)) {
      logger.error({ job: job.name, schedule: job.schedule }, 'invalid cron expression');
      continue;
    }
    const task = cron.schedule(job.schedule, async () => {
      const started = Date.now();
      logger.info({ job: job.name }, 'job start');
      try {
        await job.run();
        logger.info({ job: job.name, ms: Date.now() - started }, 'job complete');
      } catch (err) {
        logger.error({ job: job.name, err }, 'job failed');
      }
    });
    tasks.push(task);
  }
  logger.info({ count: tasks.length }, 'scheduled jobs registered');
  return {
    stop: () => {
      for (const t of tasks) t.stop();
    },
  };
}

/** Built-in jobs — implementations land in later phases. */
export function defaultJobs(): Job[] {
  return [
    {
      name: 'metrics-refresh',
      schedule: env().JOBS_METRICS_REFRESH_CRON,
      run: async () => {
        logger.debug('metrics-refresh not yet implemented');
      },
    },
    {
      name: 'kyc-expiry-sweep',
      schedule: env().JOBS_KYC_EXPIRY_CRON,
      run: async () => {
        logger.debug('kyc-expiry-sweep not yet implemented');
      },
    },
    {
      name: 'audit-chain-verify',
      schedule: env().JOBS_AUDIT_VERIFY_CRON,
      run: async () => {
        logger.debug('audit-chain-verify not yet implemented');
      },
    },
  ];
}

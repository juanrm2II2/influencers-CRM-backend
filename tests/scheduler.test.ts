import * as cron from 'node-cron';
import { scheduleJobs } from '../src/jobs/scheduler';

jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({ start: jest.fn() }))
}));

describe('scheduler', () => {
  it('initializes scheduled jobs without throwing', () => {
    expect(() => scheduleJobs()).not.toThrow();
    expect(cron.schedule).toHaveBeenCalled();
  });
});

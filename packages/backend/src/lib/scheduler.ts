import { accountsService } from '../modules/accounts/accounts.service.js';
import { logger } from './logger.js';

const REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 小时

let schedulerTimer: NodeJS.Timeout | null = null;

export function startScheduler() {
  if (schedulerTimer) {
    logger.warn('Scheduler already running');
    return;
  }

  // 立即执行一次
  executeRefresh();

  // 定时执行
  schedulerTimer = setInterval(executeRefresh, REFRESH_INTERVAL_MS);

  logger.info('Scheduler started: refreshing quotas every 4 hours');
}

export function stopScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    logger.info('Scheduler stopped');
  }
}

async function executeRefresh() {
  logger.info('Starting scheduled quota refresh');
  try {
    const results = await accountsService.refreshAllQuotas();
    const success = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    logger.info({ success, failed }, 'Scheduled quota refresh completed');
  } catch (error) {
    logger.error({ error }, 'Scheduled quota refresh failed');
  }
}

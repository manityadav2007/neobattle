import cron from 'node-cron';
import { paymentMatchingService } from '../services/paymentMatchingService';

let isRunning = false;

export function startDepositCleanupJob(): void {
  // Run every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const expiredCount = await paymentMatchingService.cleanupExpiredOrders();
      if (expiredCount > 0) {
        console.log(`[DepositCleanup] Expired ${expiredCount} overdue deposit order(s) and freed pool slots.`);
      }
    } catch (err) {
      console.error('[DepositCleanup] Error cleaning up expired orders:', err);
    } finally {
      isRunning = false;
    }
  });

  console.log('⏰ Deposit cleanup job scheduled (every 2 minutes)');
}

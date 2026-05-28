import cron from 'node-cron';
import { prisma } from '@erp/db';
import { logger } from '../lib/logger.js';
import { runReconciliation } from '../services/reconciliation.service.js';

/**
 * Schedule the nightly reconciliation job at 02:00 IST (20:30 UTC).
 * Finds the first active ADMIN user to attribute corrections to.
 */
export function scheduleReconciliationJob() {
  // 02:00 IST = 20:30 UTC (previous day)
  cron.schedule('30 20 * * *', async () => {
    logger.info('Reconciliation job started');

    try {
      // Use the first active ADMIN as the system user
      const adminUser = await prisma.user.findFirst({
        where: { role: 'ADMIN', isActive: true },
        select: { id: true },
      });

      if (!adminUser) {
        logger.error('Reconciliation job: no active ADMIN user found');
        return;
      }

      const result = await runReconciliation(adminUser.id);

      if (result.correctionCount === 0) {
        logger.info('Reconciliation job completed: no drift detected');
      } else {
        logger.warn(
          { correctionCount: result.correctionCount, corrections: result.corrections },
          'Reconciliation job completed: drift corrected (P1 incident)',
        );
      }
    } catch (err) {
      logger.error({ err }, 'Reconciliation job failed');
    }
  });

  logger.info('Reconciliation cron job scheduled (02:00 IST / 20:30 UTC daily)');
}

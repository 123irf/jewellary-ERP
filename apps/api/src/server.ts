import 'dotenv/config';
import { app } from './app.js';
import { logger } from './lib/logger.js';
import { scheduleReconciliationJob } from './jobs/reconciliation.cron.js';

const PORT = parseInt(process.env.API_PORT || '4000', 10);

app.listen(PORT, () => {
  logger.info(`API server running on http://localhost:${PORT}`);
  scheduleReconciliationJob();
});

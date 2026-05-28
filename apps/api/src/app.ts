import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from './lib/logger.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.routes.js';
import { userRouter } from './routes/user.routes.js';
import { inventoryRouter } from './routes/inventory.routes.js';
import { vendorRouter } from './routes/vendor.routes.js';
import { saleRouter } from './routes/sale.routes.js';
import { customerRouter } from './routes/customer.routes.js';
import { dueRouter } from './routes/due.routes.js';
import { stockMovementRouter } from './routes/stockMovement.routes.js';
import { auditLogRouter } from './routes/auditLog.routes.js';

export const app: Express = express();

// Global middleware
app.use(requestId);
app.use(pinoHttp);
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, data: { status: 'healthy' } });
});

// Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/inventory', inventoryRouter);
app.use('/api/v1/vendors', vendorRouter);
app.use('/api/v1/sales', saleRouter);
app.use('/api/v1/customers', customerRouter);
app.use('/api/v1/dues', dueRouter);
app.use('/api/v1/stock-movements', stockMovementRouter);
app.use('/api/v1/audit-log', auditLogRouter);

// Global error handler (must be last)
app.use(errorHandler);

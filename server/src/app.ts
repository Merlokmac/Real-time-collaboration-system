import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import './types';
import { env, isProd } from './config/env';
import { sessionMiddleware } from './lib/session';
import { prisma } from './lib/prisma';
import { uploadsRoot } from './lib/uploads';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middlewares/error';

export function createApp() {
  const app = express();

  if (isProd) app.set('trust proxy', 1);
  app.use(helmet());

  app.use(
    cors({
      origin: env.CLIENT_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(sessionMiddleware);

  // Dùng cho hosting kiểm tra server còn sống và còn kết nối được database
  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, db: 'up' });
    } catch {
      res.status(503).json({ ok: false, db: 'down' });
    }
  });
  // Đặt dưới /api để frontend dùng chung proxy /api của Vite
  app.use(
    '/api/uploads',
    express.static(uploadsRoot, {
      maxAge: '7d',
      setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
    }),
  );
  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

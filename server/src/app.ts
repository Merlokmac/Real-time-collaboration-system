import express from 'express';
import cors from 'cors';
import './types';
import { env, isProd } from './config/env';
import { sessionMiddleware } from './lib/session';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middlewares/error';

export function createApp() {
  const app = express();

  if (isProd) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    cors({
      origin: env.CLIENT_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(sessionMiddleware);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

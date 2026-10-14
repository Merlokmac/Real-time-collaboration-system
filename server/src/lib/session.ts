import { IncomingMessage, ServerResponse } from 'node:http';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import { env, isProd } from '../config/env';

export const pgPool = new Pool({ connectionString: env.DATABASE_URL, max: 5 });

const PgStore = connectPgSimple(session);

export const SESSION_COOKIE = 'kanban.sid';

export const sessionMiddleware = session({
  store: new PgStore({ pool: pgPool, tableName: 'user_sessions', createTableIfMissing: false }),
  name: SESSION_COOKIE,
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: env.COOKIE_SAMESITE,
    maxAge: env.SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
  },
});

/**
 * Đọc userId từ cookie của một request HTTP thô.
 * Dùng cho Socket.IO handshake và kết nối WebSocket của Yjs (upgrade request).
 */
export function getSessionUserId(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const res = new ServerResponse(req);
    sessionMiddleware(req as any, res as any, (err?: unknown) => {
      if (err) return resolve(null);
      resolve((req as any).session?.userId ?? null);
    });
  });
}

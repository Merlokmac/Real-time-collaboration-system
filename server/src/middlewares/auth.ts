import type { NextFunction, Request, Response } from 'express';
import '../types';
import { unauthorized } from '../lib/errors';

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const userId = req.session.userId;
  if (!userId) return next(unauthorized());
  req.userId = userId;
  next();
}

export function currentUserId(req: Request): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}

export type Ctx = { userId: string; socketId?: string };

// Client gửi kèm header x-socket-id để server không phát lại sự kiện cho chính socket đó
export function ctxOf(req: Request): Ctx {
  const socketId = req.header('x-socket-id') || undefined;
  return { userId: currentUserId(req), socketId };
}

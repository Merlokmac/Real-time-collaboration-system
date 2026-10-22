import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { HttpError } from '../lib/errors';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Đường dẫn không tồn tại' } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu không hợp lệ', details: err.flatten().fieldErrors },
    });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: { code: 'DUPLICATE', message: 'Dữ liệu đã tồn tại' } });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy dữ liệu' } });
    }
  }
  if (err instanceof SyntaxError && 'body' in (err as object)) {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'JSON không hợp lệ' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Lỗi máy chủ' } });
}

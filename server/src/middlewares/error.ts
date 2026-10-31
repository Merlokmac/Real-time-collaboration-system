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
  const bodyError = bodyParserError(err);
  if (bodyError) return res.status(bodyError.status).json({ error: bodyError.error });
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Lỗi máy chủ' } });
}

// Lỗi do express.json ném ra khi body sai định dạng hoặc quá lớn
function bodyParserError(err: unknown) {
  if (typeof err !== 'object' || err === null || !('type' in err)) return null;
  switch ((err as { type: unknown }).type) {
    case 'entity.parse.failed':
      return { status: 400, error: { code: 'BAD_JSON', message: 'JSON không hợp lệ' } };
    case 'entity.too.large':
      return { status: 413, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Dữ liệu gửi lên quá lớn' } };
    default:
      return null;
  }
}

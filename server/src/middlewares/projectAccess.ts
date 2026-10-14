import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { forbidden, notFound } from '../lib/errors';
import { currentUserId } from './auth';

// Người ngoài dự án nhận 404 để không lộ việc dự án có tồn tại hay không
export async function requireProjectMember(req: Request, _res: Response, next: NextFunction) {
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: String(req.params.projectId), userId: currentUserId(req) } },
  });
  if (!membership) return next(notFound('Không tìm thấy dự án'));
  req.membership = membership;
  next();
}

export function requireOwner(req: Request, _res: Response, next: NextFunction) {
  if (req.membership?.role !== 'OWNER') return next(forbidden('Chỉ chủ dự án được thực hiện thao tác này'));
  next();
}

export function projectIdOf(req: Request): string {
  return String(req.params.projectId);
}

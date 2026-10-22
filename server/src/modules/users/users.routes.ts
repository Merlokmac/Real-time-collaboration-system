import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { publicUser } from '../../lib/selects';
import { currentUserId } from '../../middlewares/auth';

export const usersRouter = Router();

const profileBody = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    avatarUrl: z.string().trim().url('Đường dẫn ảnh không hợp lệ').max(500).nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.avatarUrl !== undefined, { message: 'Không có gì để cập nhật' });

usersRouter.patch('/me', async (req, res) => {
  const body = profileBody.parse(req.body);
  const user = await prisma.user.update({
    where: { id: currentUserId(req) },
    data: body,
    select: publicUser,
  });
  res.json({ user });
});

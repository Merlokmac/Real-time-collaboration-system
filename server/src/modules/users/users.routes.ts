import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { publicUser } from '../../lib/selects';
import { badRequest, HttpError } from '../../lib/errors';
import { AVATAR_MAX_BYTES, detectImage, removeAvatarFile, saveAvatar } from '../../lib/uploads';
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
  const userId = currentUserId(req);
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarUrl: true } });
  const user = await prisma.user.update({ where: { id: userId }, data: body, select: publicUser });
  if (body.avatarUrl !== undefined && before.avatarUrl !== user.avatarUrl) await removeAvatarFile(before.avatarUrl);
  res.json({ user });
});

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
}).single('avatar');

function readAvatar(req: Request, res: Response) {
  return new Promise<Express.Multer.File | undefined>((resolve, reject) => {
    avatarUpload(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return reject(new HttpError(413, 'FILE_TOO_LARGE', 'Ảnh đại diện tối đa 2MB'));
        }
        return reject(badRequest('Chỉ gửi một file ảnh ở trường "avatar"'));
      }
      if (err) return reject(err);
      resolve(req.file);
    });
  });
}

// multipart/form-data, trường "avatar": png, jpg, gif hoặc webp, tối đa 2MB
usersRouter.post('/me/avatar', async (req, res) => {
  const file = await readAvatar(req, res);
  if (!file) throw badRequest('Chưa chọn ảnh');
  const ext = detectImage(file.buffer);
  if (!ext) throw new HttpError(400, 'INVALID_IMAGE', 'File không phải ảnh png, jpg, gif hoặc webp');

  const userId = currentUserId(req);
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarUrl: true } });
  const avatarUrl = await saveAvatar(userId, file.buffer, ext);
  const user = await prisma.user.update({ where: { id: userId }, data: { avatarUrl }, select: publicUser });
  await removeAvatarFile(before.avatarUrl);
  res.json({ user });
});

usersRouter.delete('/me/avatar', async (req, res) => {
  const userId = currentUserId(req);
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarUrl: true } });
  const user = await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null }, select: publicUser });
  await removeAvatarFile(before.avatarUrl);
  res.json({ user });
});

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';

export const uploadsRoot = path.resolve(env.UPLOAD_DIR);
const avatarDir = path.join(uploadsRoot, 'avatars');
const AVATAR_URL_PREFIX = '/api/uploads/avatars/';

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Nhận diện ảnh theo vài byte đầu file thay vì tin mimetype client gửi lên,
 * để không ai đổi đuôi file .exe thành .png rồi tải lên được.
 */
export function detectImage(buf: Buffer): 'png' | 'jpg' | 'gif' | 'webp' | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 6 && ['GIF87a', 'GIF89a'].includes(buf.subarray(0, 6).toString('ascii'))) return 'gif';
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export async function saveAvatar(userId: string, data: Buffer, ext: string) {
  await fs.mkdir(avatarDir, { recursive: true });
  const fileName = `${userId}-${randomUUID()}.${ext}`;
  await fs.writeFile(path.join(avatarDir, fileName), data);
  return AVATAR_URL_PREFIX + fileName;
}

// Chỉ xóa ảnh do server lưu, bỏ qua ảnh là link ngoài
export async function removeAvatarFile(avatarUrl: string | null | undefined) {
  if (!avatarUrl?.startsWith(AVATAR_URL_PREFIX)) return;
  const fileName = path.basename(avatarUrl);
  await fs.rm(path.join(avatarDir, fileName), { force: true });
}

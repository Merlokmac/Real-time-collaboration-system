import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { publicUser } from '../../lib/selects';
import { conflict, HttpError, unauthorized } from '../../lib/errors';

const SALT_ROUNDS = 10;

export async function register(input: { email: string; password: string; name: string }) {
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw conflict('EMAIL_TAKEN', 'Email đã được sử dụng');

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  return prisma.user.create({
    data: { email: input.email, name: input.name, passwordHash },
    select: publicUser,
  });
}

export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const ok = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
  if (!user || !ok) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng');
  return { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl };
}

export function getUser(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, select: publicUser });
}

// Xóa mọi phiên đăng nhập khác của user (điện thoại, trình duyệt khác...), giữ lại phiên đang dùng
export async function revokeOtherSessions(userId: string, currentSid: string) {
  return prisma.$executeRaw`DELETE FROM user_sessions WHERE sess ->> 'userId' = ${userId} AND sid <> ${currentSid}`;
}

export async function changePassword(
  userId: string,
  currentSid: string,
  input: { currentPassword: string; newPassword: string },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();

  const ok = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!ok) throw new HttpError(400, 'WRONG_PASSWORD', 'Mật khẩu hiện tại không đúng');
  if (input.currentPassword === input.newPassword) {
    throw new HttpError(400, 'SAME_PASSWORD', 'Mật khẩu mới phải khác mật khẩu hiện tại');
  }

  const passwordHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  // Đổi mật khẩu xong thì các thiết bị khác phải đăng nhập lại
  return revokeOtherSessions(userId, currentSid);
}

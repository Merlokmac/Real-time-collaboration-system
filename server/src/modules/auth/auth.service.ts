import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { publicUser } from '../../lib/selects';
import { conflict, HttpError } from '../../lib/errors';

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

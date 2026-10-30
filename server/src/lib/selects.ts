import { Prisma } from '@prisma/client';

export const publicUser = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

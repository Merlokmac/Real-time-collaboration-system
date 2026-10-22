import 'express-session';
import type { ProjectMember } from '@prisma/client';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      membership?: ProjectMember;
    }
  }
}

export {};

import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  SESSION_MAX_AGE_DAYS: z.coerce.number().positive().default(7),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Thiếu hoặc sai biến môi trường:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';

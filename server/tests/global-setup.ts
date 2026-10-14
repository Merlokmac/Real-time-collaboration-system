import { execSync } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';

export default function globalSetup() {
  const env = dotenv.config({ path: path.resolve(__dirname, '../.env.test') }).parsed ?? {};
  if (!env.DATABASE_URL?.includes('test')) {
    throw new Error('DATABASE_URL trong .env.test phải trỏ tới database test (tên có chữ "test")');
  }
  execSync('npx prisma db push --force-reset --skip-generate', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
}

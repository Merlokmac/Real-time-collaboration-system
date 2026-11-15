import http from 'node:http';
import { env } from './config/env';
import { createApp } from './app';
import { prisma } from './lib/prisma';
import { pgPool } from './lib/session';
import { attachSocketIO } from './realtime/socket';
import { attachYjs } from './realtime/yjs';

const app = createApp();
const server = http.createServer(app);

attachSocketIO(server);
attachYjs(server);

server.listen(env.PORT, () => {
  console.log(`Server chạy tại http://localhost:${env.PORT}`);
});

async function shutdown() {
  server.close();
  await Promise.allSettled([prisma.$disconnect(), pgPool.end()]);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { server };

import http from 'node:http';
import { env } from './config/env';
import { createApp } from './app';
import { prisma } from './lib/prisma';
import { pgPool } from './lib/session';

const app = createApp();
const server = http.createServer(app);

// Phần realtime (Socket.IO + Yjs) gắn vào cùng server tại đây, ví dụ:
//   attachSocketIO(server);   -> gọi setRealtimeBridge(...) bên trong
//   attachYjs(server);        -> dùng authorizeDocument + yjsPersistence từ src/collab

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

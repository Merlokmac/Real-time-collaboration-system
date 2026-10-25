import type { Server as HttpServer } from 'node:http';
import { WebSocketServer } from 'ws';

import { getSessionUserId } from '../lib/session';
import {
  authorizeDocument,
  yjsPersistence,
} from '../collab';

// y-websocket 1.5.4 chưa có type declaration tốt cho server utils
const {
  setupWSConnection,
  setPersistence,
} = require('y-websocket/bin/utils');

export function attachYjs(server: HttpServer) {
  const wss = new WebSocketServer({
    noServer: true,
  });

  // Dùng persistence PostgreSQL mà backend đã chuẩn bị
  setPersistence(yjsPersistence);

  server.on('upgrade', async (request, socket, head) => {
    const url = new URL(
      request.url ?? '/',
      `http://${request.headers.host ?? 'localhost'}`,
    );

    // Không phải Yjs thì để Socket.IO xử lý
    if (!url.pathname.startsWith('/yjs/')) {
      return;
    }

    const docName = decodeURIComponent(
      url.pathname.slice('/yjs/'.length),
    );

    try {
      // 1. Kiểm tra đã login chưa
      const userId = await getSessionUserId(request);

      if (!userId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // 2. Kiểm tra user có quyền mở task không
      const access = await authorizeDocument(
        userId,
        docName,
      );

      if (!access) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      // 3. Upgrade thành WebSocket
      wss.handleUpgrade(
        request,
        socket,
        head,
        (ws) => {
          console.log('Yjs connected:', {
            userId,
            docName,
          });

          setupWSConnection(
            ws,
            request,
            {
              docName,
            },
          );
        },
      );
    } catch (error) {
      console.error('Yjs upgrade error:', error);

      socket.destroy();
    }
  });

  return wss;
}
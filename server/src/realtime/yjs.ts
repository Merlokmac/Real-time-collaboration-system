import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { setupWSConnection, setPersistence } from 'y-websocket/bin/utils';

import { getSessionUserId } from '../lib/session';
import { authorizeDocument, yjsPersistence } from '../collab';

type YjsConnection = {
  ws: WebSocket;
  userId: string;
  projectId: string;
};

const connections = new Set<YjsConnection>();

// Đóng kết nối Yjs khi thành viên mất quyền
export function revokeYjsConnections(projectId: string, userId?: string) {
  for (const connection of connections) {
    if (connection.projectId !== projectId) continue;
    if (userId && connection.userId !== userId) continue;

    connection.ws.terminate();
    connections.delete(connection);
  }
}

export function attachYjs(server: HttpServer) {
  const wss = new WebSocketServer({
    noServer: true,
  });

  // Dùng persistence PostgreSQL mà backend đã chuẩn bị
  setPersistence(yjsPersistence);

  server.on('upgrade', async (request, socket, head) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

      // Không phải Yjs thì để Socket.IO xử lý
      if (!url.pathname.startsWith('/yjs/')) {
        return;
      }

      const docName = decodeURIComponent(url.pathname.slice('/yjs/'.length));

      // Kiểm tra người dùng đã đăng nhập chưa
      const userId = await getSessionUserId(request);

      if (!userId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // Kiểm tra quyền truy cập tài liệu
      const access = await authorizeDocument(userId, docName);

      if (!access) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      // Upgrade và theo dõi kết nối Yjs
      wss.handleUpgrade(request, socket, head, (ws) => {
        const connection: YjsConnection = {
          ws,
          userId,
          projectId: access.projectId,
        };

        connections.add(connection);

        // Dọn thông tin khi WebSocket đóng
        ws.on('close', () => {
          connections.delete(connection);
        });

        try {
          // Thiết lập Yjs ngay để không bỏ lỡ gói sync đầu tiên
          setupWSConnection(ws, request, { docName });

          // Kiểm tra lại quyền sau khi thiết lập kết nối
          void authorizeDocument(userId, docName)
            .then((currentAccess) => {
              if (!currentAccess || currentAccess.projectId !== access.projectId) {
                ws.terminate();
                return;
              }

              if (ws.readyState === WebSocket.OPEN) {
                console.log('Yjs connected:', {
                  userId,
                  docName,
                });
              }
            })
            .catch((error) => {
              console.error('Yjs connection error:', error);
              ws.terminate();
            });
        } catch (error) {
          console.error('Yjs setup error:', error);
          ws.terminate();
        }
      });
    } catch (error) {
      console.error('Yjs upgrade error:', error);
      socket.destroy();
    }
  });

  return wss;
}

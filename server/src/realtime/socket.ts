import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { getSessionUserId } from '../lib/session';
import { setRealtimeBridge } from './bridge';
import { revokeYjsConnections } from './yjs';
import { projectRoom, userRoom } from './events';

export function attachSocketIO(server: HttpServer) {
  const io = new Server(server, {
    cors: {
      origin: env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim()),
      credentials: true,
    },
  });

  // Xác thực socket bằng session và lưu thông tin user
  io.use(async (socket, next) => {
    try {
      const userId = await getSessionUserId(socket.request);

      if (!userId) {
        return next(new Error('UNAUTHORIZED'));
      }

      const user = await prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (!user) {
        return next(new Error('UNAUTHORIZED'));
      }

      socket.data.userId = user.id;
      socket.data.userName = user.name;

      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  // Phát danh sách user đang online trong project
  async function broadcastPresence(projectId: string) {
    const room = projectRoom(projectId);
    const sockets = await io.in(room).fetchSockets();

    const users = new Map<string, string>();

    for (const peer of sockets) {
      const userId = String(peer.data.userId ?? '');
      const name = String(peer.data.userName ?? 'Người dùng');

      if (!userId) continue;

      users.set(userId, name);
    }

    io.to(room).emit('presence:updated', {
      projectId,
      users: Array.from(users.entries()).map(([id, name]) => ({
        id,
        name,
      })),
    });
  }

  io.on('connection', (socket) => {
    const userId = String(socket.data.userId);
    const userName = String(socket.data.userName);

    const joinedProjects = new Set<string>();

    console.log('Socket connected:', {
      socketId: socket.id,
      userId,
    });

    socket.join(userRoom(userId));

    // Join project room sau khi kiểm tra quyền thành viên
    socket.on('project:join', async (projectId: unknown) => {
      if (typeof projectId !== 'string' || !projectId.trim()) {
        return;
      }

      try {
        const membership = await prisma.projectMember.findUnique({
          where: {
            projectId_userId: {
              projectId,
              userId,
            },
          },
        });

        if (!membership || !socket.connected) {
          return;
        }

        await socket.join(projectRoom(projectId));

        joinedProjects.add(projectId);

        console.log(`Socket ${socket.id} joined ${projectRoom(projectId)}`);

        await broadcastPresence(projectId);
      } catch (error) {
        console.error('Project join error:', error);
      }
    });

    // Rời project room và cập nhật presence
    socket.on('project:leave', async (projectId: unknown) => {
      if (typeof projectId !== 'string' || !projectId.trim()) {
        return;
      }

      try {
        const room = projectRoom(projectId);

        if (!socket.rooms.has(room)) return;

        socket.to(room).emit('chat:typing', {
          projectId,
          userId,
          name: userName,
          typing: false,
        });

        await socket.leave(room);

        joinedProjects.delete(projectId);

        await broadcastPresence(projectId);

        console.log(`Socket ${socket.id} left ${room}`);
      } catch (error) {
        console.error('Project leave error:', error);
      }
    });

    // Phát trạng thái đang nhập cho những user khác
    socket.on('chat:typing', (payload: { projectId?: string; typing?: boolean }) => {
      const projectId = payload?.projectId;

      if (typeof projectId !== 'string' || !projectId.trim() || typeof payload?.typing !== 'boolean') {
        return;
      }

      const room = projectRoom(projectId);

      if (!socket.rooms.has(room)) {
        return;
      }

      socket.to(room).emit('chat:typing', {
        projectId,
        userId,
        name: userName,
        typing: payload.typing,
      });
    });

    // Báo ngừng typing trước khi socket disconnect
    socket.on('disconnecting', () => {
      for (const projectId of joinedProjects) {
        if (!socket.rooms.has(projectRoom(projectId))) {
          continue;
        }

        socket.to(projectRoom(projectId)).emit('chat:typing', {
          projectId,
          userId,
          name: userName,
          typing: false,
        });
      }
    });

    // Cập nhật presence sau khi user mất kết nối
    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', {
        socketId: socket.id,
        userId,
        reason,
      });

      for (const projectId of joinedProjects) {
        void broadcastPresence(projectId).catch((error) => {
          console.error('Broadcast presence error:', error);
        });
      }

      joinedProjects.clear();
    });
  });

  // Nối REST API với Socket.IO
  setRealtimeBridge({
    toProject(projectId, event, payload, exceptSocketId) {
      const room = io.to(projectRoom(projectId));

      if (exceptSocketId) {
        room.except(exceptSocketId).emit(event, payload);
        return;
      }

      room.emit(event, payload);
    },

    toUser(userId, event, payload) {
      io.to(userRoom(userId)).emit(event, payload);
    },

    revokeAccess(projectId, userId) {
      // Thu hồi quyền nhận realtime của project
      io.in(userRoom(userId)).socketsLeave(projectRoom(projectId));

      // Đóng các WebSocket Yjs của thành viên bị kick
      revokeYjsConnections(projectId, userId);

      // Xóa trạng thái typing của thành viên bị kick
      io.to(projectRoom(projectId)).emit('chat:typing', {
        projectId,
        userId,
        typing: false,
      });

      // Báo cho user bị kick biết đã mất quyền
      io.to(userRoom(userId)).emit('project:access_revoked', {
        projectId,
      });

      // Cập nhật danh sách online
      void broadcastPresence(projectId).catch((error) => {
        console.error('Broadcast presence error:', error);
      });
    },

    closeProject(projectId) {
      io.in(projectRoom(projectId)).socketsLeave(projectRoom(projectId));

      // Đóng toàn bộ kết nối Yjs của project
      revokeYjsConnections(projectId);
    },
  });

  return io;
}

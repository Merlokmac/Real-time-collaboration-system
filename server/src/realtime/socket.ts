import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { getSessionUserId } from '../lib/session';
import { setRealtimeBridge } from './bridge';
import { projectRoom, userRoom } from './events';

export function attachSocketIO(server: HttpServer) {
  const io = new Server(server, {
    cors: {
      origin: env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim()),
      credentials: true,
    },
  });

  // Xác thực socket bằng cookie đăng nhập hiện tại
  io.use(async (socket, next) => {
    const userId = await getSessionUserId(socket.request);

    if (!userId) {
      return next(new Error('UNAUTHORIZED'));
    }

    socket.data.userId = userId;
    next();
  });

  io.on('connection', (socket) => {
    const userId = String(socket.data.userId);

    console.log('Socket connected:', {
      socketId: socket.id,
      userId,
    });

    // Mỗi user có một room riêng
    socket.join(userRoom(userId));

    // User xin vào room của một project
    socket.on('project:join', async (projectId: string) => {
      const membership = await prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId,
          },
        },
      });

      if (!membership) {
        console.log(`User ${userId} không có quyền vào project ${projectId}`);
        return;
      }

      await socket.join(projectRoom(projectId));

      console.log(
        `Socket ${socket.id} joined ${projectRoom(projectId)}`,
      );
    });

    socket.on('project:leave', async (projectId: string) => {
      await socket.leave(projectRoom(projectId));

      console.log(
        `Socket ${socket.id} left ${projectRoom(projectId)}`,
      );
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', {
        socketId: socket.id,
        userId,
        reason,
      });
    });
  });

  // Nối API hiện tại với Socket.IO
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
      io.in(userRoom(userId)).socketsLeave(projectRoom(projectId));
    },

    closeProject(projectId) {
      io.in(projectRoom(projectId)).socketsLeave(projectRoom(projectId));
    },
  });

  return io;
}
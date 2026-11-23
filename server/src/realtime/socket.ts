
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';

import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { getSessionUserId } from '../lib/session';
import { setRealtimeBridge } from './bridge';
import { revokeYjsConnections } from './yjs';
import { projectRoom, userRoom } from './events';

type EditingPayload = {
  projectId?: string;
  taskId?: string;
  editing?: boolean;
};

type EditingSession = {
  projectId: string;
  taskId: string;
};

export function attachSocketIO(server: HttpServer) {
  const io = new Server(server, {
    cors: {
      origin: env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim()),
      credentials: true,
    },
  });

  // Lưu trạng thái chỉnh sửa và yêu cầu đang chờ theo từng socket
  const editingSessions = new Map<string, Map<string, EditingSession>>();
  const editingRequests = new Map<string, Map<string, EditingSession>>();

  // Xác thực socket bằng session
  io.use(async (socket, next) => {
    try {
      const userId = await getSessionUserId(socket.request);

      if (!userId) {
        return next(new Error('UNAUTHORIZED'));
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true },
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

  // Phát danh sách thành viên online trong project
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

  // Hủy yêu cầu đang chờ và dừng trạng thái chỉnh sửa
  function stopEditing(socket: Socket, projectId?: string, taskId?: string) {
    const requests = editingRequests.get(socket.id);

    if (requests) {
      for (const [key, request] of requests) {
        if (projectId && request.projectId !== projectId) continue;
        if (taskId && request.taskId !== taskId) continue;

        requests.delete(key);
      }

      if (requests.size === 0) {
        editingRequests.delete(socket.id);
      }
    }

    const sessions = editingSessions.get(socket.id);

    if (!sessions) return;

    for (const [key, session] of sessions) {
      if (projectId && session.projectId !== projectId) continue;
      if (taskId && session.taskId !== taskId) continue;

      socket.to(projectRoom(session.projectId)).emit('task:editing', {
        projectId: session.projectId,
        taskId: session.taskId,
        socketId: socket.id,
        userId: String(socket.data.userId),
        name: String(socket.data.userName),
        editing: false,
      });

      sessions.delete(key);
    }

    if (sessions.size === 0) {
      editingSessions.delete(socket.id);
    }
  }

  // Gửi danh sách người đang sửa cho thành viên mở thẻ sau
  function sendEditingSnapshot(socket: Socket, projectId: string, taskId: string) {
    const editors = [];

    for (const [socketId, sessions] of editingSessions) {
      const session = sessions.get(taskId);

      if (!session || session.projectId !== projectId || socketId === socket.id) {
        continue;
      }

      const peer = io.sockets.sockets.get(socketId);

      if (!peer || !peer.connected || !peer.rooms.has(projectRoom(projectId))) {
        continue;
      }

      editors.push({
        projectId,
        taskId,
        socketId,
        userId: String(peer.data.userId),
        name: String(peer.data.userName),
        editing: true,
      });
    }

    socket.emit('task:editing:snapshot', {
      projectId,
      taskId,
      editors,
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

    // Vào project room sau khi kiểm tra quyền
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

    // Rời project và xóa trạng thái đang sửa
    socket.on('project:leave', async (projectId: unknown) => {
      if (typeof projectId !== 'string' || !projectId.trim()) {
        return;
      }

      try {
        const room = projectRoom(projectId);

        if (!socket.rooms.has(room)) return;

        stopEditing(socket, projectId);

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

    // Phát trạng thái đang chỉnh sửa thẻ
    socket.on('task:editing', async (payload: EditingPayload) => {
      const projectId = payload?.projectId;
      const taskId = payload?.taskId;
      const editing = payload?.editing;

      if (
        typeof projectId !== 'string' ||
        !projectId.trim() ||
        typeof taskId !== 'string' ||
        !taskId.trim() ||
        typeof editing !== 'boolean'
      ) {
        return;
      }

      if (!editing) {
        stopEditing(socket, projectId, taskId);
        return;
      }

      const room = projectRoom(projectId);

      if (!socket.rooms.has(room)) return;

      // Ghi nhận yêu cầu trước khi truy vấn database
      const requests = editingRequests.get(socket.id) ?? new Map<string, EditingSession>();
      const request: EditingSession = { projectId, taskId };

      requests.set(taskId, request);
      editingRequests.set(socket.id, requests);

      try {
        const task = await prisma.task.findFirst({
          where: { id: taskId, projectId },
          select: { id: true },
        });

        // Không phát event nếu yêu cầu đã bị hủy hoặc socket mất quyền
        if (
          editingRequests.get(socket.id)?.get(taskId) !== request ||
          !task ||
          !socket.connected ||
          !socket.rooms.has(room)
        ) {
          return;
        }

        requests.delete(taskId);

        if (requests.size === 0) {
          editingRequests.delete(socket.id);
        }

        const sessions = editingSessions.get(socket.id) ?? new Map<string, EditingSession>();

        sessions.set(taskId, { projectId, taskId });
        editingSessions.set(socket.id, sessions);

        socket.to(room).emit('task:editing', {
          projectId,
          taskId,
          socketId: socket.id,
          userId,
          name: userName,
          editing: true,
        });
      } catch (error) {
        if (editingRequests.get(socket.id)?.get(taskId) === request) {
          requests.delete(taskId);

          if (requests.size === 0) {
            editingRequests.delete(socket.id);
          }
        }

        console.error('Task editing error:', error);
      }
    });

    // Đồng bộ trạng thái cho người vừa mở thẻ
    socket.on('task:editing:get', async (payload: { projectId?: string; taskId?: string }) => {
      const projectId = payload?.projectId;
      const taskId = payload?.taskId;

      if (
        typeof projectId !== 'string' ||
        !projectId.trim() ||
        typeof taskId !== 'string' ||
        !taskId.trim()
      ) {
        return;
      }

      try {
        const task = await prisma.task.findFirst({
          where: {
            id: taskId,
            projectId,
            project: {
              members: {
                some: { userId },
              },
            },
          },
          select: { id: true },
        });

        if (!task || !socket.connected) return;

        sendEditingSnapshot(socket, projectId, taskId);
      } catch (error) {
        console.error('Task editing snapshot error:', error);
      }
    });

    // Phát trạng thái đang nhập trong chat
    socket.on('chat:typing', (payload: { projectId?: string; typing?: boolean }) => {
      const projectId = payload?.projectId;

      if (
        typeof projectId !== 'string' ||
        !projectId.trim() ||
        typeof payload?.typing !== 'boolean'
      ) {
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

    // Dọn trạng thái trước khi socket mất kết nối
    socket.on('disconnecting', () => {
      stopEditing(socket);

      for (const projectId of joinedProjects) {
        if (!socket.rooms.has(projectRoom(projectId))) continue;

        socket.to(projectRoom(projectId)).emit('chat:typing', {
          projectId,
          userId,
          name: userName,
          typing: false,
        });
      }
    });

    // Cập nhật presence sau khi socket mất kết nối
    socket.on('disconnect', (reason) => {
      editingSessions.delete(socket.id);
      editingRequests.delete(socket.id);

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
      // Dừng trạng thái chỉnh sửa của thành viên bị xóa
      for (const peer of io.sockets.sockets.values()) {
        if (peer.data.userId === userId) {
          stopEditing(peer, projectId);
        }
      }

      // Thu hồi quyền nhận event realtime
      io.in(userRoom(userId)).socketsLeave(projectRoom(projectId));

      // Đóng kết nối Yjs của thành viên bị xóa
      revokeYjsConnections(projectId, userId);

      io.to(projectRoom(projectId)).emit('chat:typing', {
        projectId,
        userId,
        typing: false,
      });

      // Thông báo cho thành viên bị xóa
      io.to(userRoom(userId)).emit('project:access_revoked', {
        projectId,
      });

      void broadcastPresence(projectId).catch((error) => {
        console.error('Broadcast presence error:', error);
      });
    },

    closeProject(projectId) {
      // Dừng trạng thái chỉnh sửa trong project bị đóng
      for (const peer of io.sockets.sockets.values()) {
        stopEditing(peer, projectId);
      }

      io.in(projectRoom(projectId)).socketsLeave(projectRoom(projectId));

      revokeYjsConnections(projectId);
    },
  });

  return io;
}

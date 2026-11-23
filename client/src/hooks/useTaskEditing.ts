
import { useEffect, useState } from 'react';
import { socket } from '../realtime/socket';

interface EditingEvent {
  projectId: string;
  taskId: string;
  socketId: string;
  userId: string;
  name: string;
  editing: boolean;
}

interface EditingSnapshot {
  projectId: string;
  taskId: string;
  editors: EditingEvent[];
}

export function useTaskEditing(
  projectId: string,
  taskId: string,
  active: boolean,
) {
  const [editors, setEditors] = useState<Record<string, string>>({});

  // Nhận trạng thái đang sửa và danh sách người sửa ban đầu
  useEffect(() => {
    const onEditing = (event: EditingEvent) => {
      if (event.projectId !== projectId || event.taskId !== taskId) return;

      setEditors((current) => {
        const next = { ...current };

        if (event.editing) {
          next[event.socketId] = event.name;
        } else {
          delete next[event.socketId];
        }

        return next;
      });
    };

    const onSnapshot = (payload: EditingSnapshot) => {
      if (payload.projectId !== projectId || payload.taskId !== taskId) return;

      const next: Record<string, string> = {};

      for (const editor of payload.editors) {
        if (editor.socketId !== socket.id) {
          next[editor.socketId] = editor.name;
        }
      }

      setEditors(next);
    };

    const getSnapshot = () => {
      socket.emit('task:editing:get', { projectId, taskId });
    };

    const onDisconnect = () => {
      setEditors({});
    };

    socket.on('task:editing', onEditing);
    socket.on('task:editing:snapshot', onSnapshot);
    socket.on('connect', getSnapshot);
    socket.on('disconnect', onDisconnect);

    if (socket.connected) {
      getSnapshot();
    }

    return () => {
      socket.off('task:editing', onEditing);
      socket.off('task:editing:snapshot', onSnapshot);
      socket.off('connect', getSnapshot);
      socket.off('disconnect', onDisconnect);
      setEditors({});
    };
  }, [projectId, taskId]);

  // Phát trạng thái khi có thay đổi chưa lưu
  useEffect(() => {
    const send = (editing: boolean) => {
      if (!socket.connected) return;

      socket.emit('task:editing', {
        projectId,
        taskId,
        editing,
      });
    };

    const onConnect = () => {
      if (active) send(true);
    };

    if (active) send(true);

    socket.on('connect', onConnect);

    return () => {
      if (active) send(false);
      socket.off('connect', onConnect);
    };
  }, [projectId, taskId, active]);

  return Array.from(new Set(Object.values(editors)));
}

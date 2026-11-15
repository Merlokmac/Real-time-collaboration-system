/*
 * Nhận sự kiện realtime của bảng (Socket.IO) và áp lên state của useBoard bằng các hàm thuần trong boardState.
 * Phần kết nối socket (realtime/socket.ts, RealtimeProvider) và server do Người 3 làm; hook này chỉ nghe sự kiện.
 *
 *   - Vào phòng dự án (`project:join`) khi bảng đã tải xong; rời phòng (`project:leave`) khi rời trang/đổi dự án.
 *     Chờ bảng tải xong mới vào phòng để các component con (ChatPanel) đã kịp đăng ký nghe `presence:updated`.
 *   - Mất kết nối rồi kết nối lại → vào phòng lại và tải lại bảng (có thể đã lỡ sự kiện trong lúc mất kết nối).
 *   - task:created / task:updated / task:moved / task:deleted → upsertTask / refreshTaskContent / applyTaskOrder /
 *     removeTask. Các hàm này idempotent, nên nhận lại sự kiện của chính thao tác mình (task:moved luôn được gửi
 *     cho cả người kéo) cũng không sai.
 *   - project:access_revoked (bị xóa khỏi dự án) → gọi `onAccessRevoked` để trang đưa về Dự án của tôi.
 *
 * Sự kiện cột, nhãn, dự án, thành viên được thêm ở Tuần 7.
 */
import { useEffect, useRef } from 'react';
import { socket } from '../realtime/socket';
import type { ColumnTaskOrder, Task } from '../types';
import { applyTaskOrder, refreshTaskContent, removeTask, upsertTask } from '../utils/boardState';
import type { BoardUpdater } from './useBoard';

interface TaskMovedPayload {
  task: Task;
  columns: ColumnTaskOrder[];
}

interface TaskDeletedPayload {
  taskId: string;
  columnId: string;
  taskIds: string[];
}

interface UseBoardRealtimeOptions {
  projectId: string;
  /** Bảng đã tải xong: lúc này mới vào phòng dự án */
  ready: boolean;
  applyUpdate: (updater: BoardUpdater) => void;
  reload: () => void;
  onAccessRevoked: () => void;
}

export function useBoardRealtime({ projectId, ready, applyUpdate, reload, onAccessRevoked }: UseBoardRealtimeOptions) {
  // Giữ callback mới nhất trong ref để effect không phải đăng ký lại mỗi lần render
  const onAccessRevokedRef = useRef(onAccessRevoked);
  useEffect(() => {
    onAccessRevokedRef.current = onAccessRevoked;
  });

  useEffect(() => {
    if (!ready) return;

    const join = () => socket.emit('project:join', projectId);
    const handleReconnect = () => {
      join();
      reload();
    };

    // Sự kiện dự án khác (nếu socket còn ở phòng cũ) thì bỏ qua
    const onTaskCreated = (task: Task) => {
      if (task.projectId === projectId) applyUpdate((b) => upsertTask(b, task));
    };
    const onTaskUpdated = (task: Task) => {
      if (task.projectId === projectId) applyUpdate((b) => refreshTaskContent(b, task));
    };
    const onTaskMoved = ({ task, columns }: TaskMovedPayload) => {
      if (task.projectId !== projectId) return;
      // Thứ tự theo server; nội dung thẻ chỉ lấy khi không cũ hơn bản đang có
      applyUpdate((b) => refreshTaskContent(applyTaskOrder(b, columns), task));
    };
    const onTaskDeleted = ({ taskId, columnId, taskIds }: TaskDeletedPayload) => {
      applyUpdate((b) => removeTask(b, taskId, { columnId, taskIds }));
    };
    const onAccessRevoked = (payload: { projectId: string }) => {
      if (payload.projectId === projectId) onAccessRevokedRef.current();
    };

    if (socket.connected) join();
    socket.on('connect', handleReconnect);
    socket.on('task:created', onTaskCreated);
    socket.on('task:updated', onTaskUpdated);
    socket.on('task:moved', onTaskMoved);
    socket.on('task:deleted', onTaskDeleted);
    socket.on('project:access_revoked', onAccessRevoked);

    return () => {
      socket.emit('project:leave', projectId);
      socket.off('connect', handleReconnect);
      socket.off('task:created', onTaskCreated);
      socket.off('task:updated', onTaskUpdated);
      socket.off('task:moved', onTaskMoved);
      socket.off('task:deleted', onTaskDeleted);
      socket.off('project:access_revoked', onAccessRevoked);
    };
  }, [projectId, ready, applyUpdate, reload]);
}

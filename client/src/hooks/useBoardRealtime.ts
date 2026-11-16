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
 *   - column:created / column:updated / column:reordered / column:deleted → addColumn / updateColumn /
 *     reorderColumns / removeColumn (cũng idempotent).
 *   - project:access_revoked (bị xóa khỏi dự án) hoặc project:deleted → gọi `onAccessRevoked` để trang đưa về
 *     Dự án của tôi. (member:removed của chính mình đã đi kèm project:access_revoked từ server.)
 *
 * Sự kiện nhãn, sửa dự án, thành viên khác được thêm ở Tuần 7.
 */
import { useEffect, useRef } from 'react';
import { socket } from '../realtime/socket';
import type { Column, ColumnTaskOrder, Task } from '../types';
import {
  addColumn,
  applyTaskOrder,
  refreshTaskContent,
  removeColumn,
  removeTask,
  reorderColumns,
  updateColumn,
  upsertTask,
} from '../utils/boardState';
import type { BoardUpdater } from './useBoard';

interface ColumnsReorderedPayload {
  projectId: string;
  columnIds: string[];
}

interface ColumnDeletedPayload {
  projectId: string;
  columnId: string;
  columnIds: string[];
}

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
    // Cột: các hàm boardState đều idempotent (column:reordered gửi cả cho người kéo)
    const onColumnCreated = (column: Column) => {
      if (column.projectId === projectId) applyUpdate((b) => addColumn(b, column));
    };
    const onColumnUpdated = (column: Column) => {
      if (column.projectId === projectId) applyUpdate((b) => updateColumn(b, column));
    };
    const onColumnsReordered = (payload: ColumnsReorderedPayload) => {
      if (payload.projectId === projectId) applyUpdate((b) => reorderColumns(b, payload.columnIds));
    };
    const onColumnDeleted = (payload: ColumnDeletedPayload) => {
      if (payload.projectId === projectId) applyUpdate((b) => removeColumn(b, payload.columnId, payload.columnIds));
    };
    // Bị xóa khỏi dự án hoặc dự án bị xóa → không còn xem được bảng này nữa
    const onAccessRevoked = (payload: { projectId: string }) => {
      if (payload.projectId === projectId) onAccessRevokedRef.current();
    };

    if (socket.connected) {
      join();
      // Bảng được tải TRƯỚC khi vào phòng, nên sự kiện phát ra trong khoảng giữa hai việc đó bị lỡ.
      // Tải lại một lần sau khi đã xin vào phòng để bù (nếu chưa kết nối thì handleReconnect sẽ làm việc này).
      reload();
    }
    socket.on('connect', handleReconnect);
    socket.on('task:created', onTaskCreated);
    socket.on('task:updated', onTaskUpdated);
    socket.on('task:moved', onTaskMoved);
    socket.on('task:deleted', onTaskDeleted);
    socket.on('column:created', onColumnCreated);
    socket.on('column:updated', onColumnUpdated);
    socket.on('column:reordered', onColumnsReordered);
    socket.on('column:deleted', onColumnDeleted);
    socket.on('project:access_revoked', onAccessRevoked);
    socket.on('project:deleted', onAccessRevoked);

    return () => {
      socket.emit('project:leave', projectId);
      socket.off('connect', handleReconnect);
      socket.off('task:created', onTaskCreated);
      socket.off('task:updated', onTaskUpdated);
      socket.off('task:moved', onTaskMoved);
      socket.off('task:deleted', onTaskDeleted);
      socket.off('column:created', onColumnCreated);
      socket.off('column:updated', onColumnUpdated);
      socket.off('column:reordered', onColumnsReordered);
      socket.off('column:deleted', onColumnDeleted);
      socket.off('project:access_revoked', onAccessRevoked);
      socket.off('project:deleted', onAccessRevoked);
    };
  }, [projectId, ready, applyUpdate, reload]);
}

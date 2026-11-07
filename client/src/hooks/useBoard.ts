/*
 * Tải và giữ dữ liệu bảng Kanban của một dự án.
 *
 * Luồng dữ liệu:
 *   1. Mở trang (hoặc bấm Thử lại) → gọi song song GET /projects/:id (tên, vai trò) và GET /projects/:id/board.
 *      Đổi dự án giữa chừng thì request cũ bị hủy (AbortController), kết quả cũ không ghi đè dự án mới.
 *   2. Thao tác (thêm cột, tạo thẻ...) → gọi API, CHỜ server trả về thành công, rồi mới cập nhật state
 *      bằng các hàm thuần trong utils/boardState.ts. Lỗi thì ném ra cho component hiển thị, state không đổi.
 *   3. Kéo thả (moveTask, moveColumn) là ngoại lệ: cập nhật tạm NGAY (optimistic) để thẻ không "nhảy về" lúc thả,
 *      rồi lấy kết quả server làm chuẩn; lỗi thì hoàn lại. Xem comment ở moveTask.
 *   4. `applyUpdate` cho phép bên ngoài (Tuần 4 kéo thả, Tuần 7 sự kiện realtime) áp một hàm thuần bất kỳ.
 *
 * "Đang tải" suy ra từ việc dữ liệu đang có thuộc về request nào (`data.key !== requestKey`),
 * giống ProjectsPage, để không phải setState đồng bộ trong effect.
 */
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { getBoard } from '../api/board';
import * as columnsApi from '../api/columns';
import { getProject } from '../api/projects';
import * as tasksApi from '../api/tasks';
import type { Board, ColumnTaskOrder, Project } from '../types';
import {
  addColumn,
  applyTaskOrder,
  findTask,
  moveTaskLocal,
  removeColumn,
  reorderColumns,
  updateColumn,
  upsertTask,
} from '../utils/boardState';

type Loaded =
  | { key: string; project: Project; board: Board; error?: undefined }
  | { key: string; project?: undefined; board?: undefined; error: unknown };

export type BoardUpdater = (board: Board) => Board;

export function useBoard(projectId: string) {
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<Loaded | null>(null);
  // Thẻ / cột đang chờ server trả lời sau khi kéo thả (hiện "Đang lưu…", tạm khóa không cho kéo tiếp)
  const [savingTaskIds, setSavingTaskIds] = useState<ReadonlySet<string>>(() => new Set());
  const [savingColumnIds, setSavingColumnIds] = useState<ReadonlySet<string>>(() => new Set());
  const requestKey = `${projectId}#${reloadKey}`;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([getProject(projectId, { signal }), getBoard(projectId, {}, { signal })])
      .then(([project, board]) => setData({ key: requestKey, project, board }))
      .catch((err: unknown) => {
        if (signal.aborted) return;
        setData({ key: requestKey, error: err });
      });
    return () => controller.abort();
  }, [projectId, requestKey]);

  const loading = data?.key !== requestKey;
  // Dữ liệu của dự án khác (vừa chuyển trang) thì không hiển thị
  const current = data && data.key.startsWith(`${projectId}#`) ? data : null;

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  /** Áp một hàm thuần lên board hiện tại. Chưa tải xong hoặc đang lỗi thì bỏ qua. */
  const applyUpdate = useCallback((updater: BoardUpdater) => {
    setData((prev) => (prev?.board ? { ...prev, board: updater(prev.board) } : prev));
  }, []);

  // ---------- Thao tác: gọi API xong mới đổi state ----------

  const createColumn = useCallback(
    async (name: string) => {
      const column = await columnsApi.createColumn(projectId, { name });
      applyUpdate((b) => addColumn(b, column));
      return column;
    },
    [projectId, applyUpdate],
  );

  const renameColumn = useCallback(
    async (columnId: string, name: string) => {
      const column = await columnsApi.updateColumn(projectId, columnId, { name });
      applyUpdate((b) => updateColumn(b, column));
    },
    [projectId, applyUpdate],
  );

  const setColumnDone = useCallback(
    async (columnId: string, isDone: boolean) => {
      const column = await columnsApi.updateColumn(projectId, columnId, { isDone });
      applyUpdate((b) => updateColumn(b, column));
    },
    [projectId, applyUpdate],
  );

  const deleteColumn = useCallback(
    async (columnId: string) => {
      try {
        await columnsApi.deleteColumn(projectId, columnId);
      } catch (err) {
        // 404: cột đã bị người khác xóa trước → coi như xong, bỏ khỏi bảng luôn
        if (!(err instanceof ApiError && err.code === 'NOT_FOUND')) throw err;
      }
      applyUpdate((b) => removeColumn(b, columnId));
    },
    [projectId, applyUpdate],
  );

  const createTask = useCallback(
    async (columnId: string, title: string) => {
      const task = await tasksApi.createTask(projectId, { columnId, title });
      applyUpdate((b) => upsertTask(b, task));
      return task;
    },
    [projectId, applyUpdate],
  );

  // ---------- Kéo thả: cập nhật tạm trước, server quyết định sau ----------

  const board = current?.board ?? null;

  /*
   * Kéo thẻ `taskId` sang cột `toColumnId`, vị trí `toIndex` (tính sau khi đã bỏ thẻ khỏi cột cũ, giống server).
   *
   * Vì sao KHÔNG tin vị trí tạm ở client mà phải lấy `columns` server trả về:
   *   - Client chỉ thấy bảng tại lúc tải. Trong lúc mình kéo, người khác có thể vừa thêm / xóa / kéo thẻ khác trong
   *     cùng cột, nên "vị trí 2" mình tính ra có thể đã khác "vị trí 2" trên server.
   *   - Khi bảng đang lọc (Tuần 6) client chỉ có một phần số thẻ, chỉ server biết thứ tự đầy đủ.
   *   - Server xếp lại cả cột trong một transaction và trả `taskIds` của cột nguồn + cột đích: đây là thứ tự
   *     mọi người khác cũng nhận (qua sự kiện task:moved). Áp nó làm chuẩn thì mọi máy hiển thị giống nhau,
   *     và vị trí tạm sai (nếu có) tự được sửa. applyTaskOrder idempotent nên nhận thêm task:moved của chính
   *     mình (Tuần 7) cũng không sao.
   *
   * Vị trí tạm chỉ để giao diện mượt; thẻ được đánh dấu "đang lưu" cho tới khi server trả lời,
   * không coi là thành công trước đó. Lỗi → hoàn lại thứ tự cũ của đúng hai cột bị ảnh hưởng rồi ném lỗi
   * cho trang báo người dùng.
   */
  const moveTask = useCallback(
    async (taskId: string, toColumnId: string, toIndex: number) => {
      if (!board) return;
      const task = findTask(board, taskId);
      const from = board.columns.find((c) => c.id === task?.columnId);
      if (!task || !from) return;
      // Thả lại đúng chỗ cũ → không gọi API
      if (from.id === toColumnId && from.tasks.findIndex((t) => t.id === taskId) === toIndex) return;

      // Ghi lại thứ tự hai cột TRƯỚC khi kéo để hoàn lại khi lỗi. Chỉ hoàn lại hai cột này (không chụp cả bảng)
      // để không xóa mất thay đổi khác vừa đến trong lúc chờ (ví dụ người khác tạo thẻ ở cột thứ ba).
      const previous: ColumnTaskOrder[] = board.columns
        .filter((c) => c.id === from.id || c.id === toColumnId)
        .map((c) => ({ columnId: c.id, taskIds: c.tasks.map((t) => t.id) }));

      applyUpdate((b) => moveTaskLocal(b, taskId, toColumnId, toIndex));
      setSavingTaskIds((s) => new Set(s).add(taskId));
      try {
        const result = await tasksApi.moveTask(projectId, taskId, toColumnId, toIndex);
        applyUpdate((b) => applyTaskOrder(b, result.columns, result.task));
      } catch (err) {
        // `task` là bản cũ (columnId, isOverdue cũ) nên đưa thẻ về y như trước khi kéo
        applyUpdate((b) => applyTaskOrder(b, previous, task));
        throw err;
      } finally {
        setSavingTaskIds((s) => {
          const next = new Set(s);
          next.delete(taskId);
          return next;
        });
      }
    },
    [projectId, board, applyUpdate],
  );

  /** Sắp xếp lại cột: cùng cách làm với moveTask, server trả `columnIds` là thứ tự chuẩn. */
  const moveColumn = useCallback(
    async (columnId: string, toIndex: number) => {
      if (!board) return;
      const previousIds = board.columns.map((c) => c.id);
      const fromIndex = previousIds.indexOf(columnId);
      if (fromIndex < 0 || fromIndex === toIndex) return;

      const tempIds = previousIds.filter((id) => id !== columnId);
      tempIds.splice(toIndex, 0, columnId);

      applyUpdate((b) => reorderColumns(b, tempIds));
      setSavingColumnIds((s) => new Set(s).add(columnId));
      try {
        const columnIds = await columnsApi.moveColumn(projectId, columnId, toIndex);
        applyUpdate((b) => reorderColumns(b, columnIds));
      } catch (err) {
        applyUpdate((b) => reorderColumns(b, previousIds));
        throw err;
      } finally {
        setSavingColumnIds((s) => {
          const next = new Set(s);
          next.delete(columnId);
          return next;
        });
      }
    },
    [projectId, board, applyUpdate],
  );

  return {
    project: current?.project ?? null,
    board,
    /** Lỗi của lần tải gần nhất (ApiError hoặc lỗi khác) */
    error: !loading ? (current?.error ?? null) : null,
    loading,
    reload,
    applyUpdate,
    createColumn,
    renameColumn,
    setColumnDone,
    deleteColumn,
    createTask,
    moveTask,
    moveColumn,
    savingTaskIds,
    savingColumnIds,
  };
}

/*
 * Tải và giữ dữ liệu bảng Kanban của một dự án (kèm bộ lọc lấy từ URL, xem utils/boardFilter.ts).
 *
 * Luồng dữ liệu:
 *   1. Mở trang → GET /projects/:id (tên, vai trò; effect riêng, chỉ phụ thuộc projectId) và
 *      GET /projects/:id/board?<bộ lọc> (effect phụ thuộc dự án + lần tải lại + bộ lọc).
 *      Đổi lọc chỉ gọi lại /board. Đổi dự án / đổi lọc giữa chừng thì request cũ bị hủy (AbortController),
 *      kết quả cũ không ghi đè kết quả mới.
 *   2. Thao tác (thêm cột, tạo thẻ...) → gọi API, CHỜ server trả về thành công, rồi mới cập nhật state
 *      bằng các hàm thuần trong utils/boardState.ts. Lỗi thì ném ra cho component hiển thị, state không đổi.
 *   3. Kéo thả (moveTask, moveColumn) là ngoại lệ: cập nhật tạm NGAY (optimistic) để thẻ không "nhảy về" lúc thả,
 *      rồi lấy kết quả server làm chuẩn; lỗi thì hoàn lại. Xem comment ở moveTask.
 *   4. `applyUpdate` cho phép bên ngoài (kéo thả, sự kiện realtime) áp một hàm thuần bất kỳ.
 *
 * "Đang tải" suy ra từ việc dữ liệu đang có thuộc về request nào (`data.key !== requestKey`),
 * giống ProjectsPage, để không phải setState đồng bộ trong effect.
 *
 * Khi đổi bộ lọc, bảng cũ vẫn hiện (spinner nhỏ) cho tới khi bảng mới về, để thanh lọc và bảng không nhảy.
 * Nếu lần tải mới LỖI mà đã có bảng của cùng dự án thì giữ bảng cũ và trả `filterError` (không làm `board = null`),
 * nếu không BoardPage sẽ thay cả trang bằng màn lỗi và thanh lọc biến mất, người dùng không còn cách "Xóa lọc".
 */
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { getBoard, type BoardFilter } from '../api/board';
import * as columnsApi from '../api/columns';
import { getProject } from '../api/projects';
import * as tasksApi from '../api/tasks';
import type { Board, ColumnTaskOrder, Project, Task } from '../types';
import {
  addColumn,
  applyTaskOrder,
  findTask,
  moveTaskLocal,
  refreshTaskContent,
  removeColumn,
  removeTask,
  reorderColumns,
  updateColumn,
  upsertTask,
} from '../utils/boardState';
import { filterKey, isFilterActive } from '../utils/boardFilter';

interface LoadedBoard {
  key: string;
  projectId: string;
  /** Request đã tải ra `board` có lọc hay không (bảng đang hiện có thể là bảng lọc của lần trước) */
  filtered: boolean;
  board: Board;
  error?: undefined;
  /** Lần tải gần nhất lỗi nhưng vẫn giữ `board` của lần tốt trước đó */
  filterError?: unknown;
}
interface FailedBoard {
  key: string;
  projectId: string;
  board?: undefined;
  error: unknown;
  filterError?: undefined;
}
type BoardData = LoadedBoard | FailedBoard;

type ProjectData =
  | { projectId: string; project: Project; error?: undefined }
  | { projectId: string; project?: undefined; error: unknown };

export type BoardUpdater = (board: Board) => Board;

export function useBoard(projectId: string, filter: BoardFilter) {
  const [reloadKey, setReloadKey] = useState(0);
  const [projectRetryKey, setProjectRetryKey] = useState(0);
  const [data, setData] = useState<BoardData | null>(null);
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  // Thẻ / cột đang chờ server trả lời sau khi kéo thả (hiện "Đang lưu…", tạm khóa không cho kéo tiếp)
  const [savingTaskIds, setSavingTaskIds] = useState<ReadonlySet<string>>(() => new Set());
  const [savingColumnIds, setSavingColumnIds] = useState<ReadonlySet<string>>(() => new Set());

  // Effect phụ thuộc CHUỖI khóa chứ không phải object `filter` (object mới ở mỗi lần render sẽ gọi API liên tục)
  const fKey = filterKey(filter);
  const filterActive = isFilterActive(filter);
  const requestKey = `${projectId}#${reloadKey}#${fKey}`;

  // Tên + vai trò dự án: không phụ thuộc bộ lọc nên đổi lọc không gọi lại
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    getProject(projectId, { signal })
      .then((project) => {
        if (!signal.aborted) setProjectData({ projectId, project });
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setProjectData({ projectId, error: err });
      });
    return () => controller.abort();
  }, [projectId, projectRetryKey]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    getBoard(projectId, filter, { signal })
      .then((board) => {
        if (signal.aborted) return;
        setData({ key: requestKey, projectId, filtered: filterActive || board.filtered, board });
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        setData((prev) => {
          // 404 = mất quyền / dự án đã xóa → luôn là lỗi toàn trang, không giữ bảng cũ
          const isNotFound = err instanceof ApiError && err.code === 'NOT_FOUND';
          if (!isNotFound && prev?.board && prev.projectId === projectId) {
            return { ...prev, key: requestKey, filterError: err };
          }
          return { key: requestKey, projectId, error: err };
        });
      });
    return () => controller.abort();
    // `filter` và `filterActive` được đại diện bởi `requestKey` (chứa filterKey); đưa object vào deps sẽ tải lại vô tận
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, requestKey]);

  const loading = data?.key !== requestKey;
  // Dữ liệu của dự án khác (vừa chuyển trang) thì không hiển thị
  const current = data && data.projectId === projectId ? data : null;
  const project = projectData?.projectId === projectId ? (projectData.project ?? null) : null;
  const projectError = projectData?.projectId === projectId ? (projectData.error ?? null) : null;

  /**
   * Bảng đang hiện KHÔNG chắc đầy đủ thẻ: URL đang lọc, hoặc bảng đang hiện là kết quả của một request có lọc
   * (vừa xóa lọc nhưng bảng không lọc chưa về). Mọi hành vi "cẩn thận" (tắt kéo thả, realtime tải lại,
   * tạo thẻ rồi tải lại) dựa vào cờ này, không dựa vào `board.filtered`, để có hiệu lực ngay lúc đổi lọc.
   */
  const boardPartial = filterActive || (current?.board ? current.filtered : false);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  /** "Thử lại" của màn lỗi toàn trang: tải lại cả thông tin dự án lẫn bảng. */
  const retry = useCallback(() => {
    // Xóa kết quả lỗi cũ để trang quay về spinner ngay, thay vì giữ màn lỗi cho tới khi có kết quả mới
    setProjectData(null);
    setData(null);
    setReloadKey((k) => k + 1);
    setProjectRetryKey((k) => k + 1);
  }, []);

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
      if (boardPartial) {
        // Bảng đang lọc: thẻ mới có thể không khớp bộ lọc nên không tự chèn vào bảng (sẽ hiện sai chỗ).
        // Tải lại để server quyết định thẻ có hiện hay không.
        reload();
      } else {
        applyUpdate((b) => upsertTask(b, task));
      }
      return task;
    },
    [projectId, boardPartial, applyUpdate, reload],
  );

  /**
   * Sửa thẻ (chi tiết thẻ). `input.version` là version của bản người dùng bắt đầu sửa.
   * 409 VERSION_CONFLICT được ném nguyên cho chi tiết thẻ xử lý (giữ bản nháp, cho người dùng chọn).
   */
  const updateTask = useCallback(
    async (taskId: string, input: tasksApi.UpdateTaskInput) => {
      const task = await tasksApi.updateTask(projectId, taskId, input);
      // refreshTaskContent (không phải upsertTask): giữ vị trí đang có trên bảng, vì thẻ có thể đang được chuyển cột
      // và kết quả PATCH mang cột cũ; cũng không thêm thẻ vào bảng nếu bảng không có nó (đang lọc)
      applyUpdate((b) => refreshTaskContent(b, task));
      return task;
    },
    [projectId, applyUpdate],
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      try {
        await tasksApi.deleteTask(projectId, taskId);
      } catch (err) {
        // 404: thẻ đã bị người khác xóa trước → coi như xong
        if (!(err instanceof ApiError && err.code === 'NOT_FOUND')) throw err;
      }
      applyUpdate((b) => removeTask(b, taskId));
    },
    [projectId, applyUpdate],
  );

  /** Áp bản thẻ đọc riêng (GET /tasks/:id, bản mới nhất trong lỗi 409) lên bảng; xem refreshTaskContent. */
  const refreshTask = useCallback((task: Task) => applyUpdate((b) => refreshTaskContent(b, task)), [applyUpdate]);

  /** Bỏ thẻ khỏi bảng khi biết chắc nó không còn trên server (GET /tasks/:id trả 404). */
  const forgetTask = useCallback((taskId: string) => applyUpdate((b) => removeTask(b, taskId)), [applyUpdate]);

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
        // Vị trí theo server; nội dung thẻ chỉ lấy khi không cũ hơn bản đang có (trong lúc chờ có thể vừa lưu
        // chỉnh sửa ở chi tiết thẻ, version đã tăng — không để kết quả move ghi đè)
        applyUpdate((b) => refreshTaskContent(applyTaskOrder(b, result.columns), result.task));
      } catch (err) {
        // Chỉ hoàn lại VỊ TRÍ (thứ tự hai cột; columnId, isOverdue tính lại theo cột). Không đưa nội dung thẻ về
        // bản chụp lúc kéo, vì trong lúc chờ thẻ có thể đã được lưu chỉnh sửa (version mới hơn).
        applyUpdate((b) => applyTaskOrder(b, previous));
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

  /*
   * Chuyển thẻ xuống CUỐI cột `toColumnId` (ô "Chuyển sang cột…" của chi tiết thẻ).
   *
   * - Bảng đầy đủ và có thẻ trên bảng: dùng lại moveTask (cùng cách với kéo thả).
   * - Bảng đang lọc (hoặc thẻ không có trên bảng vì bị bộ lọc ẩn): client không biết cột đích có bao nhiêu thẻ,
   *   `toIndex` tính trên danh sách đã lọc sẽ lệch. Gửi số rất lớn: server kẹp (clamp) về cuối cột.
   *   Sau đó tải lại bảng vì thẻ có thể không còn khớp bộ lọc (ví dụ lọc "Quá hạn" rồi chuyển sang cột hoàn thành).
   *   Trả về bản thẻ mới của server để chi tiết thẻ biết cột mới dù thẻ không có trên bảng.
   * Lỗi luôn được ném ra; không bao giờ resolve mà không làm gì (chi tiết thẻ sẽ tưởng đã thành công).
   */
  const moveTaskToEnd = useCallback(
    async (taskId: string, toColumnId: string): Promise<Task | undefined> => {
      const onBoard = board ? findTask(board, taskId) : undefined;
      if (board && !boardPartial && onBoard) {
        const target = board.columns.find((c) => c.id === toColumnId);
        if (!target) throw new Error('Cột đích không còn trên bảng.');
        await moveTask(taskId, toColumnId, target.tasks.filter((t) => t.id !== taskId).length);
        return undefined;
      }
      // Đánh dấu "đang lưu" như kéo thả, để không có hai lệnh move chồng nhau cho cùng một thẻ
      setSavingTaskIds((s) => new Set(s).add(taskId));
      try {
        const result = await tasksApi.moveTask(projectId, taskId, toColumnId, Number.MAX_SAFE_INTEGER);
        // Không truyền movedTask cho applyTaskOrder: thẻ vắng mặt trên bảng không được chèn vào
        applyUpdate((b) => refreshTaskContent(applyTaskOrder(b, result.columns), result.task));
        reload();
        return result.task;
      } finally {
        setSavingTaskIds((s) => {
          const next = new Set(s);
          next.delete(taskId);
          return next;
        });
      }
    },
    [projectId, board, boardPartial, moveTask, applyUpdate, reload],
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
    project,
    board,
    /** Lỗi toàn trang: lần tải đầu của dự án thất bại (hoặc 404), hoặc không tải được thông tin dự án */
    error: projectError ?? (!loading ? (current?.error ?? null) : null),
    /** Lỗi của lần tải bảng mới nhất nhưng vẫn còn bảng cũ để hiện (xem đầu file) */
    filterError: !loading ? (current?.filterError ?? null) : null,
    loading,
    /** URL đang có bộ lọc (dùng cho giao diện) */
    filterActive,
    /** Bảng đang hiện có thể thiếu thẻ (dùng cho mọi hành vi an toàn: kéo thả, realtime, tạo thẻ) */
    boardPartial,
    reload,
    retry,
    applyUpdate,
    createColumn,
    renameColumn,
    setColumnDone,
    deleteColumn,
    createTask,
    updateTask,
    deleteTask,
    refreshTask,
    forgetTask,
    moveTask,
    moveTaskToEnd,
    moveColumn,
    savingTaskIds,
    savingColumnIds,
  };
}

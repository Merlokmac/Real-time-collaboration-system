/*
 * Các hàm thuần cập nhật state bảng: nhận Board cũ, trả về Board MỚI (không sửa object cũ),
 * để React thấy state đổi và vẽ lại. Không gọi API, không đọc gì bên ngoài.
 *
 * Dùng ở 3 nơi:
 *   - Tuần 3: sau khi API trả về thành công (thêm cột, tạo thẻ...)
 *   - Tuần 4: kéo thả (moveTaskLocal / reorderColumns để hiện tạm, rồi applyTaskOrder theo kết quả server)
 *   - Tuần 7: sự kiện realtime (column:created, task:moved...) — payload của sự kiện khớp đúng tham số các hàm này
 *
 * Mọi hàm đều IDEMPOTENT: áp dụng cùng một thay đổi hai lần cho ra cùng kết quả. Cần vì người thao tác vừa
 * nhận phản hồi API vừa có thể nhận sự kiện socket của chính thao tác đó (task:moved, column:reordered
 * luôn được gửi cho cả người kéo). Ví dụ addColumn với cột đã có thì chỉ thay, không thêm bản thứ hai.
 */
import type { Board, BoardColumn, Column, ColumnTaskOrder, Task } from '../types';

// ---------- Tiện ích nội bộ ----------

/**
 * isOverdue do server tính khi trả thẻ: có hạn, hạn đã qua, và thẻ KHÔNG ở cột hoàn thành.
 * Khi thẻ đổi cột ở client (kéo thả) hoặc cột đổi cờ isDone, giá trị cũ không còn đúng
 * nên tính lại theo đúng luật đó. Lần tải bảng sau, server sẽ trả giá trị chuẩn.
 */
function withOverdue(task: Task, column: Column, now = Date.now()): Task {
  const isOverdue = !!task.dueDate && new Date(task.dueDate).getTime() < now && !column.isDone;
  return isOverdue === task.isOverdue ? task : { ...task, isOverdue };
}

/** Sắp lại `items` theo danh sách id; id không có trong `items` thì bỏ qua, phần tử không có trong `ids` thì bỏ đi. */
function orderByIds<T extends { id: string }>(items: T[], ids: string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.map((id) => byId.get(id)).filter((item): item is T => item !== undefined);
}

function mapColumn(board: Board, columnId: string, fn: (column: BoardColumn) => BoardColumn): Board {
  let changed = false;
  const columns = board.columns.map((column) => {
    if (column.id !== columnId) return column;
    changed = true;
    return fn(column);
  });
  return changed ? { ...board, columns } : board;
}

export function findTask(board: Board, taskId: string): Task | undefined {
  for (const column of board.columns) {
    const task = column.tasks.find((t) => t.id === taskId);
    if (task) return task;
  }
  return undefined;
}

// ---------- Cột ----------

/** Thêm cột mới vào cuối bảng (cột đã có thì cập nhật). Dùng cho POST /columns và sự kiện column:created. */
export function addColumn(board: Board, column: Column): Board {
  if (board.columns.some((c) => c.id === column.id)) return updateColumn(board, column);
  return { ...board, columns: [...board.columns, { ...column, tasks: [] }] };
}

/** Đổi tên / cờ isDone; giữ nguyên danh sách thẻ. Dùng cho PATCH /columns và column:updated. */
export function updateColumn(board: Board, column: Column): Board {
  return mapColumn(board, column.id, (old) => ({
    ...old,
    ...column,
    // Đổi cờ "cột hoàn thành" làm đổi trạng thái quá hạn của mọi thẻ trong cột
    tasks: old.isDone === column.isDone ? old.tasks : old.tasks.map((t) => withOverdue(t, column)),
  }));
}

/**
 * Xóa cột. `columnIds` (nếu có) là thứ tự cột còn lại server trả trong sự kiện column:deleted.
 * Cột bị xóa luôn trống (server chặn xóa cột còn thẻ) nên không cần xử lý thẻ.
 */
export function removeColumn(board: Board, columnId: string, columnIds?: string[]): Board {
  const rest = board.columns.filter((c) => c.id !== columnId);
  const columns = columnIds ? orderByIds(rest, columnIds) : rest;
  return { ...board, columns };
}

/** Sắp lại cột theo thứ tự server trả (POST /columns/:id/move, sự kiện column:reordered). */
export function reorderColumns(board: Board, columnIds: string[]): Board {
  const columns = orderByIds(board.columns, columnIds);
  // Phòng khi client có cột mà danh sách server chưa có (vừa tạo xong): giữ lại ở cuối, không làm mất
  const missing = board.columns.filter((c) => !columnIds.includes(c.id));
  return { ...board, columns: [...columns, ...missing] };
}

// ---------- Thẻ ----------

/**
 * Thêm hoặc cập nhật một thẻ (POST /tasks, PATCH /tasks/:id, sự kiện task:created / task:updated).
 *   - Thẻ đã có trong đúng cột → thay tại chỗ, giữ vị trí.
 *   - Thẻ chưa có → thêm vào cuối cột `task.columnId` (server luôn đặt thẻ mới ở cuối).
 *   - Thẻ có nhưng ở cột khác (hiếm, ví dụ sự kiện đến lệch thứ tự) → chuyển sang cuối cột mới.
 */
export function upsertTask(board: Board, task: Task): Board {
  const current = findTask(board, task.id);
  if (current && current.columnId === task.columnId) {
    return mapColumn(board, task.columnId, (column) => ({
      ...column,
      tasks: column.tasks.map((t) => (t.id === task.id ? task : t)),
    }));
  }
  const without = current ? removeTask(board, task.id) : board;
  return mapColumn(without, task.columnId, (column) => ({ ...column, tasks: [...column.tasks, task] }));
}

/**
 * Xóa thẻ (DELETE /tasks/:id, sự kiện task:deleted). Nếu có `order` (columnId + taskIds từ sự kiện)
 * thì sắp lại cột đó theo thứ tự server.
 */
export function removeTask(board: Board, taskId: string, order?: ColumnTaskOrder): Board {
  let next: Board = {
    ...board,
    columns: board.columns.map((column) =>
      column.tasks.some((t) => t.id === taskId)
        ? { ...column, tasks: column.tasks.filter((t) => t.id !== taskId) }
        : column,
    ),
  };
  if (order) next = applyTaskOrder(next, [order]);
  return next;
}

/**
 * Di chuyển tạm một thẻ ở client (optimistic, Tuần 4 kéo thả và ô "Chuyển sang cột…").
 * `toIndex` tính trong cột đích SAU KHI đã bỏ thẻ ra khỏi cột cũ — cùng cách hiểu với POST /tasks/:id/move.
 * Thẻ hoặc cột không tồn tại → trả nguyên board.
 */
export function moveTaskLocal(board: Board, taskId: string, toColumnId: string, toIndex: number): Board {
  const task = findTask(board, taskId);
  const target = board.columns.find((c) => c.id === toColumnId);
  if (!task || !target) return board;

  const moved = withOverdue({ ...task, columnId: toColumnId }, target);
  const without = removeTask(board, taskId);
  return mapColumn(without, toColumnId, (column) => {
    const tasks = [...column.tasks];
    tasks.splice(Math.max(0, Math.min(toIndex, tasks.length)), 0, moved);
    return { ...column, tasks };
  });
}

/**
 * Áp thứ tự thẻ server trả về làm chuẩn (kết quả POST /tasks/:id/move, sự kiện task:moved).
 * `movedTask` là bản mới của thẻ vừa kéo (columnId, version, isOverdue mới).
 *
 * Cách làm: gom mọi thẻ đang có thành một bảng tra theo id, rồi dựng lại từng cột trong `orders`
 * đúng theo `taskIds`. Vì chỉ dựa vào dữ liệu server nên áp lại bao nhiêu lần cũng ra một kết quả,
 * và tự sửa được vị trí tạm sai của client.
 * id nào client không có (ví dụ đang lọc, thẻ bị ẩn) thì bỏ qua.
 */
export function applyTaskOrder(board: Board, orders: ColumnTaskOrder[], movedTask?: Task): Board {
  const byId = new Map<string, Task>();
  for (const column of board.columns) for (const t of column.tasks) byId.set(t.id, t);
  if (movedTask) byId.set(movedTask.id, movedTask);

  const orderOf = new Map(orders.map((o) => [o.columnId, o.taskIds]));
  // Thẻ đã được xếp vào một cột trong `orders` thì phải bỏ khỏi các cột khác (tránh hiện hai nơi)
  const placed = new Set(orders.flatMap((o) => o.taskIds));

  return {
    ...board,
    columns: board.columns.map((column) => {
      const ids = orderOf.get(column.id);
      if (!ids) {
        return column.tasks.some((t) => placed.has(t.id))
          ? { ...column, tasks: column.tasks.filter((t) => !placed.has(t.id)) }
          : column;
      }
      const tasks = ids
        .map((id) => byId.get(id))
        .filter((t): t is Task => t !== undefined)
        .map((t) => withOverdue({ ...t, columnId: column.id }, column));
      return { ...column, tasks };
    }),
  };
}

/*
 * Bản nháp khi sửa thẻ trong chi tiết thẻ.
 *
 * Chưa sửa gì → hiển thị thẳng thẻ hiện tại (`task`), không có bản nháp. Thẻ đổi ở nơi khác (tải lại, realtime)
 * thì giao diện đổi theo ngay.
 * Bắt đầu sửa → tạo bản nháp và ghi lại `base`: bản thẻ tại lúc bắt đầu sửa. Khi lưu, gửi `base.version`
 * và chỉ những trường khác `base`. Nếu trong lúc đó người khác đã lưu, server thấy version lệch và trả 409.
 *
 * Vì sao giữ `base` thay vì so với `task` mới nhất: nếu so với bản mới nhất thì thay đổi của người khác bị
 * coi như của mình và bị ghi đè âm thầm. Giữ `base` thì mọi xung đột đều đi qua 409 để người dùng tự chọn.
 */
import { useState } from 'react';
import type { UpdateTaskInput } from '../api/tasks';
import type { Task } from '../types';

export interface TaskDraft {
  title: string;
  assigneeId: string | null;
  /** "YYYY-MM-DD" (giá trị của <input type="date">), '' là không có hạn */
  dueDate: string;
  /** Đã sắp xếp, để so sánh không phụ thuộc thứ tự */
  labelIds: string[];
}

export type TaskChanges = Omit<UpdateTaskInput, 'version'>;

export function draftOf(task: Task): TaskDraft {
  return {
    title: task.title,
    assigneeId: task.assigneeId,
    // Server lưu hạn là 00:00 UTC của ngày đó, nên 10 ký tự đầu của chuỗi ISO chính là ngày
    dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
    labelIds: task.labels.map((l) => l.id).sort(),
  };
}

/** Các trường của `draft` khác `base`, đúng dạng body PATCH (không có version). */
export function changesBetween(draft: TaskDraft, base: Task): TaskChanges {
  const original = draftOf(base);
  const changes: TaskChanges = {};
  const title = draft.title.trim();
  if (title !== original.title) changes.title = title;
  if (draft.assigneeId !== original.assigneeId) changes.assigneeId = draft.assigneeId;
  // Gửi "YYYY-MM-DD"; server đọc thành 00:00 UTC của ngày đó
  if (draft.dueDate !== original.dueDate) changes.dueDate = draft.dueDate || null;
  if (draft.labelIds.join() !== original.labelIds.join()) changes.labelIds = draft.labelIds;
  return changes;
}

/** Bản nháp còn khác bản gốc không (so nguyên văn, kể cả khoảng trắng đang gõ dở ở cuối tiêu đề). */
function differs(draft: TaskDraft, base: Task): boolean {
  const original = draftOf(base);
  return (Object.keys(draft) as (keyof TaskDraft)[]).some((key) => String(draft[key]) !== String(original[key]));
}

type Editing = { base: Task; draft: TaskDraft };

export function useTaskDraft(task: Task | undefined) {
  const [editing, setEditing] = useState<Editing | null>(null);
  // Bỏ qua bản nháp khi: là của thẻ khác (vừa đổi thẻ đang mở), hoặc đã được sửa về y như bản gốc.
  // Trường hợp sau nếu vẫn giữ thì form sẽ hiện mãi bản gốc cũ thay vì thẻ mới nhất, và lần sửa sau
  // gửi version cũ → 409 giả.
  const active = editing && task && editing.base.id === task.id && differs(editing.draft, editing.base) ? editing : null;
  const changes = active ? changesBetween(active.draft, active.base) : {};

  /** Sửa bản nháp bằng một hàm nhận bản nháp MỚI NHẤT (không dùng giá trị đã đóng gói lúc render). */
  function updateDraft(fn: (draft: TaskDraft) => TaskDraft) {
    if (!task) return;
    setEditing((prev) => {
      // Không có bản nháp còn hiệu lực → bắt đầu bản nháp mới từ thẻ MỚI NHẤT (base = thẻ hiện tại)
      const keep = prev && prev.base.id === task.id && differs(prev.draft, prev.base);
      const current: Editing = keep ? prev : { base: task, draft: draftOf(task) };
      return { ...current, draft: fn(current.draft) };
    });
  }

  function setField<K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) {
    updateDraft((draft) => ({ ...draft, [key]: value }));
  }

  /**
   * Thêm một nhãn vào bản nháp. Dùng sau khi `await` tạo nhãn: người dùng có thể đã tick nhãn khác trong lúc chờ,
   * nên phải đọc bản nháp mới nhất (hàm cập nhật của setState) chứ không dùng `values.labelIds` lúc bấm.
   */
  function addLabelId(labelId: string) {
    updateDraft((draft) =>
      draft.labelIds.includes(labelId) ? draft : { ...draft, labelIds: [...draft.labelIds, labelId].sort() },
    );
  }

  return {
    /** Giá trị đang hiển thị trên form */
    values: active?.draft ?? (task ? draftOf(task) : null),
    /** Bản thẻ lúc bắt đầu sửa (undefined khi chưa sửa) */
    base: active?.base,
    changes,
    dirty: Object.keys(changes).length > 0,
    setField,
    addLabelId,
    /** Bỏ bản nháp, quay về hiển thị thẻ hiện tại */
    reset: () => setEditing(null),
  };
}

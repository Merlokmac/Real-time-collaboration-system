/*
 * TaskCard có gắn kéo thả (dnd-kit useSortable).
 *
 * `data.type = 'task'` để Board phân biệt đang kéo thẻ hay kéo cột (cả hai cùng nằm trong một DndContext).
 * Thẻ đang chờ server ("đang lưu") bị khóa kéo, để không gửi hai lệnh move chồng nhau cho cùng một thẻ.
 * Bảng đang lọc (`dragDisabled`) cũng khóa kéo: client chỉ có một phần số thẻ nên `toIndex` sẽ lệch với server.
 * Thẻ vẫn click / Enter để mở được.
 */
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../../types';
import { TaskCard } from './TaskCard';

interface SortableTaskCardProps {
  task: Task;
  onOpen: (task: Task) => void;
  saving: boolean;
  /** Khóa kéo (bảng đang lọc) */
  dragDisabled?: boolean;
}

export function SortableTaskCard({ task, onOpen, saving, dragDisabled = false }: SortableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task' },
    disabled: saving || dragDisabled,
  });

  return (
    <TaskCard
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // Khóa kéo: bỏ các thuộc tính/sự kiện kéo (role, aria-roledescription "có thể kéo", phím Space nhấc thẻ)
      attributes={dragDisabled ? undefined : attributes}
      listeners={dragDisabled ? undefined : listeners}
      task={task}
      onOpen={onOpen}
      placeholder={isDragging}
      saving={saving}
    />
  );
}

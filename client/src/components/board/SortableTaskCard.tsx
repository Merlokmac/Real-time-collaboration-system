/*
 * TaskCard có gắn kéo thả (dnd-kit useSortable).
 *
 * `data.type = 'task'` để Board phân biệt đang kéo thẻ hay kéo cột (cả hai cùng nằm trong một DndContext).
 * Thẻ đang chờ server ("đang lưu") bị khóa kéo, để không gửi hai lệnh move chồng nhau cho cùng một thẻ.
 */
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../../types';
import { TaskCard } from './TaskCard';

interface SortableTaskCardProps {
  task: Task;
  onOpen: (task: Task) => void;
  saving: boolean;
}

export function SortableTaskCard({ task, onOpen, saving }: SortableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task' },
    disabled: saving,
  });

  return (
    <TaskCard
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      attributes={attributes}
      listeners={listeners}
      task={task}
      onOpen={onOpen}
      placeholder={isDragging}
      saving={saving}
    />
  );
}

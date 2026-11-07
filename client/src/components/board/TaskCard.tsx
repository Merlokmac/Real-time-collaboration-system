/*
 * Một thẻ công việc trên bảng: nhãn, tiêu đề, một dòng mô tả, hạn, người phụ trách.
 *
 * Dùng <div role="button"> thay vì <button> vì trong thẻ có nhiều khối (nhãn, đoạn văn) mà <button>
 * không được chứa. dnd-kit (SortableTaskCard) gắn thuộc tính kéo thả lên chính phần tử này.
 * Bàn phím: Enter mở thẻ; Space nhấc thẻ lên để kéo (mũi tên di chuyển, Space/Enter thả, Esc hủy).
 *
 * Component này chỉ vẽ, không gọi useSortable, để DragOverlay dùng lại được cho bản "bay theo con trỏ".
 *
 * Trạng thái quá hạn lấy từ `task.isOverdue` server tính (đã loại trừ thẻ ở cột hoàn thành), client không tự đoán.
 */
import type { CSSProperties, KeyboardEvent, Ref } from 'react';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import type { Task } from '../../types';
import { textColorOn } from '../../utils/color';
import { formatDate } from '../../utils/format';
import { Avatar } from '../common/Avatar';
import styles from './TaskCard.module.css';

interface TaskCardProps {
  task: Task;
  onOpen?: (task: Task) => void;
  ref?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  /** Thuộc tính và sự kiện kéo thả từ useSortable */
  attributes?: DraggableAttributes;
  listeners?: DraggableSyntheticListeners;
  /** Thẻ gốc đang được kéo: chỉ còn là chỗ trống mờ trong cột */
  placeholder?: boolean;
  /** Bản nổi theo con trỏ trong DragOverlay */
  overlay?: boolean;
  /** Đã thả, đang chờ server xác nhận vị trí */
  saving?: boolean;
}

export function TaskCard({ task, onOpen, ref, style, attributes, listeners, placeholder, overlay, saving }: TaskCardProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Space được KeyboardSensor dùng để nhấc thẻ; gọi trước để nó xử lý phím của mình
    listeners?.onKeyDown?.(e);
    if (e.defaultPrevented || e.target !== e.currentTarget) return;
    // Đang kéo bằng bàn phím thì Enter là "thả", không mở thẻ
    if (e.key === 'Enter' && !placeholder) {
      e.preventDefault();
      onOpen?.(task);
    }
  }

  const className = [
    styles.card,
    task.isOverdue ? styles.overdueCard : '',
    placeholder ? styles.placeholder : '',
    overlay ? styles.overlay : '',
    saving ? styles.saving : '',
  ]
    .filter(Boolean)
    .join(' ');

  const description = task.descriptionText.trim();
  const hasFooter = task.dueDate || task.assignee;

  return (
    <div
      {...attributes}
      {...listeners}
      ref={ref}
      style={style}
      role="button"
      tabIndex={overlay ? -1 : 0}
      className={className}
      aria-busy={saving || undefined}
      onClick={() => onOpen?.(task)}
      onKeyDown={handleKeyDown}
    >
      {task.labels.length > 0 && (
        <ul className={styles.labels} aria-label="Nhãn">
          {task.labels.map((label) => (
            <li
              key={label.id}
              className={styles.label}
              style={{ background: label.color, color: textColorOn(label.color) }}
            >
              {label.name}
            </li>
          ))}
        </ul>
      )}

      <p className={styles.title}>{task.title}</p>

      {saving && (
        <span className={styles.savingText} role="status">
          Đang lưu…
        </span>
      )}

      {description && <p className={styles.description}>{description}</p>}

      {hasFooter && (
        <div className={styles.footer}>
          {task.dueDate ? (
            <span
              className={`${styles.due} ${task.isOverdue ? styles.overdue : ''}`}
              title={task.isOverdue ? 'Đã quá hạn' : 'Hạn hoàn thành'}
            >
              <ClockIcon />
              <time dateTime={task.dueDate}>{formatDate(task.dueDate)}</time>
              {task.isOverdue && <span className={styles.overdueText}>Quá hạn</span>}
            </span>
          ) : (
            <span />
          )}
          {task.assignee && (
            <span className={styles.assignee} title={`Phụ trách: ${task.assignee.name}`}>
              <Avatar name={task.assignee.name} id={task.assignee.id} src={task.assignee.avatarUrl} size="sm" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 4.5V8l2.5 1.5" strokeLinecap="round" />
    </svg>
  );
}

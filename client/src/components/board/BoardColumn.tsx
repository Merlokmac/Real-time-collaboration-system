/*
 * Một cột của bảng: tiêu đề (đổi tên tại chỗ), số thẻ, dấu "hoàn thành", menu cột, danh sách thẻ, ô thêm thẻ.
 *
 * Mọi thao tác gọi hàm của useBoard (truyền qua props) và chỉ đổi giao diện khi server trả về thành công.
 * Lỗi được hiện ngay tại cột, không làm mất những gì người dùng đang gõ.
 *
 * Kéo thả:
 *   - Cả cột là một phần tử sortable (`data.type = 'column'`), nhưng chỉ nhấc được bằng tay nắm ⠿ ở tiêu đề,
 *     để bấm tên cột (đổi tên), menu, ô thêm thẻ vẫn dùng bình thường.
 *   - Cột cũng là vùng thả cho thẻ: thả thẻ vào cột trống (hoặc khoảng trống dưới thẻ cuối) là đưa xuống cuối cột.
 *   - Danh sách thẻ là một SortableContext riêng (xếp dọc).
 */
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useRef, useState, type KeyboardEvent } from 'react';
import { ApiError, getErrorMessage, getFieldErrors } from '../../api/client';
import type { BoardColumn as BoardColumnData, Task } from '../../types';
import { LIMITS, validateColumnName } from '../../utils/validation';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { DropdownMenu } from '../common/DropdownMenu';
import { AddTask } from './AddTask';
import { SortableTaskCard } from './SortableTaskCard';
import styles from './BoardColumn.module.css';

export interface ColumnActions {
  onRename: (columnId: string, name: string) => Promise<void>;
  onSetDone: (columnId: string, isDone: boolean) => Promise<void>;
  onDelete: (columnId: string) => Promise<void>;
  onCreateTask: (columnId: string, title: string) => Promise<unknown>;
  onOpenTask: (task: Task) => void;
}

interface BoardColumnProps extends ColumnActions {
  column: BoardColumnData;
  /** Thẻ đã thả, đang chờ server */
  savingTaskIds: ReadonlySet<string>;
  /** Cột vừa được kéo sang chỗ mới, đang chờ server */
  saving: boolean;
}

function describeDeleteError(err: unknown): string {
  if (err instanceof ApiError && err.code === 'COLUMN_NOT_EMPTY') {
    return 'Chỉ xóa được cột trống. Hãy chuyển hoặc xóa hết thẻ trong cột trước.';
  }
  return getErrorMessage(err);
}

export function BoardColumn({
  column,
  savingTaskIds,
  saving,
  onRename,
  onSetDone,
  onDelete,
  onCreateTask,
  onOpenTask,
}: BoardColumnProps) {
  const [renaming, setRenaming] = useState(false);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: 'column' },
    // Đang đổi tên thì không cho kéo cột (tránh nhấc cột khi đang bôi đen chữ trong ô nhập)
    disabled: renaming || saving ? { draggable: true, droppable: false } : false,
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleDone() {
    setError(null);
    try {
      await onSetDone(column.id, !column.isDone);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  const taskCount = column.tasks.length;

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`${styles.column} ${column.isDone ? styles.done : ''} ${isDragging ? styles.placeholder : ''}`}
      aria-label={`Cột ${column.name}`}
      aria-busy={saving || undefined}
    >
      <header className={styles.header}>
        {!renaming && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            className={styles.handle}
            {...attributes}
            {...listeners}
            aria-label={`Kéo để sắp xếp cột ${column.name}`}
            title="Kéo để đổi vị trí cột"
          >
            ⠿
          </button>
        )}
        {renaming ? (
          <RenameInput
            initialName={column.name}
            onSave={(name) => onRename(column.id, name)}
            onClose={() => setRenaming(false)}
          />
        ) : (
          <>
            <h2 className={styles.title}>
              <button
                type="button"
                className={styles.titleButton}
                onClick={() => setRenaming(true)}
              >
                {column.name}
              </button>
            </h2>
            <span className={styles.count} aria-label={`${taskCount} thẻ`}>
              {taskCount}
            </span>
            {saving && (
              <span className={styles.saving} role="status">
                Đang lưu…
              </span>
            )}
            {column.isDone && (
              <span className={styles.doneBadge} title="Thẻ trong cột này được coi là đã hoàn thành, không bị tính quá hạn">
                ✓ Hoàn thành
              </span>
            )}
            <DropdownMenu
              className={styles.menu}
              trigger="⋯"
              label={`Tùy chọn cột ${column.name}`}
              items={[
                { label: 'Đổi tên', onSelect: () => setRenaming(true) },
                {
                  label: column.isDone ? 'Bỏ đánh dấu "cột hoàn thành"' : 'Đánh dấu là "cột hoàn thành"',
                  onSelect: () => void toggleDone(),
                },
                { label: 'Xóa cột', danger: true, onSelect: () => setConfirmingDelete(true) },
              ]}
            />
          </>
        )}
      </header>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <SortableContext items={column.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        {taskCount > 0 ? (
          <ul className={styles.tasks}>
            {column.tasks.map((task) => (
              <li key={task.id}>
                <SortableTaskCard task={task} onOpen={onOpenTask} saving={savingTaskIds.has(task.id)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>Chưa có thẻ nào</p>
        )}
      </SortableContext>

      <div className={styles.footer}>
        <AddTask columnName={column.name} onCreate={(title) => onCreateTask(column.id, title)} />
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title="Xóa cột"
          confirmLabel="Xóa cột"
          danger
          onConfirm={() => onDelete(column.id)}
          onCancel={() => setConfirmingDelete(false)}
          describeError={describeDeleteError}
        >
          <p>
            Xóa cột <strong>{column.name}</strong>? Chỉ xóa được cột không còn thẻ nào.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

/*
 * Ô đổi tên cột tại chỗ: Enter hoặc bấm ra ngoài là lưu, Esc là hủy.
 * Tên không đổi thì đóng luôn, không gọi API. Lưu lỗi thì giữ ô mở, hiện lỗi để sửa.
 */
function RenameInput({
  initialName,
  onSave,
  onClose,
}: {
  initialName: string;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Đã đóng (Esc / lưu xong): một số trình duyệt vẫn bắn blur khi ô nhập bị gỡ khỏi trang,
  // nếu không chặn thì blur đó sẽ gọi save() thêm lần nữa
  const closedRef = useRef(false);

  function close() {
    closedRef.current = true;
    onClose();
  }

  async function save() {
    if (saving || closedRef.current) return;
    const name = value.trim();
    if (name === initialName) {
      close();
      return;
    }
    const message = validateColumnName(name);
    if (message) {
      setError(message);
      return;
    }
    setSaving(true);
    try {
      await onSave(name);
      close();
    } catch (err) {
      setError(getFieldErrors(err).name ?? getErrorMessage(err));
      setSaving(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void save();
    }
  }

  return (
    <div className={styles.rename}>
      <input
        className={`${styles.renameInput} ${error ? styles.invalid : ''}`}
        value={value}
        maxLength={LIMITS.columnNameMax}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        disabled={saving}
        aria-label="Tên cột"
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={handleKeyDown}
        // Đang báo lỗi thì bấm ra ngoài không lưu lại lần nữa (tránh gọi API lặp), chỉ Enter/Esc
        onBlur={() => {
          if (!error) void save();
        }}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

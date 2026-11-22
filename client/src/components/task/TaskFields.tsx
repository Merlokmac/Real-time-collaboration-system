/*
 * Các trường sửa được của thẻ: tiêu đề, người phụ trách, hạn, nhãn.
 * Chỉ hiển thị và báo thay đổi lên (`onChange`); bản nháp và việc lưu do TaskDetail + useTaskDraft lo.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { TaskDraft } from '../../hooks/useTaskDraft';
import type { Label, ProjectMember, User } from '../../types';
import { textColorOn } from '../../utils/color';
import { LIMITS } from '../../utils/validation';
import { LabelForm } from '../board/LabelForm';
import styles from './TaskFields.module.css';

interface TaskFieldsProps {
  values: TaskDraft;
  /** null = đang tải danh sách thành viên */
  members: ProjectMember[] | null;
  /** Người đang được giao, để vẫn hiện tên khi danh sách thành viên chưa tải xong */
  currentAssignee: User | null;
  labels: Label[];
  /** Tạo nhãn mới và gắn vào bản nháp (do TaskDetail lo) */
  onCreateLabel: (name: string, color: string) => Promise<void>;
  titleError?: string;
  disabled?: boolean;
  onChange: <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => void;
}

export function TaskFields({ values, members, currentAssignee, labels, onCreateLabel, titleError, disabled, onChange }: TaskFieldsProps) {
  const id = useId();
  const [creatingLabel, setCreatingLabel] = useState(false);
  const newLabelButtonRef = useRef<HTMLButtonElement>(null);
  // Đóng form "+ Nhãn mới" thì trả focus về nút. Phải đợi render xong (nút chỉ mới được dựng lại sau khi form đóng)
  const restoreFocusRef = useRef(false);
  useEffect(() => {
    if (!creatingLabel && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      newLabelButtonRef.current?.focus();
    }
  }, [creatingLabel]);
  function closeLabelForm() {
    restoreFocusRef.current = true;
    setCreatingLabel(false);
  }

  // Người đang được giao có thể không còn trong danh sách (vừa rời dự án): vẫn giữ một lựa chọn cho họ
  const people = members?.map((m) => m.user) ?? [];
  if (currentAssignee && !people.some((u) => u.id === currentAssignee.id)) people.unshift(currentAssignee);

  // Bản nháp có thể còn id nhãn đã bị xóa: không tính vào các nhãn đang tick và bỏ đi khi người dùng tick/bỏ tick
  const currentIds = values.labelIds.filter((id) => labels.some((l) => l.id === id));

  function toggleLabel(labelId: string) {
    const next = currentIds.includes(labelId)
      ? currentIds.filter((x) => x !== labelId)
      : [...currentIds, labelId].sort();
    onChange('labelIds', next);
  }

  return (
    <div className={styles.fields}>
      <div className={styles.field}>
        <label htmlFor={`${id}-title`} className={styles.label}>
          Tiêu đề
        </label>
        <input
          id={`${id}-title`}
          data-autofocus
          className={`${styles.input} ${titleError ? styles.invalid : ''}`}
          value={values.title}
          maxLength={LIMITS.taskTitleMax}
          disabled={disabled}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? `${id}-title-error` : undefined}
          onChange={(e) => onChange('title', e.target.value)}
        />
        {titleError && (
          <p id={`${id}-title-error`} className={styles.error}>
            {titleError}
          </p>
        )}
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor={`${id}-assignee`} className={styles.label}>
            Người phụ trách
          </label>
          <select
            id={`${id}-assignee`}
            className={styles.input}
            value={values.assigneeId ?? ''}
            disabled={disabled}
            onChange={(e) => onChange('assigneeId', e.target.value || null)}
          >
            <option value="">Chưa giao</option>
            {people.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          {members === null && <p className={styles.hint}>Đang tải danh sách thành viên…</p>}
        </div>

        <div className={styles.field}>
          <label htmlFor={`${id}-due`} className={styles.label}>
            Hạn hoàn thành
          </label>
          <div className={styles.inline}>
            <input
              id={`${id}-due`}
              type="date"
              className={styles.input}
              value={values.dueDate}
              disabled={disabled}
              onChange={(e) => onChange('dueDate', e.target.value)}
            />
            {values.dueDate && (
              <button
                type="button"
                className={styles.clear}
                disabled={disabled}
                onClick={() => onChange('dueDate', '')}
                aria-label="Bỏ hạn hoàn thành"
                title="Bỏ hạn"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      <fieldset className={styles.field} disabled={disabled}>
        <legend className={styles.label}>Nhãn</legend>
        {labels.length === 0 ? (
          <p className={styles.hint}>Dự án chưa có nhãn nào. Bạn có thể tạo nhãn đầu tiên ngay bên dưới.</p>
        ) : (
          <ul className={styles.labels}>
            {labels.map((label) => {
              const checked = currentIds.includes(label.id);
              return (
                <li key={label.id}>
                  <label
                    className={`${styles.labelChip} ${checked ? styles.checked : ''}`}
                    style={checked ? { background: label.color, color: textColorOn(label.color) } : undefined}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleLabel(label.id)} />
                    <span className={styles.swatch} style={{ background: label.color }} aria-hidden="true" />
                    {label.name}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {creatingLabel ? (
          <div className={styles.newLabel}>
            <LabelForm
              labels={labels}
              submitLabel="Tạo và gắn nhãn"
              autoFocus
              onCancel={closeLabelForm}
              onSubmit={async (name, color) => {
                await onCreateLabel(name, color);
                closeLabelForm();
              }}
            />
          </div>
        ) : (
          <button ref={newLabelButtonRef} type="button" className={styles.addLabel} onClick={() => setCreatingLabel(true)}>
            + Nhãn mới
          </button>
        )}
      </fieldset>
    </div>
  );
}

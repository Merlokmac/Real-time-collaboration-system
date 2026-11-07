/*
 * Nút "+ Thêm ..." bấm vào thì thành ô nhập. Dùng cho AddTask (cuối mỗi cột) và AddColumn (cuối bảng).
 *
 *   - Enter: gửi. Gửi thành công thì xóa ô và GIỮ form mở để thêm tiếp liên tục.
 *   - Esc / nút ×: đóng, bỏ nội dung đang gõ.
 *   - Rời khỏi form khi ô đang trống: tự đóng. Còn chữ thì giữ nguyên (không làm mất thứ người dùng đã gõ).
 *   - Bỏ qua Enter khi bộ gõ tiếng Việt đang ghép chữ (isComposing), nếu không sẽ gửi khi đang gõ dở.
 *   - Đang gửi thì không gửi thêm lần nữa (tránh tạo trùng khi bấm Enter liên tục).
 */
import { useRef, useState, type FocusEvent, type FormEvent, type KeyboardEvent } from 'react';
import { getErrorMessage, getFieldErrors } from '../../api/client';
import { Button } from '../common/Button';
import styles from './AddItemForm.module.css';

interface AddItemFormProps {
  /** Chữ trên nút khi form đang đóng, ví dụ "Thêm thẻ" */
  openLabel: string;
  /** Nhãn của ô nhập cho trình đọc màn hình */
  inputLabel: string;
  placeholder: string;
  submitLabel: string;
  maxLength: number;
  /** Ô nhiều dòng (tiêu đề thẻ dài thì xuống dòng), Enter vẫn là gửi */
  multiline?: boolean;
  /** Trả câu lỗi nếu không hợp lệ */
  validate: (value: string) => string | undefined;
  /** Nhận giá trị đã trim. Ném lỗi nếu thất bại. */
  onSubmit: (value: string) => Promise<unknown>;
  /** Tên trường trong VALIDATION_ERROR của server ứng với ô này (ví dụ 'title', 'name') */
  serverField: string;
  variant?: 'column' | 'board';
}

export function AddItemForm({
  openLabel,
  inputLabel,
  placeholder,
  submitLabel,
  maxLength,
  multiline = false,
  validate,
  onSubmit,
  serverField,
  variant = 'column',
}: AddItemFormProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  function close() {
    setOpen(false);
    setValue('');
    setError(null);
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (submitting) return;
    const message = validate(value);
    if (message) {
      setError(message);
      inputRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(value.trim());
      setValue('');
    } catch (err) {
      setError(getFieldErrors(err)[serverField] ?? getErrorMessage(err));
    } finally {
      setSubmitting(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  function handleBlur(e: FocusEvent<HTMLFormElement>) {
    // relatedTarget = phần tử nhận focus tiếp theo; vẫn nằm trong form (nút Thêm) thì không đóng
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    if (!value.trim() && !submitting) close();
  }

  if (!open) {
    return (
      <button type="button" className={`${styles.openButton} ${styles[variant]}`} onClick={() => setOpen(true)}>
        <span aria-hidden="true">+</span> {openLabel}
      </button>
    );
  }

  const inputProps = {
    ref: inputRef,
    className: `${styles.input} ${error ? styles.invalid : ''}`,
    value,
    placeholder,
    maxLength,
    autoFocus: true,
    'aria-label': inputLabel,
    'aria-invalid': error ? true : undefined,
    onChange: (e: { target: { value: string } }) => {
      setValue(e.target.value);
      if (error) setError(null);
    },
    onKeyDown: handleKeyDown,
  };

  return (
    <form className={`${styles.form} ${styles[variant]}`} onSubmit={submit} onBlur={handleBlur}>
      {multiline ? <textarea {...inputProps} rows={2} /> : <input {...inputProps} />}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
        <button type="button" className={styles.cancel} onClick={close} aria-label="Đóng">
          ×
        </button>
      </div>
    </form>
  );
}

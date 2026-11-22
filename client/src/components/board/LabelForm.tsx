/*
 * Form tên + màu của một nhãn, dùng chung cho "tạo mới" và "sửa" trong LabelManager và cho "+ Nhãn mới" trong chi tiết thẻ.
 *
 * KHÔNG dùng thẻ <form>: component này nằm trong <form> của chi tiết thẻ, mà form lồng form là HTML không hợp lệ.
 * Enter trong ô tên và nút bấm tự xử lý; Enter bị chặn mặc định để không kích hoạt "gửi" của form bao ngoài.
 *
 * Esc: Modal lắng nghe Escape ở `document` và luôn đóng modal trên cùng. Khi có `onCancel` (form con) thì ta gọi
 * `stopPropagation()` ở đây để chỉ hủy form con, không đóng cả hộp thoại bên dưới (Modal tự làm giống vậy).
 *
 * Lỗi: kiểm tra sớm phía client (tên 1–30 ký tự, không trùng chính xác tên có sẵn — server phân biệt hoa/thường, nên
 * "A" và "a" vẫn được). Server vẫn là nơi quyết định: 409 DUPLICATE → "Đã có nhãn tên này" (message server chung chung,
 * không nêu rõ là nhãn); 400 VALIDATION_ERROR → lỗi theo trường; lỗi khác → message chung dưới form.
 * Chặn gửi hai lần bằng ref (state chưa kịp cập nhật nếu bấm đúp rất nhanh).
 */
import { useRef, useState, type KeyboardEvent } from 'react';
import { ApiError, getErrorMessage, getFieldErrors } from '../../api/client';
import type { Label } from '../../types';
import { DEFAULT_LABEL_COLOR } from '../../utils/labelColors';
import { LIMITS, validateLabelName } from '../../utils/validation';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';
import { TextField } from '../common/TextField';
import { LabelColorPicker } from './LabelColorPicker';
import styles from './LabelForm.module.css';

interface LabelFormProps {
  /** Các nhãn hiện có của dự án, để báo trùng tên sớm */
  labels: Label[];
  /** Đang sửa nhãn này (tên/màu ban đầu lấy từ đây, và không tính nó khi kiểm tra trùng); không có = tạo mới */
  editing?: Label;
  submitLabel: string;
  /** Gọi API. Lỗi ném ra thì form tự hiển thị và giữ nguyên nội dung đang gõ */
  onSubmit: (name: string, color: string) => Promise<unknown>;
  /** Có = hiện nút Hủy và Esc chỉ hủy form này */
  onCancel?: () => void;
  autoFocus?: boolean;
  /** Tạo mới xong: xóa ô tên và giữ focus để thêm tiếp */
  resetOnSuccess?: boolean;
}

export function LabelForm({ labels, editing, submitLabel, onSubmit, onCancel, autoFocus, resetOnSuccess }: LabelFormProps) {
  const [name, setName] = useState(editing?.name ?? '');
  const [color, setColor] = useState(editing?.color ?? DEFAULT_LABEL_COLOR);
  const [nameError, setNameError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  async function submit() {
    if (submittingRef.current) return;
    const trimmed = name.trim();
    const error =
      validateLabelName(trimmed) ??
      (labels.some((l) => l.id !== editing?.id && l.name === trimmed) ? 'Đã có nhãn tên này' : undefined);
    setNameError(error);
    setFormError(null);
    if (error) return;
    // Sửa mà không đổi gì thì chỉ đóng, không gọi API
    if (editing && trimmed === editing.name && color.toLowerCase() === editing.color.toLowerCase()) {
      onCancel?.();
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit(trimmed, color);
      if (resetOnSuccess) {
        setName('');
        rootRef.current?.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE') {
        setNameError('Đã có nhãn tên này');
      } else {
        const fields = getFieldErrors(err);
        if (fields.name || fields.color) {
          setNameError(fields.name);
          if (fields.color) setFormError(fields.color);
        } else {
          setFormError(getErrorMessage(err));
        }
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.type === 'text') {
      // Bộ gõ tiếng Việt đang ghép chữ (Safari báo keyCode 229) thì Enter là chốt chữ, không phải gửi
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      void submit();
    } else if (e.key === 'Escape' && onCancel) {
      e.stopPropagation();
      onCancel();
    }
  }

  return (
    <div ref={rootRef} className={styles.form} onKeyDown={handleKeyDown}>
      <TextField
        label="Tên nhãn"
        value={name}
        maxLength={LIMITS.labelNameMax}
        autoFocus={autoFocus}
        autoComplete="off"
        error={nameError}
        onChange={(e) => {
          setName(e.target.value);
          setNameError(undefined);
        }}
      />
      <LabelColorPicker value={color} onChange={setColor} />
      {formError && <ErrorMessage>{formError}</ErrorMessage>}
      <div className={styles.actions}>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            Hủy
          </Button>
        )}
        <Button onClick={() => void submit()} loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

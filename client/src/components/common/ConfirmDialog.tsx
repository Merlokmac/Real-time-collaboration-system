/*
 * Hộp thoại xác nhận (xóa cột, xóa thẻ...). Dựng trên Modal nên cũng render/không render như Modal:
 *   {confirming && <ConfirmDialog ... onCancel={() => setConfirming(false)} />}
 *
 * `onConfirm` trả về Promise: trong lúc chờ nút bị khóa, không đóng được bằng Esc/bấm nền
 * (để người dùng không tưởng đã hủy mà thao tác vẫn chạy). Nếu Promise lỗi, hộp thoại vẫn mở và hiện lỗi.
 * Thành công thì cha tự đóng (hoặc component chứa nó biến mất, ví dụ cột vừa bị xóa).
 */
import { useState, type ReactNode } from 'react';
import { getErrorMessage } from '../../api/client';
import { Button } from './Button';
import { ErrorMessage } from './ErrorMessage';
import { Modal } from './Modal';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  /** Nút xác nhận màu đỏ (thao tác xóa) */
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  /** Đổi lỗi thành câu dễ hiểu hơn cho từng trường hợp; mặc định dùng message của server */
  describeError?: (err: unknown) => string;
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel = 'Xác nhận',
  danger = false,
  onConfirm,
  onCancel,
  describeError = getErrorMessage,
}: ConfirmDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (!submitting) onCancel();
  }

  return (
    <Modal
      title={title}
      onClose={handleClose}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Hủy
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={handleConfirm} loading={submitting}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className={styles.content}>
        <div>{children}</div>
        {error && <ErrorMessage>{error}</ErrorMessage>}
      </div>
    </Modal>
  );
}

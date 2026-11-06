/*
 * Hộp thoại dùng chung. Component cha quyết định mở/đóng bằng cách render hoặc không render:
 *   {open && <Modal title="..." onClose={() => setOpen(false)}>...</Modal>}
 * Nhờ vậy mỗi lần mở là một lần mount mới, state của form bên trong tự reset.
 *
 * Hành vi:
 *   - Esc hoặc bấm ra nền tối → gọi onClose (cha có thể bỏ qua, ví dụ khi đang gửi form).
 *   - Khóa cuộn trang phía sau trong lúc mở.
 *   - Mở ra thì focus ô nhập đầu tiên; giữ phím Tab chạy vòng trong hộp thoại; đóng xong trả focus về nút đã mở nó.
 *   - Render qua portal vào <body> để không bị overflow/z-index của cha cắt mất.
 *   - Điện thoại: hộp thoại chiếm toàn màn hình.
 */
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Các nút ở chân hộp thoại (Hủy, Lưu...) */
  footer?: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Đếm số modal đang mở, để modal lồng nhau không mở khóa cuộn quá sớm
let openCount = 0;

export function Modal({ title, onClose, children, footer }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Phải lưu ngay lúc render đầu: tới khi effect chạy thì autoFocus của ô nhập bên trong đã lấy mất focus
  const [returnFocusTo] = useState(() => document.activeElement as HTMLElement | null);

  // Giữ onClose mới nhất trong ref để effect bên dưới chỉ chạy một lần khi mount
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Khóa cuộn nền + lưu/trả lại focus
  useEffect(() => {
    const dialog = dialogRef.current;
    // Focus ô nhập đầu tiên (không có thì focus chính hộp thoại) để gõ được ngay
    const firstField = dialog?.querySelector<HTMLElement>(
      'input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
    );
    (firstField ?? dialog)?.focus();

    openCount += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      openCount -= 1;
      if (openCount === 0) document.body.style.overflow = '';
      returnFocusTo?.focus?.();
    };
  }, [returnFocusTo]);

  // Esc để đóng, Tab chạy vòng trong hộp thoại
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Chỉ đóng khi bấm đúng vào nền (không phải bôi đen chữ trong form rồi thả chuột ra ngoài)
  const mouseDownOnBackdrop = useRef(false);
  function handleBackdropMouseDown(e: MouseEvent<HTMLDivElement>) {
    mouseDownOnBackdrop.current = e.target === e.currentTarget;
  }
  function handleBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose();
  }

  return createPortal(
    <div className={styles.backdrop} onMouseDown={handleBackdropMouseDown} onClick={handleBackdropClick}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Đóng">
            ×
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

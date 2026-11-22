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
  /** 'md' (mặc định, 520px) cho form ngắn; 'lg' (720px) cho nội dung dài như chi tiết thẻ */
  size?: 'md' | 'lg';
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Các modal đang mở, theo thứ tự mở. Dùng để:
//   - không mở khóa cuộn trang khi modal con đóng mà modal cha vẫn mở;
//   - chỉ modal trên cùng xử lý Esc/Tab (ví dụ hộp xác nhận xóa mở trên chi tiết thẻ: Esc chỉ đóng hộp xác nhận).
const openModals: object[] = [];

export function Modal({ title, onClose, children, footer, size = 'md' }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Phải lưu ngay lúc render đầu: tới khi effect chạy thì autoFocus của ô nhập bên trong đã lấy mất focus
  const [returnFocusTo] = useState(() => document.activeElement as HTMLElement | null);
  // Định danh của modal này trong openModals
  const [token] = useState(() => ({}));

  // Giữ onClose mới nhất trong ref để effect bên dưới chỉ chạy một lần khi mount
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Khóa cuộn nền + lưu/trả lại focus
  useEffect(() => {
    const dialog = dialogRef.current;
    // Focus ô có `data-autofocus` nếu có, không thì ô nhập đầu tiên (không có thì chính hộp thoại) để gõ được ngay.
    // data-autofocus cần khi ô đầu tiên là <select> làm việc ngay khi đổi giá trị (phím ↑/↓ trên Windows đổi được
    // giá trị của select đang đóng).
    const firstField =
      dialog?.querySelector<HTMLElement>('[data-autofocus]:not([disabled])') ??
      dialog?.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled]), select:not([disabled])');
    (firstField ?? dialog)?.focus();

    openModals.push(token);
    document.body.style.overflow = 'hidden';
    return () => {
      openModals.splice(openModals.indexOf(token), 1);
      if (openModals.length === 0) document.body.style.overflow = '';
      returnFocusTo?.focus?.();
    };
  }, [returnFocusTo, token]);

  // Esc để đóng, Tab chạy vòng trong hộp thoại (chỉ modal trên cùng)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (openModals[openModals.length - 1] !== token) return;
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
  }, [token]);

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
        className={`${styles.dialog} ${size === 'lg' ? styles.large : ''}`}
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

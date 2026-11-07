/*
 * Menu thả xuống gắn với một nút (ví dụ nút ⋯ của cột).
 *
 * Menu được render qua portal với position: fixed, tính theo vị trí nút lúc mở. Lý do: cột nằm trong
 * vùng bảng có overflow (cuộn ngang/dọc), nếu đặt menu absolute bên trong thì sẽ bị cắt mất ở cột ngắn.
 * Vì vị trí chỉ tính lúc mở, cuộn trang hoặc đổi kích thước cửa sổ thì đóng menu cho đơn giản.
 *
 * Đóng khi: chọn một mục, bấm ra ngoài, Esc (trả focus về nút), cuộn, đổi kích thước.
 */
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './DropdownMenu.module.css';

export interface DropdownMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

interface DropdownMenuProps {
  /** Nội dung nút mở menu (thường là "⋯") */
  trigger: ReactNode;
  /** Tên của nút cho trình đọc màn hình, ví dụ "Tùy chọn cột Việc cần làm" */
  label: string;
  items: DropdownMenuItem[];
  className?: string;
}

export function DropdownMenu({ trigger, label, items, className }: DropdownMenuProps) {
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const open = position !== null;

  function toggle() {
    if (open) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Canh mép phải menu theo mép phải nút, nằm ngay dưới nút
    setPosition({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
  }

  useEffect(() => {
    if (!open) return;
    // Focus mục đầu tiên để dùng được bằng bàn phím
    menuRef.current?.querySelector('button')?.focus();

    const close = () => setPosition(null);
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
      buttonRef.current?.focus();
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    // capture: true để bắt cả cuộn bên trong vùng bảng (sự kiện scroll không nổi bọt)
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={[styles.trigger, className].filter(Boolean).join(' ')}
        onClick={toggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div ref={menuRef} id={menuId} className={styles.menu} style={position} role="menu">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`${styles.item} ${item.danger ? styles.danger : ''}`}
                onClick={() => {
                  setPosition(null);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

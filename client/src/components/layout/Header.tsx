/*
 * Thanh trên cùng của các trang đã đăng nhập.
 *   - Máy tính: logo | Dự án của tôi, Hồ sơ | avatar + tên | Đăng xuất
 *   - Điện thoại (≤ 640px): logo | avatar | nút ☰. Bấm ☰ mở bảng menu thả xuống;
 *     menu đóng khi chọn mục, bấm ra ngoài hoặc nhấn Esc.
 * Hai kiểu hiển thị do CSS quyết định (@media), JS chỉ giữ trạng thái mở/đóng của menu.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Avatar } from '../common/Avatar';
import { Button } from '../common/Button';
import styles from './Header.module.css';

const NAV_ITEMS = [
  { to: '/projects', label: 'Dự án của tôi' },
  { to: '/profile', label: 'Hồ sơ' },
];

function navClass({ isActive }: { isActive: boolean }) {
  return `${styles.navLink} ${isActive ? styles.active : ''}`;
}

export function Header() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  // Menu đang mở: bấm ra ngoài header hoặc nhấn Esc thì đóng
  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (!headerRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      // Không cần navigate: user thành null thì ProtectedRoute tự chuyển về /login
      await logout();
    } catch (err) {
      // logout() vẫn xóa user dù API lỗi, nên chỉ ghi log
      console.warn('Đăng xuất lỗi:', err);
    }
  }

  if (!user) return null;
  const closeMenu = () => setMenuOpen(false);

  return (
    <header ref={headerRef} className={styles.header}>
      <div className={styles.inner}>
        <Link to="/projects" className={styles.brand} onClick={closeMenu}>
          <span className={styles.logo} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className={styles.brandName}>Kanban cộng tác</span>
        </Link>

        {/* Menu chính trên máy tính */}
        <nav className={styles.desktopNav} aria-label="Điều hướng chính">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={navClass} end={item.to === '/projects'}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.right}>
          <Link to="/profile" className={styles.user} onClick={closeMenu} title="Hồ sơ của bạn">
            <Avatar name={user.name} id={user.id} src={user.avatarUrl} size="sm" />
            <span className={styles.userName}>{user.name}</span>
          </Link>
          <Button variant="secondary" className={styles.desktopLogout} onClick={handleLogout} loading={loggingOut}>
            Đăng xuất
          </Button>
          <button
            type="button"
            className={styles.menuButton}
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
          >
            <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
          </button>
        </div>
      </div>

      {/* Menu thả xuống trên điện thoại */}
      {menuOpen && (
        <nav id="mobile-menu" className={styles.mobileMenu} aria-label="Điều hướng chính">
          <div className={styles.mobileUser}>
            <Avatar name={user.name} id={user.id} src={user.avatarUrl} />
            <div className={styles.mobileUserText}>
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={navClass}
              end={item.to === '/projects'}
              onClick={closeMenu}
            >
              {item.label}
            </NavLink>
          ))}
          <Button variant="secondary" fullWidth onClick={handleLogout} loading={loggingOut}>
            Đăng xuất
          </Button>
        </nav>
      )}
    </header>
  );
}

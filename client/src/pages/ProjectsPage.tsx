// Tạm thời (Tuần 1): chỉ chào người dùng và có nút đăng xuất. Danh sách dự án làm ở Tuần 2.
import { useState } from 'react';
import { getErrorMessage } from '../api/client';
import { Button } from '../components/common/Button';
import { useAuth } from '../hooks/useAuth';
import styles from './placeholder.module.css';

export function ProjectsPage() {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setLoggingOut(true);
    setError(null);
    try {
      // Không cần navigate: user thành null thì ProtectedRoute tự chuyển về /login
      await logout();
    } catch (err) {
      // logout() vẫn xóa user dù API lỗi, nên ở đây chỉ báo lỗi cho biết
      setError(getErrorMessage(err));
      setLoggingOut(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.row}>
          <div>
            <h1>Dự án của tôi</h1>
            <p className={styles.muted}>
              Xin chào <strong>{user?.name}</strong> ({user?.email})
            </p>
          </div>
          <Button variant="secondary" onClick={handleLogout} loading={loggingOut}>
            Đăng xuất
          </Button>
        </div>
        <p className={styles.muted}>Danh sách dự án sẽ có ở Tuần 2.</p>
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </main>
  );
}

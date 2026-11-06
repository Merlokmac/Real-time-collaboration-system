/*
 * Hai "cổng" bọc các route:
 *   - ProtectedRoute: chỉ cho vào khi đã đăng nhập, chưa thì chuyển về /login (nhớ trang định vào).
 *   - GuestRoute: trang login/register; đã đăng nhập thì chuyển đi /projects (hoặc trang định vào).
 * Khi AuthContext còn loading (đang hỏi /auth/me) thì hiện vòng quay, không chuyển trang vội.
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullPageSpinner } from '../components/common/Spinner';
import { useAuth } from '../hooks/useAuth';

/** state gửi kèm khi chuyển về /login, để đăng nhập xong quay lại đúng trang */
export interface RedirectState {
  from?: string;
}

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;
  if (!user) {
    const state: RedirectState = { from: location.pathname + location.search };
    return <Navigate to="/login" replace state={state} />;
  }
  return <Outlet />;
}

export function GuestRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;
  if (user) {
    const from = (location.state as RedirectState | null)?.from;
    // Chỉ nhận đường dẫn nội bộ, tránh bị chuyển hướng ra trang ngoài
    const target = from && from.startsWith('/') && !from.startsWith('//') ? from : '/projects';
    return <Navigate to={target} replace />;
  }
  return <Outlet />;
}

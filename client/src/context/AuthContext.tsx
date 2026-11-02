/*
 * Giữ người dùng hiện tại cho toàn app.
 *
 * Luồng:
 *   1. Mở app → loading = true, gọi GET /auth/me (cookie phiên kanban.sid được gửi kèm).
 *      - Thành công → user = kết quả; 401 → user = null. Xong thì loading = false.
 *      Nhờ loading, các route không vội chuyển về /login trước khi biết kết quả (tránh nhấp nháy).
 *   2. login/register thành công → server đặt cookie mới, ta lưu user vào state.
 *   3. logout → gọi API rồi xóa user.
 *   4. Bất kỳ request nào nhận 401 UNAUTHORIZED (phiên hết hạn) → client.ts gọi handler → xóa user.
 *
 * Context không tự điều hướng: khi user thành null, ProtectedRoute tự chuyển về /login.
 * Như vậy chỉ có một nơi quyết định "chưa đăng nhập thì đi đâu".
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as authApi from '../api/auth';
import { setUnauthorizedHandler } from '../api/client';
import type { User } from '../types';
import { AuthContext, type AuthContextValue } from './authContextValue';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Khôi phục đăng nhập khi mở app / tải lại trang
  useEffect(() => {
    const controller = new AbortController();
    authApi
      .me({ signal: controller.signal })
      .then((u) => setUser(u))
      .catch((err: unknown) => {
        // StrictMode chạy effect 2 lần ở dev: lần đầu bị hủy thì bỏ qua, chờ lần sau
        if (controller.signal.aborted) return;
        // 401 là chưa đăng nhập; lỗi mạng cũng coi như chưa đăng nhập, trang login sẽ báo lỗi khi gửi
        console.warn('Không khôi phục được phiên đăng nhập:', err);
        setUser(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  // Phiên hết hạn giữa chừng → xóa user
  useEffect(() => setUnauthorizedHandler(() => setUser(null)), []);

  const login = useCallback(async (input: authApi.LoginInput) => {
    const u = await authApi.login(input);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (input: authApi.RegisterInput) => {
    const u = await authApi.register(input);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // Dù gọi API lỗi (mất mạng) vẫn xóa user phía client để người dùng thấy đã đăng xuất
      setUser(null);
    }
  }, []);

  const updateMe = useCallback(async (input: authApi.UpdateMeInput) => {
    const u = await authApi.updateMe(input);
    setUser(u);
    return u;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, logout, updateMe }),
    [user, loading, login, register, logout, updateMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

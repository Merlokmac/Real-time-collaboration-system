import { useContext } from 'react';
import { AuthContext } from '../context/authContextValue';

/** Lấy user hiện tại và các hàm login/register/logout. Phải nằm trong <AuthProvider>. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải được dùng bên trong <AuthProvider>');
  return ctx;
}

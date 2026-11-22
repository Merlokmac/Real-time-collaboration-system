import { useEffect, type ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { socket } from './socket';

export function RealtimeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  // Chỉ phụ thuộc id: sửa hồ sơ (setUser object mới) không được làm socket ngắt rồi nối lại, mất phòng dự án
  const userId = user?.id ?? null;

  useEffect(() => {
    if (loading) return;

    if (!userId) {
      socket.disconnect();
      return;
    }

    socket.connect();

    return () => {
      socket.disconnect();
    };
  }, [userId, loading]);

  return children;
}
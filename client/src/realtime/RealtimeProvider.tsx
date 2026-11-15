import { useEffect, type ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { socket } from './socket';

export function RealtimeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      socket.disconnect();
      return;
    }

    socket.connect();

    return () => {
      socket.disconnect();
    };
  }, [user, loading]);

  return children;
}
import { io } from 'socket.io-client';
import { setSocketId } from '../api/client';

// Mặc định nối cùng origin với trang: khi dev, Vite proxy /socket.io sang server (vite.config.ts);
// khi deploy khác origin thì đặt VITE_SOCKET_URL.
const SOCKET_URL: string | undefined = import.meta.env.VITE_SOCKET_URL || undefined;

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  withCredentials: true,
});

socket.on('connect', () => {
  console.log('Socket connected:', socket.id);

  setSocketId(socket.id ?? null);
});

socket.on('disconnect', (reason) => {
  console.log('Socket disconnected:', reason);

  setSocketId(null);
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error.message);
});
import { io } from 'socket.io-client';
import { setSocketId } from '../api/client';

export const socket = io('http://localhost:4000', {
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
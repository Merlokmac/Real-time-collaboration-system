// Định nghĩa context đăng nhập (tách riêng vì luật react-refresh). Provider ở AuthContext.tsx, hook ở hooks/useAuth.ts.
import { createContext } from 'react';
import type { LoginInput, RegisterInput, UpdateMeInput } from '../api/auth';
import type { User } from '../types';

export interface AuthContextValue {
  /** null = chưa đăng nhập (chỉ có ý nghĩa khi loading = false) */
  user: User | null;
  /** true trong lúc hỏi GET /auth/me lúc mở app; khi đó chưa biết đã đăng nhập hay chưa */
  loading: boolean;
  login: (input: LoginInput) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
  updateMe: (input: UpdateMeInput) => Promise<User>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

// API tài khoản: /auth/* và /users/me. Mỗi hàm trả về User (đã bỏ lớp { user } bọc ngoài).
import type { User } from '../types';
import { api } from './client';

export interface RegisterInput {
  email: string;
  /** 8–72 ký tự */
  password: string;
  /** 1–60 ký tự */
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateMeInput {
  name?: string;
  /** null để xóa ảnh đại diện */
  avatarUrl?: string | null;
}

type UserResponse = { user: User };

/** Đăng ký xong server tự đăng nhập luôn (đặt cookie phiên). 409 EMAIL_TAKEN nếu trùng email. */
export async function register(input: RegisterInput): Promise<User> {
  const { user } = await api.post<UserResponse>('/auth/register', input);
  return user;
}

/** 401 INVALID_CREDENTIALS nếu sai email hoặc mật khẩu. */
export async function login(input: LoginInput): Promise<User> {
  const { user } = await api.post<UserResponse>('/auth/login', input);
  return user;
}

export function logout(): Promise<void> {
  return api.post<void>('/auth/logout');
}

/** Lấy người dùng của phiên hiện tại; 401 UNAUTHORIZED nếu chưa đăng nhập. */
export async function me(options?: { signal?: AbortSignal }): Promise<User> {
  const { user } = await api.get<UserResponse>('/auth/me', options);
  return user;
}

export async function updateMe(input: UpdateMeInput): Promise<User> {
  const { user } = await api.patch<UserResponse>('/users/me', input);
  return user;
}

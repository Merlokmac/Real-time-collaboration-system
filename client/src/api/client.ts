/*
 * Hàm gọi API dùng chung. Mọi request tới backend đều đi qua đây để:
 *   - gửi kèm cookie phiên (credentials: 'include')
 *   - gửi header x-socket-id khi đã có socket (server không phát lại sự kiện cho chính socket này)
 *   - đổi phản hồi lỗi { error: { code, message, details } } thành ApiError để component xử lý thống nhất
 */
import type { ApiErrorBody, ApiErrorCode, FieldErrors } from '../types';

const BASE_URL = '/api';

/** Lỗi từ API. status = 0 nghĩa là không kết nối được tới server. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | (string & {});
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ---------- Trạng thái dùng chung ----------

let socketId: string | null = null;

/** Người 3 gọi khi socket kết nối (socket.id) và khi ngắt kết nối (null). */
export function setSocketId(id: string | null) {
  socketId = id;
}

let unauthorizedHandler: (() => void) | null = null;

/**
 * AuthContext đăng ký hàm này để khi bất kỳ request nào nhận 401 UNAUTHORIZED
 * (phiên hết hạn, bị đăng xuất ở tab khác...) thì xóa user và quay về /login.
 * Trả về hàm hủy đăng ký.
 */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

// ---------- Hàm gọi chính ----------

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  /** Tham số query; giá trị undefined, null, '' hoặc false sẽ bị bỏ qua */
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return `${BASE_URL}${path}${qs ? `?${qs}` : ''}`;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error?.code === 'string'
  );
}

async function request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (socketId) headers['x-socket-id'] = socketId;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal,
    });
  } catch (err) {
    // Hủy request (AbortController) thì ném lại nguyên lỗi để nơi gọi bỏ qua
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Không kết nối được tới máy chủ. Kiểm tra mạng rồi thử lại.');
  }

  // 204 No Content: không có body để đọc
  if (res.status === 204) return undefined as T;

  // Đọc body an toàn: proxy của Vite trả HTML/văn bản khi backend chưa chạy
  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }

  if (!res.ok) {
    const error = isApiErrorBody(data)
      ? new ApiError(res.status, data.error.code, data.error.message, data.error.details)
      : new ApiError(res.status, res.status >= 500 ? 'INTERNAL' : 'UNKNOWN', defaultMessage(res.status));

    // Chỉ UNAUTHORIZED mới là "mất phiên"; INVALID_CREDENTIALS (sai mật khẩu) cũng là 401 nhưng không phải
    if (error.status === 401 && error.code === 'UNAUTHORIZED') unauthorizedHandler?.();
    throw error;
  }

  return data as T;
}

function defaultMessage(status: number) {
  if (status >= 500) return 'Máy chủ đang gặp sự cố, vui lòng thử lại sau.';
  if (status === 404) return 'Không tìm thấy dữ liệu.';
  return 'Đã có lỗi xảy ra, vui lòng thử lại.';
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, body, options),
  delete: <T = void>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('DELETE', path, body, options),
};

// ---------- Tiện ích xử lý lỗi cho form ----------

/**
 * Lấy lỗi theo từng trường từ VALIDATION_ERROR, mỗi trường lấy thông báo đầu tiên.
 * Ví dụ: { email: 'Email không hợp lệ' }. Không phải lỗi validation thì trả {}.
 */
export function getFieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || err.code !== 'VALIDATION_ERROR') return {};
  if (typeof err.details !== 'object' || err.details === null) return {};
  const result: Record<string, string> = {};
  for (const [field, messages] of Object.entries(err.details as FieldErrors)) {
    if (messages && messages.length > 0) result[field] = messages[0];
  }
  return result;
}

/** Thông báo lỗi tiếng Việt để hiển thị chung (ưu tiên message của server). */
export function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Đã có lỗi xảy ra, vui lòng thử lại.';
}

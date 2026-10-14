export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Bạn cần đăng nhập') => new HttpError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Bạn không có quyền thực hiện thao tác này') =>
  new HttpError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Không tìm thấy dữ liệu') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (code: string, message: string, details?: unknown) =>
  new HttpError(409, code, message, details);

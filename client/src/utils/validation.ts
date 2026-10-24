/*
 * Kiểm tra dữ liệu form phía client, giới hạn khớp với zod ở server/src/modules/auth/auth.routes.ts.
 * Mục đích chỉ là báo lỗi sớm cho người dùng; server vẫn kiểm tra lại (không tin client).
 * Mỗi hàm trả về câu lỗi tiếng Việt, hoặc undefined nếu hợp lệ.
 */

export const LIMITS = {
  emailMax: 254,
  passwordMin: 8,
  passwordMax: 72, // bcrypt chỉ dùng 72 byte đầu nên server chặn ở 72
  nameMax: 60,
} as const;

// Đủ để bắt lỗi gõ nhầm thường gặp (thiếu @, thiếu tên miền); không cố khớp toàn bộ chuẩn RFC
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return 'Vui lòng nhập email';
  if (email.length > LIMITS.emailMax || !EMAIL_PATTERN.test(email)) return 'Email không hợp lệ';
  return undefined;
}

/** Mật khẩu khi đăng ký: 8–72 ký tự */
export function validateNewPassword(value: string): string | undefined {
  if (!value) return 'Vui lòng nhập mật khẩu';
  if (value.length < LIMITS.passwordMin) return `Mật khẩu tối thiểu ${LIMITS.passwordMin} ký tự`;
  if (value.length > LIMITS.passwordMax) return `Mật khẩu tối đa ${LIMITS.passwordMax} ký tự`;
  return undefined;
}

/** Mật khẩu khi đăng nhập: chỉ cần không trống (không gợi ý luật mật khẩu cho người đoán mò) */
export function validateLoginPassword(value: string): string | undefined {
  if (!value) return 'Vui lòng nhập mật khẩu';
  return undefined;
}

export function validateConfirmPassword(password: string, confirm: string): string | undefined {
  if (!confirm) return 'Vui lòng nhập lại mật khẩu';
  if (password !== confirm) return 'Mật khẩu nhập lại không khớp';
  return undefined;
}

export function validateName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return 'Tên không được để trống';
  if (name.length > LIMITS.nameMax) return `Tên tối đa ${LIMITS.nameMax} ký tự`;
  return undefined;
}

/** Bỏ các trường không có lỗi; dùng `Object.keys(errors).length === 0` để biết form hợp lệ */
export function compactErrors<K extends string>(errors: Record<K, string | undefined>): Partial<Record<K, string>> {
  const result: Partial<Record<K, string>> = {};
  for (const key of Object.keys(errors) as K[]) {
    if (errors[key]) result[key] = errors[key];
  }
  return result;
}

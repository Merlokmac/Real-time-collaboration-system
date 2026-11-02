/*
 * Trang đăng ký. Server đăng ký xong tự đăng nhập luôn (đặt cookie phiên),
 * nên sau khi register() thành công GuestRoute tự chuyển sang /projects.
 * confirmPassword chỉ kiểm tra ở client, không gửi lên server.
 */
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError, getErrorMessage, getFieldErrors } from '../api/client';
import { Button } from '../components/common/Button';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { TextField } from '../components/common/TextField';
import { AuthLayout } from '../components/layout/AuthLayout';
import { useAuth } from '../hooks/useAuth';
import {
  compactErrors,
  LIMITS,
  validateConfirmPassword,
  validateEmail,
  validateName,
  validateNewPassword,
} from '../utils/validation';
import styles from './authForm.module.css';

type Field = 'name' | 'email' | 'password' | 'confirmPassword';
type Values = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;

// Thứ tự hiển thị trên form, dùng để focus vào ô lỗi đầu tiên
const FIELDS: Field[] = ['name', 'email', 'password', 'confirmPassword'];

function validate(values: Values): Errors {
  return compactErrors({
    name: validateName(values.name),
    email: validateEmail(values.email),
    password: validateNewPassword(values.password),
    confirmPassword: validateConfirmPassword(values.password, values.confirmPassword),
  });
}

export function RegisterPage() {
  const { register } = useAuth();
  const location = useLocation();
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<Values>({ name: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function focusField(field: Field) {
    const el = formRef.current?.elements.namedItem(field);
    if (el instanceof HTMLInputElement) el.focus();
  }

  const handleChange = (field: Field) => (e: ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setFormError(null);
  };

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const clientErrors = validate(values);
    const firstInvalid = FIELDS.find((f) => clientErrors[f]);
    if (firstInvalid) {
      setErrors(clientErrors);
      focusField(firstInvalid);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await register({ name: values.name.trim(), email: values.email.trim(), password: values.password });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') {
        // Lỗi thuộc về ô email nên hiện ngay dưới ô email
        setErrors({ email: 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác.' });
        focusField('email');
      } else if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        // Server trả lỗi theo trường name/email/password, trùng tên với ô trên form
        const serverErrors = getFieldErrors(err) as Errors;
        setErrors(serverErrors);
        const first = FIELDS.find((f) => serverErrors[f]);
        if (first) focusField(first);
        else setFormError(getErrorMessage(err));
      } else {
        setFormError(getErrorMessage(err));
      }
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Tạo tài khoản"
      subtitle="Quản lý dự án bằng bảng Kanban và cộng tác cùng nhóm."
      footer={
        <>
          Đã có tài khoản?{' '}
          <Link to="/login" state={location.state}>
            Đăng nhập
          </Link>
        </>
      }
    >
      <form ref={formRef} className={styles.form} onSubmit={handleSubmit} noValidate>
        {formError && <ErrorMessage>{formError}</ErrorMessage>}

        <TextField
          label="Họ và tên"
          name="name"
          autoComplete="name"
          maxLength={LIMITS.nameMax}
          placeholder="Nguyễn Văn A"
          value={values.name}
          onChange={handleChange('name')}
          error={errors.name}
          autoFocus
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="ban@vidu.vn"
          value={values.email}
          onChange={handleChange('email')}
          error={errors.email}
        />
        <TextField
          label="Mật khẩu"
          name="password"
          type="password"
          autoComplete="new-password"
          hint={`Tối thiểu ${LIMITS.passwordMin} ký tự.`}
          value={values.password}
          onChange={handleChange('password')}
          error={errors.password}
        />
        <TextField
          label="Nhập lại mật khẩu"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={handleChange('confirmPassword')}
          error={errors.confirmPassword}
        />

        <Button type="submit" fullWidth loading={submitting} className={styles.submit}>
          {submitting ? 'Đang tạo tài khoản…' : 'Đăng ký'}
        </Button>
      </form>
    </AuthLayout>
  );
}

/*
 * Trang đăng nhập.
 * Luồng: kiểm tra phía client → gọi login() trong AuthContext → thành công thì user có giá trị,
 * GuestRoute tự chuyển sang /projects (hoặc trang người dùng định vào trước đó). Trang này không tự navigate.
 */
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError, getErrorMessage, getFieldErrors } from '../api/client';
import { Button } from '../components/common/Button';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { TextField } from '../components/common/TextField';
import { AuthLayout } from '../components/layout/AuthLayout';
import { useAuth } from '../hooks/useAuth';
import { compactErrors, validateEmail, validateLoginPassword } from '../utils/validation';
import styles from './authForm.module.css';

type Field = 'email' | 'password';
type Values = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;

const FIELDS: Field[] = ['email', 'password'];

function validate(values: Values): Errors {
  return compactErrors({
    email: validateEmail(values.email),
    password: validateLoginPassword(values.password),
  });
}

export function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<Values>({ email: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function focusField(field: Field) {
    const el = formRef.current?.elements.namedItem(field);
    if (el instanceof HTMLInputElement) el.focus();
  }

  const handleChange = (field: Field) => (e: ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    // Người dùng đang sửa ô này thì ẩn lỗi cũ của nó
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
      await login({ email: values.email.trim(), password: values.password });
      // Thành công: GuestRoute chuyển trang, component này sẽ bị gỡ
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
        // Không nói rõ sai email hay sai mật khẩu, để người lạ không dò được email nào đã đăng ký
        setFormError('Email hoặc mật khẩu không đúng.');
        focusField('password');
      } else if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        const serverErrors = getFieldErrors(err);
        setErrors(serverErrors);
        if (Object.keys(serverErrors).length === 0) setFormError(getErrorMessage(err));
      } else {
        setFormError(getErrorMessage(err));
      }
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Đăng nhập"
      subtitle="Tiếp tục làm việc với các dự án của bạn."
      footer={
        <>
          Chưa có tài khoản?{' '}
          {/* Giữ state.from để đăng ký xong vẫn quay về trang định vào */}
          <Link to="/register" state={location.state}>
            Đăng ký
          </Link>
        </>
      }
    >
      <form ref={formRef} className={styles.form} onSubmit={handleSubmit} noValidate>
        {formError && <ErrorMessage>{formError}</ErrorMessage>}

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
          autoFocus
        />
        <TextField
          label="Mật khẩu"
          name="password"
          type="password"
          autoComplete="current-password"
          value={values.password}
          onChange={handleChange('password')}
          error={errors.password}
        />

        <Button type="submit" fullWidth loading={submitting} className={styles.submit}>
          {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </Button>
      </form>
    </AuthLayout>
  );
}

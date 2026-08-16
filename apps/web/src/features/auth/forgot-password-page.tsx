import { useState, type FormEvent } from 'react';

import { AuthPageShell } from './auth-page-shell.tsx';

export interface PasswordResetRequestInputV1 {
  readonly email: string;
  readonly locale: 'en' | 'vi-VN';
}

type PasswordResetRequestResultV1 = { readonly accepted: boolean };

function rejected(result: PasswordResetRequestResultV1 | undefined): boolean {
  return result?.accepted === false;
}

export function ForgotPasswordPage({
  locale,
  onRequested,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly onRequested: (
    input: PasswordResetRequestInputV1,
  ) => Promise<PasswordResetRequestResultV1> | PasswordResetRequestResultV1;
}) {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);
  const isVi = locale === 'vi-VN';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || email.trim().length < 3) {
      setError(true);
      return;
    }
    setPending(true);
    setError(false);
    try {
      const result = await onRequested({ email: email.trim(), locale });
      if (rejected(result)) setError(true);
      else setSubmitted(true);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthPageShell
      locale={locale}
      title={isVi ? 'Quên mật khẩu?' : 'Forgot your password?'}
      description={
        isVi
          ? 'Nhập email để nhận liên kết đặt lại mật khẩu an toàn.'
          : 'Enter your email and we’ll send a secure password reset link.'
      }
      footer={
        <p>
          {isVi ? 'Nhớ lại mật khẩu?' : 'Remember your password?'}{' '}
          <a href={`/${locale}/sign-in`} className="auth-card__link">
            {isVi ? 'Đăng nhập' : 'Sign in'}
          </a>
        </p>
      }
    >
      {submitted ? (
        <div className="auth-form__success" role="status" aria-live="polite">
          <div className="auth-form__success-mark" aria-hidden="true">
            ✓
          </div>
          <div>
            <strong>{isVi ? 'Hãy kiểm tra hộp thư' : 'Check your inbox'}</strong>
            <p>
              {isVi
                ? 'Nếu email này thuộc DataBreeze, chúng tôi đã gửi liên kết đặt lại mật khẩu. Hãy kiểm tra cả thư mục spam.'
                : 'If this email belongs to DataBreeze, we sent a password reset link. Check your spam folder too.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            <label>
              <span className="auth-form__label-text">Email</span>
              <input
                autoComplete="email"
                name="email"
                type="email"
                placeholder={isVi ? 'ten@congty.com' : 'name@company.com'}
                required
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
            </label>
            <p className="auth-form__hint">
              {isVi
                ? 'Để bảo vệ tài khoản, chúng tôi luôn hiển thị cùng một thông báo.'
                : 'For account privacy, we show the same message for every email address.'}
            </p>
            <button className="auth-form__submit" disabled={pending} type="submit">
              {pending ? (
                <span className="auth-form__button-content">
                  <span className="auth-form__spinner" aria-hidden="true" />
                  <span>{isVi ? 'Đang gửi…' : 'Sending…'}</span>
                </span>
              ) : isVi ? (
                'Gửi liên kết đặt lại'
              ) : (
                'Send reset link'
              )}
            </button>
          </form>
          {error ? (
            <div className="auth-form__error" role="alert">
              <span className="auth-form__error-icon" aria-hidden="true">
                !
              </span>
              <span>
                {isVi
                  ? 'Không thể gửi yêu cầu. Hãy thử lại.'
                  : 'Could not send the request. Try again.'}
              </span>
            </div>
          ) : null}
        </>
      )}
    </AuthPageShell>
  );
}

import { useState, type FormEvent } from 'react';

import { AuthPageShell } from './auth-page-shell.tsx';

export interface PasswordResetCompletionInputV1 {
  readonly token: string;
  readonly newPassword: string;
}

type PasswordResetCompletionResultV1 = { readonly accepted: boolean };

function rejected(result: PasswordResetCompletionResultV1 | undefined): boolean {
  return result?.accepted === false;
}

export function ResetPasswordPage({
  locale,
  token,
  onReset,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly token: string;
  readonly onReset: (
    input: PasswordResetCompletionInputV1,
  ) => Promise<PasswordResetCompletionResultV1> | PasswordResetCompletionResultV1;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(false);
  const isVi = locale === 'vi-VN';
  const invalidToken = token.trim().length === 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      pending ||
      invalidToken ||
      password.length < 12 ||
      password.length > 128 ||
      password !== confirmation
    ) {
      setError(true);
      return;
    }
    setPending(true);
    setError(false);
    try {
      const result = await onReset({ token, newPassword: password });
      if (rejected(result)) setError(true);
      else setSuccess(true);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthPageShell
      locale={locale}
      title={isVi ? 'Đặt lại mật khẩu' : 'Reset your password'}
      description={
        isVi
          ? 'Tạo mật khẩu mới để tiếp tục sử dụng DataBreeze.'
          : 'Create a new password to continue using DataBreeze.'
      }
      footer={
        <p>
          {isVi ? 'Cần bắt đầu lại?' : 'Need to start over?'}{' '}
          <a href={`/${locale}/forgot-password`} className="auth-card__link">
            {isVi ? 'Yêu cầu liên kết mới' : 'Request a new link'}
          </a>
        </p>
      }
    >
      {invalidToken ? (
        <div className="auth-form__error auth-form__error--stacked" role="alert">
          <span className="auth-form__error-icon" aria-hidden="true">
            !
          </span>
          <span>
            {isVi
              ? 'Liên kết đặt lại không hợp lệ hoặc đã hết hạn.'
              : 'This reset link is invalid or has expired.'}
          </span>
        </div>
      ) : success ? (
        <div className="auth-form__success" role="status" aria-live="polite">
          <div className="auth-form__success-mark" aria-hidden="true">
            ✓
          </div>
          <div>
            <strong>{isVi ? 'Mật khẩu đã được cập nhật' : 'Password updated'}</strong>
            <p>
              {isVi
                ? 'Hãy đăng nhập lại bằng mật khẩu mới. Bạn có thể cần đăng ký lại MFA trước khi dùng các thao tác nhạy cảm.'
                : 'Sign in again with your new password. You may need to re-enroll MFA before using sensitive actions.'}
            </p>
            <a href={`/${locale}/sign-in`} className="auth-form__success-link">
              {isVi ? 'Đi tới đăng nhập' : 'Go to sign in'} →
            </a>
          </div>
        </div>
      ) : (
        <>
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            <label>
              <span className="auth-form__label-text">
                {isVi ? 'Mật khẩu mới' : 'New password'}
              </span>
              <input
                autoComplete="new-password"
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                placeholder="••••••••••••"
                required
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
              />
            </label>
            <label>
              <span className="auth-form__label-text">
                {isVi ? 'Xác nhận mật khẩu mới' : 'Confirm new password'}
              </span>
              <input
                autoComplete="new-password"
                name="passwordConfirmation"
                type="password"
                minLength={12}
                maxLength={128}
                placeholder="••••••••••••"
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.currentTarget.value)}
              />
            </label>
            <p className="auth-form__hint">
              {isVi
                ? 'Mật khẩu cần từ 12 đến 128 ký tự và hai ô phải giống nhau.'
                : 'Use 12–128 characters, and make sure both fields match.'}
            </p>
            <button className="auth-form__submit" disabled={pending} type="submit">
              {pending ? (
                <span className="auth-form__button-content">
                  <span className="auth-form__spinner" aria-hidden="true" />
                  <span>{isVi ? 'Đang cập nhật…' : 'Updating…'}</span>
                </span>
              ) : isVi ? (
                'Cập nhật mật khẩu'
              ) : (
                'Update password'
              )}
            </button>
          </form>
          {error ? (
            <div className="auth-form__error" role="alert">
              <span className="auth-form__error-icon" aria-hidden="true">
                !
              </span>
              <span>
                {password !== confirmation
                  ? isVi
                    ? 'Hai mật khẩu chưa giống nhau.'
                    : 'The passwords do not match.'
                  : isVi
                    ? 'Không thể cập nhật mật khẩu. Liên kết có thể đã hết hạn.'
                    : 'Could not update the password. The link may have expired.'}
              </span>
            </div>
          ) : null}
        </>
      )}
    </AuthPageShell>
  );
}

import { useState, type FormEvent } from 'react';
import { AuthPageShell } from './auth-page-shell.tsx';

export interface RegisterInputV1 {
  readonly email: string;
  readonly password: string;
  readonly locale: 'en' | 'vi-VN';
}

export function RegisterPage({
  locale,
  onRegistered,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly onRegistered: (input: RegisterInputV1) => void | Promise<unknown>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const isVi = locale === 'vi-VN';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      pending ||
      email.length < 3 ||
      password.length < 12 ||
      passwordConfirmation !== password
    ) {
      setError(true);
      return;
    }
    setPending(true);
    setError(false);
    try {
      const result = await onRegistered({ email, password, locale });
      if (typeof result === 'object' && result !== null && 'accepted' in result && result.accepted === false) {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthPageShell
      locale={locale}
      eyebrow={isVi ? 'Khởi tạo không gian' : 'Workspace Setup'}
      title={isVi ? 'Tạo tài khoản' : 'Create account'}
      description={isVi ? 'Tạo không gian riêng và xác minh email để bắt đầu.' : 'Set up your workspace and verify your email to start.'}
      footer={
        <p>
          {isVi ? 'Đã có tài khoản?' : 'Already have an account?'}{' '}
          <a href={`/${locale}/sign-in`} className="auth-card__link">
            {isVi ? 'Đăng nhập' : 'Sign in'}
          </a>
        </p>
      }
    >
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>
          <span className="auth-form__label-text">Email</span>
          <input
            autoComplete="username"
            name="email"
            type="email"
            placeholder={isVi ? 'ten@congty.com' : 'name@company.com'}
            required
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
        </label>
        <label>
          <span className="auth-form__label-text">{isVi ? 'Mật khẩu' : 'Password'}</span>
          <input
            autoComplete="new-password"
            name="password"
            type="password"
            minLength={12}
            placeholder="••••••••••••"
            required
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
        </label>
        <label>
          <span className="auth-form__label-text">{isVi ? 'Xác nhận mật khẩu' : 'Confirm password'}</span>
          <input
            autoComplete="new-password"
            name="passwordConfirmation"
            type="password"
            minLength={12}
            placeholder="••••••••••••"
            required
            value={passwordConfirmation}
            onChange={(event) => setPasswordConfirmation(event.currentTarget.value)}
          />
        </label>
        <p className="auth-form__hint">
          {isVi ? 'Mật khẩu cần ít nhất 12 ký tự.' : 'Use at least 12 characters for your password.'}
        </p>
        <button className="auth-form__submit" disabled={pending} type="submit">
          {pending ? (
            <span className="auth-form__button-content">
              <span className="auth-form__spinner" aria-hidden="true" />
              <span>{isVi ? 'Đang tạo…' : 'Creating…'}</span>
            </span>
          ) : (
            isVi ? 'Tiếp tục' : 'Continue'
          )}
        </button>
      </form>
      {error ? (
        <div className="auth-form__error" role="alert">
          <svg className="auth-form__error-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 5v4M8 11.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>{isVi ? 'Không thể đăng ký. Hãy thử lại.' : 'Could not register. Try again.'}</span>
        </div>
      ) : null}
    </AuthPageShell>
  );
}

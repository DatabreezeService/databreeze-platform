import { useState, type FormEvent } from 'react';
import { AuthPageShell } from './auth-page-shell.tsx';

type SignInActionResultV1 = { readonly accepted: boolean };

export function SignInPage({
  locale,
  onSignedIn,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly onSignedIn: (input: {
    readonly email: string;
    readonly password: string;
  }) => Promise<SignInActionResultV1> | SignInActionResultV1 | undefined;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const isVi = locale === 'vi-VN';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(false);
    try {
      const result = await onSignedIn({ email, password });
      if (result?.accepted === false) setError(true);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthPageShell
      locale={locale}
      title={isVi ? 'Đăng nhập' : 'Sign in'}
      description={
        isVi
          ? 'Nhập thông tin để vào không gian dữ liệu của bạn.'
          : 'Enter your credentials to access your workspace.'
      }
      footer={
        <p>
          {isVi ? 'Chưa có tài khoản?' : 'Don’t have an account?'}{' '}
          <a href={`/${locale}/register`} className="auth-card__link">
            {isVi ? 'Tạo tài khoản' : 'Create an account'}
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
        <div className="auth-form__label-row">
          <span className="auth-form__label-text">{isVi ? 'Mật khẩu' : 'Password'}</span>
          <a href={`/${locale}/forgot-password`} className="auth-form__forgot-link">
            {isVi ? 'Quên mật khẩu?' : 'Forgot password?'}
          </a>
        </div>
        <label>
          <input
            aria-label={isVi ? 'Mật khẩu' : 'Password'}
            autoComplete="current-password"
            name="password"
            type="password"
            placeholder="••••••••••••"
            required
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
        </label>
        <button className="auth-form__submit" disabled={pending} type="submit">
          {pending ? (
            <span className="auth-form__button-content">
              <span className="auth-form__spinner" aria-hidden="true" />
              <span>{isVi ? 'Đang kiểm tra…' : 'Signing in…'}</span>
            </span>
          ) : isVi ? (
            'Đăng nhập'
          ) : (
            'Sign in'
          )}
        </button>
      </form>
      {error ? (
        <div className="auth-form__error" role="alert">
          <svg
            className="auth-form__error-icon"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M8 5v4M8 11.5v.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <span>
            {isVi ? 'Email hoặc mật khẩu không đúng.' : 'Email or password is incorrect.'}
          </span>
        </div>
      ) : null}
    </AuthPageShell>
  );
}

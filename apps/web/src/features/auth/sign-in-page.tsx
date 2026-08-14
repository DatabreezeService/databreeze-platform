import { useState, type FormEvent } from 'react';
import { AuthPageShell } from './auth-page-shell.tsx';

export function SignInPage({ locale, onSignedIn }: {
  readonly locale: 'en' | 'vi-VN';
  readonly onSignedIn: (input: { readonly email: string; readonly password: string }) => Promise<unknown> | unknown;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true); setError(false);
    try {
      const result = await onSignedIn({ email, password });
      if (typeof result === 'object' && result !== null && 'accepted' in result && result.accepted === false) setError(true);
    } catch { setError(true); }
    finally { setPending(false); }
  };
  return (
    <AuthPageShell
      locale={locale}
      eyebrow={locale === 'vi-VN' ? 'Chào mừng trở lại' : 'Welcome back'}
      title={locale === 'vi-VN' ? 'Đăng nhập' : 'Sign in'}
      description={locale === 'vi-VN' ? 'Truy cập không gian làm việc của bạn.' : 'Access your governed workspace.'}
      footer={<p>{locale === 'vi-VN' ? 'Chưa có tài khoản?' : 'New to DataBreeze?'} <a href={`/${locale}/register`}>{locale === 'vi-VN' ? 'Tạo tài khoản' : 'Create an account'}</a></p>}
    >
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>Email<input autoComplete="username" name="email" type="email" required value={email} onChange={(event) => setEmail(event.currentTarget.value)} /></label>
        <label>{locale === 'vi-VN' ? 'Mật khẩu' : 'Password'}<input autoComplete="current-password" name="password" type="password" required value={password} onChange={(event) => setPassword(event.currentTarget.value)} /></label>
        <button className="auth-form__submit" disabled={pending} type="submit">{pending ? (locale === 'vi-VN' ? 'Đang kiểm tra…' : 'Signing in…') : (locale === 'vi-VN' ? 'Đăng nhập' : 'Sign in')}</button>
      </form>
      {error ? <p className="auth-form__error" role="alert">{locale === 'vi-VN' ? 'Email hoặc mật khẩu không đúng.' : 'Email or password is incorrect.'}</p> : null}
    </AuthPageShell>
  );
}

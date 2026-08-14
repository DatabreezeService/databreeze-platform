import { useState, type FormEvent } from 'react';
import { AuthPageShell } from './auth-page-shell.tsx';

export interface RegisterInputV1 {
  readonly email: string;
  readonly password: string;
  readonly locale: 'en' | 'vi-VN';
}

export function RegisterPage({ locale, onRegistered }: {
  readonly locale: 'en' | 'vi-VN';
  readonly onRegistered: (input: RegisterInputV1) => void | Promise<unknown>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
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
      if (typeof result === 'object' && result !== null && 'accepted' in result && result.accepted === false) setError(true);
    } catch { setError(true); }
    finally { setPending(false); }
  };
  return (
    <AuthPageShell
      locale={locale}
      eyebrow={locale === 'vi-VN' ? 'Bắt đầu cùng DataBreeze' : 'Start with DataBreeze'}
      title={locale === 'vi-VN' ? 'Tạo tài khoản' : 'Create account'}
      description={locale === 'vi-VN' ? 'Tạo không gian riêng và xác minh email để tiếp tục.' : 'Create your workspace and verify your email to continue.'}
      footer={<p>{locale === 'vi-VN' ? 'Đã có tài khoản?' : 'Already have an account?'} <a href={`/${locale}/sign-in`}>{locale === 'vi-VN' ? 'Đăng nhập' : 'Sign in'}</a></p>}
    >
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>Email<input autoComplete="username" name="email" type="email" required value={email} onChange={(event) => setEmail(event.currentTarget.value)} /></label>
        <label>{locale === 'vi-VN' ? 'Mật khẩu' : 'Password'}<input autoComplete="new-password" name="password" type="password" minLength={12} required value={password} onChange={(event) => setPassword(event.currentTarget.value)} /></label>
        <label>{locale === 'vi-VN' ? 'Xác nhận mật khẩu' : 'Confirm password'}<input autoComplete="new-password" name="passwordConfirmation" type="password" minLength={12} required value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.currentTarget.value)} /></label>
        <p className="auth-form__hint">{locale === 'vi-VN' ? 'Mật khẩu cần ít nhất 12 ký tự.' : 'Use at least 12 characters for your password.'}</p>
        <button className="auth-form__submit" disabled={pending} type="submit">{pending ? (locale === 'vi-VN' ? 'Đang tạo…' : 'Creating…') : (locale === 'vi-VN' ? 'Tiếp tục' : 'Continue')}</button>
      </form>
      {error ? <p className="auth-form__error" role="alert">{locale === 'vi-VN' ? 'Không thể đăng ký. Hãy thử lại.' : 'Could not register. Try again.'}</p> : null}
    </AuthPageShell>
  );
}

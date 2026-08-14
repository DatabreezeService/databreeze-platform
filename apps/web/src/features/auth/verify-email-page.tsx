import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AuthPageShell } from './auth-page-shell.tsx';

export function VerifyEmailPage({ locale, email, initialSeconds, onVerified }: {
  readonly locale: 'en' | 'vi-VN';
  readonly email: string;
  readonly initialSeconds: number;
  readonly onVerified: (input: { readonly code: string }) => Promise<unknown> | unknown;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const expiresAt = useMemo(() => Date.now() + initialSeconds * 1_000, [initialSeconds]);
  const [remainingSeconds, setRemainingSeconds] = useState(initialSeconds);
  useEffect(() => {
    if (remainingSeconds === 0) return undefined;
    const timer = globalThis.setInterval(
      () => setRemainingSeconds(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1_000))),
      250,
    );
    return () => globalThis.clearInterval(timer);
  }, [expiresAt, remainingSeconds]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || remainingSeconds === 0 || !/^\d{6}$/u.test(code)) { setError(true); return; }
    setPending(true); setError(false);
    try {
      const result = await onVerified({ code });
      if (typeof result === 'object' && result !== null && 'accepted' in result && result.accepted === false) setError(true);
    } catch { setError(true); }
    finally { setPending(false); }
  };
  return (
    <AuthPageShell
      locale={locale}
      eyebrow={locale === 'vi-VN' ? 'Bảo vệ tài khoản' : 'Secure your account'}
      title={locale === 'vi-VN' ? 'Xác minh email' : 'Verify email'}
      description={locale === 'vi-VN' ? 'Nhập mã 6 số đã gửi đến địa chỉ email của bạn.' : 'Enter the 6-digit code sent to your email address.'}
      footer={<p>{locale === 'vi-VN' ? 'Mã không đến?' : 'Didn’t receive the code?'} <a href={`/${locale}/register`}>{locale === 'vi-VN' ? 'Đăng ký lại' : 'Start again'}</a></p>}
    >
      <div className="auth-verification-summary"><span>{email}</span><strong>{remainingSeconds === 0 ? (locale === 'vi-VN' ? 'Mã đã hết hạn' : 'Code expired') : (locale === 'vi-VN' ? `Còn ${remainingSeconds} giây` : `${remainingSeconds} seconds remaining`)}</strong></div>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>OTP<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} name="otp" pattern="[0-9]{6}" required value={code} onChange={(event) => setCode(event.currentTarget.value.replace(/\D/gu, '').slice(0, 6))} /></label>
        <button className="auth-form__submit" disabled={pending || remainingSeconds === 0} type="submit">{pending ? (locale === 'vi-VN' ? 'Đang xác minh…' : 'Verifying…') : (locale === 'vi-VN' ? 'Xác minh' : 'Verify')}</button>
      </form>
      {error ? <p className="auth-form__error" role="alert">{locale === 'vi-VN' ? 'Không thể xác minh. Hãy thử lại.' : 'Could not verify. Try again.'}</p> : null}
    </AuthPageShell>
  );
}

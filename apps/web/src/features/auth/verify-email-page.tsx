import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AuthPageShell } from './auth-page-shell.tsx';

export function VerifyEmailPage({
  locale,
  email,
  initialSeconds,
  onVerified,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly email: string;
  readonly initialSeconds: number;
  readonly onVerified: (input: { readonly code: string }) => Promise<unknown> | unknown;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const isVi = locale === 'vi-VN';
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
    if (pending || remainingSeconds === 0 || !/^\d{6}$/u.test(code)) {
      setError(true);
      return;
    }
    setPending(true);
    setError(false);
    try {
      const result = await onVerified({ code });
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
      eyebrow={isVi ? 'Bảo vệ tài khoản' : 'Secure your account'}
      title={isVi ? 'Xác minh email' : 'Verify email'}
      description={isVi ? 'Nhập mã 6 số đã gửi đến địa chỉ email của bạn.' : 'Enter the 6-digit code sent to your email address.'}
      footer={
        <p>
          {isVi ? 'Mã không đến?' : 'Didn’t receive the code?'}{' '}
          <a href={`/${locale}/register`} className="auth-card__link">
            {isVi ? 'Đăng ký lại' : 'Start again'}
          </a>
        </p>
      }
    >
      <div className="auth-verification-summary">
        <span className="auth-verification-summary__email">{email}</span>
        <strong className={`auth-verification-summary__timer ${remainingSeconds === 0 ? 'auth-verification-summary__timer--expired' : ''}`}>
          <span className="auth-verification-summary__dot" aria-hidden="true" />
          {remainingSeconds === 0
            ? (isVi ? 'Mã đã hết hạn' : 'Code expired')
            : (isVi ? `Còn ${remainingSeconds} giây` : `${remainingSeconds} seconds remaining`)}
        </strong>
      </div>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <div className="auth-form__field">
          <label>
            <span className="auth-form__label-text">OTP</span>
            <input
              autoComplete="one-time-code"
              className="auth-form__otp-input"
              inputMode="numeric"
              maxLength={6}
              name="otp"
              pattern="[0-9]{6}"
              placeholder="••••••"
              required
              value={code}
              onChange={(event) => setCode(event.currentTarget.value.replace(/\D/gu, '').slice(0, 6))}
            />
          </label>
        </div>
        <button className="auth-form__submit" disabled={pending || remainingSeconds === 0} type="submit">
          {pending ? (
            <span className="auth-form__button-content">
              <span className="auth-form__spinner" aria-hidden="true" />
              <span>{isVi ? 'Đang xác minh…' : 'Verifying…'}</span>
            </span>
          ) : (
            isVi ? 'Xác minh' : 'Verify'
          )}
        </button>
      </form>
      {error ? (
        <div className="auth-form__error" role="alert">
          <svg className="auth-form__error-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 5v4M8 11.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>{isVi ? 'Không thể xác minh. Hãy thử lại.' : 'Could not verify. Try again.'}</span>
        </div>
      ) : null}
    </AuthPageShell>
  );
}

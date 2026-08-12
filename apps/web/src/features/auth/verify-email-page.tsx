import { useState } from 'react';

export function VerifyEmailPage({
  locale,
  email,
  initialSeconds,
  onVerified,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly email: string;
  readonly initialSeconds: number;
  readonly onVerified: () => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const [seconds] = useState(initialSeconds);

  return (
    <main className="auth-page">
      <h1>{locale === 'vi-VN' ? 'Xác minh email' : 'Verify email'}</h1>
      <p>{email}</p>
      <p>
        {locale === 'vi-VN' ? `Còn ${seconds} giây` : `${seconds} seconds remaining`}
      </p>
      <label>
        OTP
        <input inputMode="numeric" name="otp" />
      </label>
      <button
        type="button"
        onClick={() => {
          setError(
            locale === 'vi-VN'
              ? 'Không thể xác minh. Hãy thử lại.'
              : 'Could not verify. Try again.',
          );
          void onVerified;
        }}
      >
        {locale === 'vi-VN' ? 'Xác minh' : 'Verify'}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}

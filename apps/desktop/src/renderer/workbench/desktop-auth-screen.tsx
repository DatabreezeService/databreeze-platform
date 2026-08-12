import { useState, type FormEvent } from 'react';
import type { DesktopLocale } from '../../shared/desktop-contract-v1.ts';

export type DesktopAuthScreenProperties = {
  readonly locale: DesktopLocale;
  readonly onPasswordSignIn: (input: { email: string; password: string }) => void;
  readonly onVerifyOtp: (input: { code: string }) => void;
  readonly onRecover: (input: { email: string }) => void;
  readonly onGoogleOidc: () => void;
};

const LABELS = {
  'vi-VN': {
    heading: 'Đăng nhập Desktop',
    email: 'Email',
    password: 'Mật khẩu',
    otp: 'Mã OTP',
    signIn: 'Đăng nhập',
    verifyOtp: 'Xác minh OTP',
    recover: 'Khôi phục mật khẩu',
    google: 'Tiếp tục với Google',
  },
  en: {
    heading: 'Desktop sign-in',
    email: 'Email',
    password: 'Password',
    otp: 'OTP code',
    signIn: 'Sign in',
    verifyOtp: 'Verify OTP',
    recover: 'Recover password',
    google: 'Continue with Google',
  },
} as const;

export function DesktopAuthScreen({
  locale,
  onPasswordSignIn,
  onVerifyOtp,
  onRecover,
  onGoogleOidc,
}: DesktopAuthScreenProperties) {
  const copy = LABELS[locale];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');

  function handlePassword(event: FormEvent) {
    event.preventDefault();
    onPasswordSignIn({ email, password });
  }

  return (
    <section aria-labelledby="desktop-auth-heading" className="desktop-auth-screen">
      <h1 id="desktop-auth-heading">{copy.heading}</h1>
      <form className="desktop-auth-screen__form" onSubmit={handlePassword}>
        <label htmlFor="desktop-auth-email">{copy.email}</label>
        <input
          id="desktop-auth-email"
          autoComplete="username"
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          value={email}
        />
        <label htmlFor="desktop-auth-password">{copy.password}</label>
        <input
          id="desktop-auth-password"
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
        <button type="submit">{copy.signIn}</button>
      </form>
      <div className="desktop-auth-screen__secondary">
        <label htmlFor="desktop-auth-otp">{copy.otp}</label>
        <input
          id="desktop-auth-otp"
          inputMode="numeric"
          onChange={(event) => setOtp(event.target.value)}
          value={otp}
        />
        <button onClick={() => onVerifyOtp({ code: otp })} type="button">
          {copy.verifyOtp}
        </button>
        <button onClick={() => onRecover({ email })} type="button">
          {copy.recover}
        </button>
        <button onClick={onGoogleOidc} type="button">
          {copy.google}
        </button>
      </div>
    </section>
  );
}

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignInPage } from '../src/features/auth/sign-in-page.tsx';
import { RegisterPage } from '../src/features/auth/register-page.tsx';
import { VerifyEmailPage } from '../src/features/auth/verify-email-page.tsx';

describe('auth product surfaces', () => {
  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState({}, '', '/');
  });

  it('renders complete readable Vietnamese authentication copy', () => {
    render(<SignInPage locale="vi-VN" onSignedIn={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Đăng nhập' })).toBeTruthy();
    expect(screen.getByLabelText('Mật khẩu')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeTruthy();
  });

  it('fills the left half with brand story proofs beside a square form panel', () => {
    const { container } = render(<SignInPage locale="vi-VN" onSignedIn={() => undefined} />);

    expect(container.querySelector('.auth-page__story')).toBeTruthy();
    expect(container.querySelector('.auth-page__panel')).toBeTruthy();
    expect(container.querySelector('.auth-page__story-top .auth-brand')).toBeTruthy();
    expect(container.querySelector('canvas.auth-matrix')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'DataBreeze' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: /Dữ liệu biết cất lời/u })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Nguồn gốc minh bạch')).toBeTruthy();
    expect(screen.getByText('AI có kiểm chứng')).toBeTruthy();
    expect(screen.getByText('Cách ly theo tenant')).toBeTruthy();
    expect(screen.getByText(/Mỗi số liệu gắn với nguồn đã kiểm tra/u)).toBeTruthy();
  });

  it('keeps Home top-left and shows the current language in a flag dropdown', async () => {
    const user = userEvent.setup();
    render(<SignInPage locale="vi-VN" onSignedIn={() => undefined} />);

    expect(screen.getByRole('link', { name: 'Trang chủ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /tiếng việt/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /english/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: /tiếng việt/i }));
    expect(screen.getByRole('option', { name: /english/i }).getAttribute('href')).toBe('/en/sign-in');
    expect(screen.getByRole('option', { name: /tiếng việt/i }).getAttribute('href')).toBe(
      '/vi-VN/sign-in',
    );
  });

  it('labels the language menu as English on the English surface', async () => {
    const user = userEvent.setup();
    render(<SignInPage locale="en" onSignedIn={() => undefined} />);

    expect(screen.getByRole('link', { name: 'Home' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /english/i })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /english/i }));
    expect(screen.getByRole('option', { name: /english/i }).getAttribute('href')).toBe('/en/sign-in');
    expect(screen.getByRole('option', { name: /tiếng việt/i }).getAttribute('href')).toBe(
      '/vi-VN/sign-in',
    );
  });

  it('preserves the current auth path when switching locale', async () => {
    window.history.replaceState({}, '', '/vi-VN/register');
    const user = userEvent.setup();
    render(<RegisterPage locale="vi-VN" onRegistered={() => undefined} />);

    await user.click(screen.getByRole('button', { name: /tiếng việt/i }));
    expect(screen.getByRole('option', { name: /english/i }).getAttribute('href')).toBe(
      '/en/register',
    );
    expect(screen.getByRole('option', { name: /tiếng việt/i }).getAttribute('href')).toBe(
      '/vi-VN/register',
    );
  });

  it('renders Vietnamese email/password sign-in without keep-me-signed-in or display name', () => {
    render(<SignInPage locale="vi-VN" onSignedIn={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Đăng nhập' })).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Mật khẩu')).toBeTruthy();
    expect(screen.queryByLabelText(/keep me signed in/i)).toBeNull();
    expect(screen.queryByLabelText(/display name/i)).toBeNull();
  });

  it('registers with email only and no display name field', () => {
    render(<RegisterPage locale="en" onRegistered={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Create account' })).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByLabelText('Confirm password')).toBeTruthy();
    expect(screen.queryByLabelText(/display name/i)).toBeNull();
  });

  it('does not submit registration until password confirmation matches', async () => {
    const user = userEvent.setup();
    const submitted: unknown[] = [];
    render(
      <RegisterPage
        locale="en"
        onRegistered={(value) => {
          submitted.push(value);
        }}
      />,
    );
    await user.type(screen.getByLabelText('Email'), 'owner@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await user.type(screen.getByLabelText('Confirm password'), 'different password value');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(submitted).toEqual([]);
    expect(screen.getByRole('alert').textContent).toContain('Could not register');
  });

  it('submits registration values and opens OTP only after a challenge is accepted', async () => {
    const user = userEvent.setup();
    const submitted: unknown[] = [];
    render(
      <RegisterPage
        locale="vi-VN"
        onRegistered={(value) => {
          submitted.push(value);
        }}
      />,
    );
    await user.type(screen.getByLabelText('Email'), 'owner@example.com');
    await user.type(screen.getByLabelText('Mật khẩu'), 'correct horse battery staple');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(submitted).toEqual([
      { email: 'owner@example.com', password: 'correct horse battery staple', locale: 'vi-VN' },
    ]);
  });

  it('shows OTP countdown and generic auth errors', async () => {
    const user = userEvent.setup();
    render(
      <VerifyEmailPage
        locale="vi-VN"
        email="user@example.com"
        initialSeconds={30}
        onVerified={async (value) => {
          expect(value).toEqual({ code: '123456' });
          return { accepted: false as const };
        }}
      />,
    );
    expect(screen.getByText(/còn 30 giây/i)).toBeTruthy();
    await user.type(screen.getByLabelText('OTP'), '123456');
    await user.click(screen.getByRole('button', { name: 'Xác minh' }));
    expect(screen.getByText('Không thể xác minh. Hãy thử lại.')).toBeTruthy();
  });

  it('counts the OTP lifetime down and disables verification after expiry', async () => {
    vi.useFakeTimers();
    render(
      <VerifyEmailPage
        locale="en"
        email="user@example.com"
        initialSeconds={2}
        onVerified={() => ({ accepted: true as const })}
      />,
    );

    expect(screen.getByText('2 seconds remaining')).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(screen.getByText('Code expired')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verify' })).toHaveProperty('disabled', true);
  });
});

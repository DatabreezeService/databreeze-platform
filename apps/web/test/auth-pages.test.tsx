import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SignInPage } from '../src/features/auth/sign-in-page.tsx';
import { RegisterPage } from '../src/features/auth/register-page.tsx';
import { VerifyEmailPage } from '../src/features/auth/verify-email-page.tsx';

describe('auth product surfaces', () => {
  it('renders Vietnamese sign-in without keep-me-signed-in or display name', () => {
    render(<SignInPage locale="vi-VN" onSignedIn={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Đăng nhập' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đăng nhập bằng Google' })).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Mật khẩu')).toBeTruthy();
    expect(screen.queryByLabelText(/keep me signed in/i)).toBeNull();
    expect(screen.queryByLabelText(/display name/i)).toBeNull();
    expect(screen.queryByLabelText(/tên hiển thị/i)).toBeNull();
  });

  it('registers with email only and no display name field', () => {
    render(<RegisterPage locale="en" onRegistered={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Create account' })).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.queryByLabelText(/display name/i)).toBeNull();
  });

  it('shows OTP countdown and generic auth errors', async () => {
    const user = userEvent.setup();
    render(
      <VerifyEmailPage
        locale="vi-VN"
        email="user@example.com"
        initialSeconds={30}
        onVerified={() => undefined}
      />,
    );
    expect(screen.getByText(/còn 30 giây/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Xác minh' }));
    expect(screen.getByText('Không thể xác minh. Hãy thử lại.')).toBeTruthy();
  });
});

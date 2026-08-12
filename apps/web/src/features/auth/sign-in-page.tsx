export function SignInPage({
  locale,
  onSignedIn,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly onSignedIn: () => void;
}) {
  return (
    <main className="auth-page">
      <h1>{locale === 'vi-VN' ? 'Đăng nhập' : 'Sign in'}</h1>
      <button type="button" onClick={onSignedIn}>
        {locale === 'vi-VN' ? 'Đăng nhập bằng Google' : 'Sign in with Google'}
      </button>
      <label>
        Email
        <input autoComplete="username" name="email" type="email" />
      </label>
      <label>
        {locale === 'vi-VN' ? 'Mật khẩu' : 'Password'}
        <input autoComplete="current-password" name="password" type="password" />
      </label>
      <button type="button" onClick={onSignedIn}>
        {locale === 'vi-VN' ? 'Đăng nhập' : 'Sign in'}
      </button>
    </main>
  );
}

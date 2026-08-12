export function RegisterPage({
  locale,
  onRegistered,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly onRegistered: () => void;
}) {
  return (
    <main className="auth-page">
      <h1>{locale === 'vi-VN' ? 'Tạo tài khoản' : 'Create account'}</h1>
      <label>
        Email
        <input autoComplete="username" name="email" type="email" />
      </label>
      <label>
        {locale === 'vi-VN' ? 'Mật khẩu' : 'Password'}
        <input autoComplete="new-password" name="password" type="password" />
      </label>
      <button type="button" onClick={onRegistered}>
        {locale === 'vi-VN' ? 'Tiếp tục' : 'Continue'}
      </button>
    </main>
  );
}

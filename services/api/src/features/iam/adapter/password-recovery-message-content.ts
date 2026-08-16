import type { RecoveryLocaleV1 } from '../application/recovery-repository.port.js';
import { validRecoveryLocaleV1 } from './password-recovery-delivery.utils.js';

const RECOVERY_LINK_LIFETIME_MINUTES = 60;

export interface PasswordRecoveryMessageContentV1 {
  readonly subject: string;
  readonly textBody: string;
  readonly htmlBody: string;
}

const COPY = {
  'vi-VN': {
    subject: 'Đặt lại mật khẩu DataBreeze',
    eyebrow: 'BẢO MẬT TÀI KHOẢN',
    title: 'Đặt lại mật khẩu',
    intro: 'Bạn vừa yêu cầu tạo một mật khẩu mới cho tài khoản DataBreeze của mình.',
    button: 'Tạo mật khẩu mới',
    fallback: 'Nếu nút không hoạt động, hãy mở liên kết này:',
    expiry: `Liên kết này có hiệu lực trong ${RECOVERY_LINK_LIFETIME_MINUTES} phút và chỉ dùng được một lần.`,
    safety:
      'Nếu bạn không yêu cầu thay đổi này, hãy bỏ qua email. Mật khẩu hiện tại của bạn vẫn được giữ nguyên.',
    footer: 'Email tự động từ DataBreeze. Vui lòng không trả lời email này.',
  },
  en: {
    subject: 'Reset your DataBreeze password',
    eyebrow: 'ACCOUNT SECURITY',
    title: 'Reset your password',
    intro: 'You requested a new password for your DataBreeze account.',
    button: 'Create a new password',
    fallback: 'If the button does not work, open this link:',
    expiry: `This link expires in ${RECOVERY_LINK_LIFETIME_MINUTES} minutes and can only be used once.`,
    safety:
      'If you did not request this change, you can ignore this email. Your current password will remain unchanged.',
    footer: 'Automated email from DataBreeze. Please do not reply.',
  },
} as const satisfies Record<RecoveryLocaleV1, Record<string, string>>;

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
}

function validResetUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const token = parsed.searchParams.get('token');
    const localHttp =
      parsed.protocol === 'http:' &&
      (parsed.hostname === '127.0.0.1' ||
        parsed.hostname === 'localhost' ||
        parsed.hostname === '::1' ||
        parsed.hostname === '[::1]');
    return (
      (parsed.protocol === 'https:' || localHttp) &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.pathname === `/${parsed.pathname.split('/')[1]}/reset-password` &&
      (parsed.pathname.startsWith('/en/') || parsed.pathname.startsWith('/vi-VN/')) &&
      token !== null &&
      /^[A-Za-z0-9_-]{32,512}$/u.test(token) &&
      [...parsed.searchParams.keys()].every((key) => key === 'token')
    );
  } catch {
    return false;
  }
}

export function createPasswordRecoveryMessageContentV1(
  localeInput: string,
  resetUrl: string,
): PasswordRecoveryMessageContentV1 | undefined {
  if (!validRecoveryLocaleV1(localeInput) || !validResetUrl(resetUrl)) return undefined;
  const locale = localeInput;
  const copy = COPY[locale];
  const escapedUrl = escapeHtml(resetUrl);
  const textBody = [
    copy.title,
    '',
    copy.intro,
    '',
    `${copy.fallback} ${resetUrl}`,
    '',
    copy.expiry,
    copy.safety,
    '',
    copy.footer,
  ].join('\n');
  const htmlBody = `<!doctype html>
<html lang="${locale === 'vi-VN' ? 'vi' : 'en'}">
  <body style="margin:0;background:#080b24;color:#f7f7ff;font-family:Inter,Segoe UI,Arial,sans-serif;">
    <div style="padding:32px 16px;background:#080b24;">
      <div style="max-width:560px;margin:0 auto;">
        <div style="padding:0 8px 24px;">
          <div style="display:inline-flex;align-items:center;gap:10px;color:#f7f7ff;font-size:18px;font-weight:700;letter-spacing:-.02em;">
            <span style="display:inline-flex;width:30px;height:30px;align-items:center;justify-content:center;border-radius:8px;background:#3d50ff;color:#fff;font-size:16px;font-weight:800;">D</span>
            <span>DataBreeze</span>
          </div>
        </div>
        <div style="overflow:hidden;border:1px solid rgba(150,161,255,.22);border-radius:18px;background:#101438;box-shadow:0 18px 50px rgba(0,0,0,.25);">
          <div style="height:5px;background:linear-gradient(90deg,#3d50ff,#7b89ff,#3d50ff);"></div>
          <div style="padding:36px 34px 32px;">
            <div style="color:#8d9bff;font-size:11px;font-weight:800;letter-spacing:.14em;">${copy.eyebrow}</div>
            <h1 style="margin:12px 0 14px;color:#fff;font-size:30px;line-height:1.15;letter-spacing:-.04em;">${copy.title}</h1>
            <p style="margin:0;color:#c6cbed;font-size:16px;line-height:1.65;">${copy.intro}</p>
            <div style="padding:28px 0 22px;text-align:center;">
              <a href="${escapedUrl}" style="display:inline-block;padding:14px 22px;border-radius:9px;background:#4c5fff;color:#fff;font-size:15px;font-weight:700;text-decoration:none;">${copy.button}</a>
            </div>
            <p style="margin:0;color:#8f96bd;font-size:12px;line-height:1.6;">${copy.fallback}</p>
            <p style="margin:7px 0 0;word-break:break-all;color:#8d9bff;font-size:12px;line-height:1.6;"><a href="${escapedUrl}" style="color:#aeb8ff;">${escapedUrl}</a></p>
            <div style="margin-top:24px;padding:14px 16px;border:1px solid rgba(141,155,255,.2);border-radius:10px;background:rgba(61,80,255,.08);color:#c6cbed;font-size:13px;line-height:1.6;">${copy.expiry}</div>
            <p style="margin:22px 0 0;color:#8f96bd;font-size:12px;line-height:1.65;">${copy.safety}</p>
          </div>
        </div>
        <p style="margin:18px 8px 0;color:#737ba7;font-size:11px;line-height:1.6;">${copy.footer}</p>
      </div>
    </div>
  </body>
</html>`;
  return Object.freeze({ subject: copy.subject, textBody, htmlBody });
}

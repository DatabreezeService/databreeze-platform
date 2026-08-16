export interface EmailVerificationMessageContentV1 {
  readonly subject: string;
  readonly textBody: string;
  readonly htmlBody: string;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => HTML_ESCAPES[character] ?? character);
}

function renderHtml(input: {
  readonly language: 'en' | 'vi';
  readonly preheader: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly introduction: string;
  readonly codeLabel: string;
  readonly expires: string;
  readonly security: string;
  readonly notRequested: string;
  readonly footer: string;
  readonly code: string;
}): string {
  const code = escapeHtml(input.code);
  const language = input.language;
  return `<!doctype html>
<html lang="${language}">
  <head>
    <meta charset="utf-8">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f6fb;color:#172033;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeHtml(input.preheader)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background-color:#f3f6fb;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:separate;">
            <tr>
              <td style="padding:0 0 18px 4px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                  <tr>
                    <td align="center" valign="middle" style="width:36px;height:36px;border-radius:10px;background-color:#1d4ed8;color:#ffffff;font-size:15px;font-weight:700;letter-spacing:-0.5px;">
                      DB
                    </td>
                    <td style="padding-left:10px;color:#172033;font-size:18px;font-weight:700;letter-spacing:-0.3px;">
                      DataBreeze
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="overflow:hidden;border:1px solid #e2e8f0;border-radius:18px;background-color:#ffffff;box-shadow:0 12px 32px rgba(23,32,51,0.08);">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td style="height:6px;background-color:#1d4ed8;font-size:0;line-height:0;">&nbsp;</td>
                  </tr>
                  <tr>
                    <td style="padding:38px 40px 36px;">
                      <p style="margin:0 0 14px;color:#1d4ed8;font-size:12px;font-weight:700;letter-spacing:1.8px;line-height:18px;">
                        ${escapeHtml(input.eyebrow)}
                      </p>
                      <h1 style="margin:0;color:#172033;font-size:30px;font-weight:700;letter-spacing:-0.7px;line-height:38px;">
                        ${escapeHtml(input.title)}
                      </h1>
                      <p style="margin:16px 0 0;color:#526176;font-size:16px;line-height:26px;">
                        ${escapeHtml(input.introduction)}
                      </p>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:28px 0 20px;border-collapse:separate;">
                        <tr>
                          <td align="center" style="padding:20px 16px 18px;border:1px solid #c7d2fe;border-radius:14px;background-color:#eef2ff;">
                            <p style="margin:0 0 8px;color:#4f5f82;font-size:12px;font-weight:700;letter-spacing:1.2px;line-height:18px;text-transform:uppercase;">
                              ${escapeHtml(input.codeLabel)}
                            </p>
                            <p style="margin:0;color:#172033;font-size:36px;font-weight:700;letter-spacing:8px;line-height:44px;font-variant-numeric:tabular-nums;">
                              ${code}
                            </p>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:0;color:#172033;font-size:15px;line-height:24px;">
                        <strong>${escapeHtml(input.expires)}</strong>
                      </p>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:24px;border-collapse:separate;">
                        <tr>
                          <td style="padding:14px 16px;border-left:3px solid #1d4ed8;background-color:#f8fafc;color:#526176;font-size:14px;line-height:22px;">
                            ${escapeHtml(input.security)}
                          </td>
                        </tr>
                      </table>
                      <p style="margin:24px 0 0;color:#718096;font-size:14px;line-height:22px;">
                        ${escapeHtml(input.notRequested)}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:22px 12px 0;color:#718096;font-size:12px;line-height:20px;">
                ${escapeHtml(input.footer)}<br>
                © DataBreeze
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** IAM-022: localized OTP content with a safe text fallback and branded HTML presentation. */
export function createEmailVerificationMessageContentV1(
  locale: string,
  code: string,
): EmailVerificationMessageContentV1 | undefined {
  if (locale === 'vi-VN') {
    return Object.freeze({
      subject: 'Mã xác minh DataBreeze',
      textBody: `Mã xác minh DataBreeze của bạn là ${code}. Mã này hết hạn sau 10 phút. Nếu bạn không yêu cầu mã này, hãy bỏ qua email.`,
      htmlBody: renderHtml({
        language: 'vi',
        preheader: 'Mã xác minh DataBreeze của bạn có hiệu lực trong 10 phút.',
        eyebrow: 'XÁC MINH EMAIL',
        title: 'Xác minh email của bạn',
        introduction: 'Sử dụng mã bên dưới để hoàn tất việc tạo tài khoản DataBreeze.',
        codeLabel: 'Mã xác minh',
        expires: 'Mã này hết hạn sau 10 phút.',
        security: 'Để bảo vệ tài khoản, không chia sẻ mã này với bất kỳ ai.',
        notRequested: 'Nếu bạn không yêu cầu mã này, bạn có thể bỏ qua email này.',
        footer: 'Không gian làm việc an toàn cho doanh nghiệp',
        code,
      }),
    });
  }
  if (locale === 'en') {
    return Object.freeze({
      subject: 'Your DataBreeze verification code',
      textBody: `Your DataBreeze verification code is ${code}. It expires in 10 minutes. If you did not request this code, ignore this email.`,
      htmlBody: renderHtml({
        language: 'en',
        preheader: 'Your DataBreeze verification code is valid for 10 minutes.',
        eyebrow: 'EMAIL VERIFICATION',
        title: 'Verify your email',
        introduction: 'Use the code below to finish creating your DataBreeze account.',
        codeLabel: 'Verification code',
        expires: 'This code expires in 10 minutes.',
        security: 'For your security, never share this code with anyone.',
        notRequested: 'If you did not request this code, you can safely ignore this email.',
        footer: 'Secure workspaces for better decisions',
        code,
      }),
    });
  }
  return undefined;
}

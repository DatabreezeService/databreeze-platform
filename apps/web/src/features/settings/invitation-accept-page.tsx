import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { createAuthApiV1 } from '../auth/auth-api.ts';
import { rememberAuthBootstrapV1 } from '../auth/auth-session.ts';
import { acceptWorkspaceInvitation } from './invitation-api.ts';
import './workspace-settings.css';

export function InvitationAcceptPage() {
  const { locale = 'vi-VN' } = useParams();
  const [params] = useSearchParams();
  const [state, setState] = useState<'loading' | 'accepted' | 'error'>('loading');
  const [error, setError] = useState<string>();
  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setState('error');
      setError('INVITATION_TOKEN_INVALID');
      return;
    }
    void acceptWorkspaceInvitation(token)
      .then(async () => {
        // Acceptance changes the server-visible workspace tree. Refresh the
        // authenticated bootstrap so the switcher reflects the new membership
        // immediately; the invitation itself remains accepted if this optional
        // projection refresh is temporarily unavailable.
        try {
          const bootstrap = await createAuthApiV1().loadBootstrap();
          if (bootstrap.accepted) rememberAuthBootstrapV1(bootstrap.value);
        } catch {
          // The membership is already accepted; a later reload can refresh the
          // workspace tree if the optional projection request is unavailable.
        }
        setState('accepted');
      })
      .catch((reason: unknown) => {
        setState('error');
        setError(reason instanceof Error ? reason.message : 'INVITATION_ACCEPT_FAILED');
      });
  }, [params]);
  const english = locale === 'en';
  const title =
    state === 'accepted'
      ? english
        ? 'You are in'
        : 'Bạn đã tham gia workspace'
      : state === 'loading'
        ? english
          ? 'Accepting your invitation'
          : 'Đang xác nhận lời mời'
        : english
          ? 'This invitation could not be accepted'
          : 'Không thể xác nhận lời mời';
  return (
    <section className="workspace-settings-page workspace-invitation-accept" aria-live="polite">
      <p className="workspace-settings-page__eyebrow">
        {english ? 'WORKSPACE INVITATION' : 'LỜI MỜI WORKSPACE'}
      </p>
      <h1>{title}</h1>
      {state === 'loading' ? (
        <p className="workspace-settings-page__intro">
          {english
            ? 'The server is checking the one-time invitation for this signed-in account.'
            : 'Server đang kiểm tra lời mời một lần cho tài khoản đang đăng nhập.'}
        </p>
      ) : null}
      {state === 'accepted' ? (
        <p className="workspace-settings-page__intro">
          {english
            ? 'Your membership is active. You can now open workspace settings or continue to Data.'
            : 'Tư cách thành viên đã hoạt động. Bạn có thể mở cài đặt workspace hoặc tiếp tục với Dữ liệu.'}
        </p>
      ) : null}
      {state === 'error' ? (
        <p
          className="workspace-settings-page__notice workspace-settings-page__notice--error"
          role="alert"
        >
          {error === 'INVITATION_TOKEN_INVALID'
            ? english
              ? 'The invitation link is missing or malformed.'
              : 'Liên kết lời mời bị thiếu hoặc không hợp lệ.'
            : error === 'INVITATION_SCOPE_DENIED'
              ? english
                ? 'This invitation belongs to another signed-in account.'
                : 'Lời mời này thuộc về một tài khoản khác.'
              : english
                ? 'The invitation is expired, already used, or unavailable.'
                : 'Lời mời đã hết hạn, đã dùng hoặc không khả dụng.'}
        </p>
      ) : null}
      <div className="workspace-invitation-accept__actions">
        <Link to={`/${locale}/settings`}>
          {english ? 'Open workspace settings' : 'Mở cài đặt workspace'}
        </Link>
        <Link to={`/${locale}/data`}>{english ? 'Go to Data' : 'Mở Dữ liệu'}</Link>
      </div>
    </section>
  );
}

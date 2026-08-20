import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../app/locale-context.tsx';
import { currentAuthBootstrapV1 } from '../auth/auth-session.ts';
import { appMessage } from '../../app/messages.ts';
import { listDevices, type DeviceRow, DeviceReadError } from './device-api.ts';
import './device-page.css';

function compactIdentifier(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function statusLabel(locale: string, status: DeviceRow['status']): string {
  const vi = { PENDING: 'Đang chờ', ACTIVE: 'Đang hoạt động', REVOKED: 'Đã thu hồi' };
  const en = { PENDING: 'Pending', ACTIVE: 'Active', REVOKED: 'Revoked' };
  return (locale === 'en' ? en : vi)[status];
}

function platformLabel(locale: string, platform: DeviceRow['platform']): string {
  return platform === 'WINDOWS' ? 'Windows' : locale === 'en' ? 'Android' : 'Android';
}

export function DevicePage() {
  const locale = useLocale();
  const english = locale === 'en';
  const organizationId = currentAuthBootstrapV1()?.session.organizationId;
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'forbidden'>('loading');
  const [items, setItems] = useState<readonly DeviceRow[]>([]);
  const [errorCode, setErrorCode] = useState<DeviceReadError['code']>();

  const load = useCallback(async () => {
    if (organizationId === undefined) {
      setState('error');
      return;
    }
    setState('loading');
    try {
      setItems(await listDevices(organizationId));
      setState('ready');
      setErrorCode(undefined);
    } catch (error) {
      const code = error instanceof DeviceReadError ? error.code : 'UNAVAILABLE';
      setErrorCode(code);
      setState(code === 'FORBIDDEN' ? 'forbidden' : 'error');
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-labelledby="devices-heading" className="governance-page device-page">
      <header className="governance-page__hero">
        <div>
          <p className="governance-page__eyebrow">
            {english ? 'TRUSTED ACCESS' : 'TRUY CẬP ĐƯỢC TIN CẬY'}
          </p>
          <h1 id="devices-heading">{english ? 'Devices' : 'Thiết bị'}</h1>
          <p>
            {english
              ? 'See the desktop and mobile identities connected to your organization.'
              : 'Xem các danh tính Desktop và mobile đã kết nối với tổ chức của bạn.'}
          </p>
        </div>
        <div className="governance-page__hero-mark" aria-hidden="true">
          IAM
        </div>
      </header>
      {state === 'loading' ? (
        <div className="governance-state" role="status">
          {english ? 'Loading devices…' : 'Đang tải thiết bị…'}
        </div>
      ) : null}
      {state === 'forbidden' ? (
        <div className="governance-state governance-state--error" role="alert">
          <strong>
            {english
              ? 'You cannot view organization devices.'
              : 'Bạn không có quyền xem thiết bị của tổ chức.'}
          </strong>
          <span>
            {english
              ? 'The server denied this organization scope.'
              : 'Máy chủ đã từ chối phạm vi tổ chức này.'}
          </span>
        </div>
      ) : null}
      {state === 'error' ? (
        <div className="governance-state governance-state--error" role="alert">
          <strong>
            {errorCode === 'INVALID_RESPONSE'
              ? english
                ? 'The device response was invalid.'
                : 'Dữ liệu thiết bị không đúng contract.'
              : english
                ? 'Devices are unavailable.'
                : 'Chưa thể tải thiết bị.'}
          </strong>
          <span>
            {english
              ? 'No enrollment or revocation was sent.'
              : 'Không có thao tác ghi danh hay thu hồi nào được gửi.'}
          </span>
          <button onClick={() => void load()} type="button">
            {english ? 'Retry safely' : 'Thử lại an toàn'}
          </button>
        </div>
      ) : null}
      {state === 'ready' ? (
        items.length === 0 ? (
          <div className="governance-empty" role="status">
            <span className="governance-empty__icon" aria-hidden="true">
              ⌁
            </span>
            <h2>{english ? 'No devices connected yet' : 'Chưa có thiết bị nào được kết nối'}</h2>
            <p>
              {english
                ? 'Secure enrollment will appear here when a supported device completes proof of possession.'
                : 'Thiết bị chỉ xuất hiện sau khi hoàn tất ghi danh và chứng minh quyền sở hữu an toàn.'}
            </p>
          </div>
        ) : (
          <div
            className="device-list"
            aria-label={english ? 'Organization devices' : 'Thiết bị trong tổ chức'}
          >
            {items.map((device) => (
              <article className="device-card" key={device.id}>
                <div className="device-card__icon" aria-hidden="true">
                  {device.platform === 'WINDOWS' ? '▣' : '▤'}
                </div>
                <div className="device-card__body">
                  <div className="device-card__heading">
                    <div>
                      <h2>{platformLabel(locale, device.platform)}</h2>
                      <p>{compactIdentifier(device.id)}</p>
                    </div>
                    <span className={`device-card__status is-${device.status.toLowerCase()}`}>
                      {statusLabel(locale, device.status)}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>{english ? 'Enrolled' : 'Đã ghi danh'}</dt>
                      <dd>
                        {new Intl.DateTimeFormat(english ? 'en-US' : 'vi-VN', {
                          dateStyle: 'medium',
                        }).format(new Date(device.enrolledAt))}
                      </dd>
                    </div>
                    <div>
                      <dt>{english ? 'Security epoch' : 'Epoch bảo mật'}</dt>
                      <dd>{device.securityEpoch}</dd>
                    </div>
                    <div>
                      <dt>{english ? 'Revision' : 'Revision'}</dt>
                      <dd>{device.revision}</dd>
                    </div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        )
      ) : null}
      <p className="governance-page__note">
        {appMessage(locale, 'access.clientHint')}{' '}
        {english
          ? 'Enrollment, key rotation, and revocation remain protected operations.'
          : 'Ghi danh, xoay khóa và thu hồi vẫn là thao tác được bảo vệ.'}
      </p>
    </section>
  );
}

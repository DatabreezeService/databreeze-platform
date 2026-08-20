import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../app/locale-context.tsx';
import { appMessage } from '../../app/messages.ts';
import { listAuditEvents, type AuditEventRow, AuditReadError } from './audit-api.ts';
import './audit-page.css';

function formatTimestamp(locale: string, value: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function compactIdentifier(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function Summary({ event }: { readonly event: AuditEventRow }) {
  const entries = Object.entries(event.summary);
  if (entries.length === 0) return null;
  return (
    <details className="audit-event__summary">
      <summary>{entries.length} metadata</summary>
      <dl>
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value === null ? '—' : String(value)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function AuditPage() {
  const locale = useLocale();
  const english = locale === 'en';
  const [items, setItems] = useState<readonly AuditEventRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'integrity'>('loading');
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (cursor?: string) => {
    if (cursor === undefined) setState('loading');
    else setLoadingMore(true);
    try {
      const page = await listAuditEvents({
        ...(cursor === undefined ? {} : { cursor }),
        limit: 40,
      });
      setItems((previous) => (cursor === undefined ? page.items : [...previous, ...page.items]));
      setNextCursor(page.nextCursor);
      setState('ready');
    } catch (error) {
      if (error instanceof AuditReadError && error.code === 'INTEGRITY') setState('integrity');
      else setState('error');
    } finally {
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-labelledby="audit-heading" className="governance-page audit-page">
      <header className="governance-page__hero">
        <div>
          <p className="governance-page__eyebrow">
            {english ? 'TRUST & HISTORY' : 'TIN CẬY & LỊCH SỬ'}
          </p>
          <h1 id="audit-heading">{english ? 'Audit history' : 'Nhật ký kiểm toán'}</h1>
          <p>
            {english
              ? 'A content-safe record of changes in this workspace. Every row is read from the server ledger.'
              : 'Lịch sử an toàn nội dung của workspace. Mỗi dòng đều được đọc từ audit ledger của máy chủ.'}
          </p>
        </div>
        <div className="governance-page__hero-mark" aria-hidden="true">
          AUD
        </div>
      </header>

      {state === 'loading' ? (
        <div className="governance-state governance-state--loading" role="status">
          {english ? 'Loading audit history…' : 'Đang tải lịch sử kiểm toán…'}
        </div>
      ) : null}
      {state === 'error' ? (
        <div className="governance-state governance-state--error" role="alert">
          <strong>
            {english ? 'Audit history is unavailable.' : 'Chưa thể tải lịch sử kiểm toán.'}
          </strong>
          <span>
            {english
              ? 'No data was changed. Retry when the governance service is ready.'
              : 'Không có dữ liệu nào bị thay đổi. Hãy thử lại khi dịch vụ quản trị sẵn sàng.'}
          </span>
          <button onClick={() => void load()} type="button">
            {english ? 'Retry safely' : 'Thử lại an toàn'}
          </button>
        </div>
      ) : null}
      {state === 'integrity' ? (
        <div className="governance-state governance-state--error" role="alert">
          <strong>
            {english ? 'Audit integrity needs attention.' : 'Audit ledger cần được kiểm tra.'}
          </strong>
          <span>
            {english
              ? 'The server refused to present a possibly broken chain as an empty history.'
              : 'Máy chủ không hiển thị chuỗi có thể bị lỗi như một lịch sử trống.'}
          </span>
          <button onClick={() => void load()} type="button">
            {english ? 'Check again' : 'Kiểm tra lại'}
          </button>
        </div>
      ) : null}
      {state === 'ready' ? (
        <>
          <div
            className="governance-page__metrics"
            aria-label={english ? 'Audit summary' : 'Tóm tắt kiểm toán'}
          >
            <div>
              <span>{english ? 'Events shown' : 'Sự kiện đang hiển thị'}</span>
              <strong>{items.length}</strong>
            </div>
            <div>
              <span>{english ? 'Latest sequence' : 'Sequence mới nhất'}</span>
              <strong>{items.at(-1)?.sequence ?? '—'}</strong>
            </div>
            <div>
              <span>{english ? 'Scope' : 'Phạm vi'}</span>
              <strong>{english ? 'Workspace' : 'Workspace'}</strong>
            </div>
          </div>
          {items.length === 0 ? (
            <div className="governance-empty" role="status">
              <span className="governance-empty__icon" aria-hidden="true">
                ✦
              </span>
              <h2>
                {english ? 'Your history will appear here' : 'Lịch sử của bạn sẽ xuất hiện ở đây'}
              </h2>
              <p>
                {english
                  ? 'Sign-ins, workspace changes, imports, approvals, and billing actions are recorded only after the server accepts them.'
                  : 'Đăng nhập, thay đổi workspace, nhập dữ liệu, phê duyệt và thanh toán chỉ xuất hiện sau khi máy chủ ghi nhận thành công.'}
              </p>
            </div>
          ) : (
            <div
              className="audit-event-list"
              aria-label={english ? 'Audit events' : 'Sự kiện kiểm toán'}
            >
              {items.map((event) => (
                <article className="audit-event" key={event.eventId}>
                  <div className="audit-event__sequence" aria-label={`#${event.sequence}`}>
                    {event.sequence}
                  </div>
                  <div className="audit-event__body">
                    <div className="audit-event__heading">
                      <div>
                        <h2>{event.action}</h2>
                        <p>{formatTimestamp(locale, event.occurredAt)}</p>
                      </div>
                      <span className="audit-event__actor">
                        {event.actorType} · {compactIdentifier(event.actorId)}
                      </span>
                    </div>
                    <div className="audit-event__entity">
                      <span>{event.entityType}</span>
                      <code>{compactIdentifier(event.entityId)}</code>
                      <span>v{event.entityRevision}</span>
                    </div>
                    <Summary event={event} />
                  </div>
                </article>
              ))}
            </div>
          )}
          {nextCursor !== undefined ? (
            <button
              className="governance-page__load-more"
              disabled={loadingMore}
              onClick={() => void load(nextCursor)}
              type="button"
            >
              {loadingMore
                ? english
                  ? 'Loading…'
                  : 'Đang tải…'
                : english
                  ? 'Load older events'
                  : 'Tải sự kiện cũ hơn'}
            </button>
          ) : null}
          <p className="governance-page__note">{appMessage(locale, 'access.clientHint')}</p>
        </>
      ) : null}
    </section>
  );
}

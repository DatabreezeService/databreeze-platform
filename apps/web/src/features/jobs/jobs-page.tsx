import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../../app/locale-context.tsx';
import { getJob, JobsReadError, listJobs, type JobHistoryPageV1 } from './jobs-api.ts';
import './jobs-page.css';

type Entry = JobHistoryPageV1['items'][number];

function formatDate(locale: string, value: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusLabel(locale: string, state: Entry['state']): string {
  const vi: Record<Entry['state'], string> = {
    CREATED: 'Đã tạo',
    QUEUED: 'Đang xếp hàng',
    WAITING_FOR_DEVICE: 'Chờ thiết bị',
    DISPATCHED: 'Đã phân công',
    RUNNING: 'Đang chạy',
    NEEDS_REVIEW: 'Cần xem xét',
    AWAITING_APPROVAL: 'Chờ phê duyệt',
    SUCCEEDED: 'Hoàn tất',
    PARTIALLY_SUCCEEDED: 'Hoàn tất một phần',
    FAILED: 'Thất bại',
    CANCEL_REQUESTED: 'Đang hủy',
    CANCELLED: 'Đã hủy',
    EXPIRED: 'Hết hạn',
  };
  const en: Record<Entry['state'], string> = {
    CREATED: 'Created',
    QUEUED: 'Queued',
    WAITING_FOR_DEVICE: 'Waiting for device',
    DISPATCHED: 'Dispatched',
    RUNNING: 'Running',
    NEEDS_REVIEW: 'Needs review',
    AWAITING_APPROVAL: 'Awaiting approval',
    SUCCEEDED: 'Succeeded',
    PARTIALLY_SUCCEEDED: 'Partially succeeded',
    FAILED: 'Failed',
    CANCEL_REQUESTED: 'Cancelling',
    CANCELLED: 'Cancelled',
    EXPIRED: 'Expired',
  };
  return (locale === 'en' ? en : vi)[state];
}

function stateClass(state: Entry['state']): string {
  if (state === 'SUCCEEDED') return 'is-success';
  if (state === 'FAILED' || state === 'CANCELLED' || state === 'EXPIRED') return 'is-danger';
  if (state === 'RUNNING' || state === 'QUEUED' || state === 'DISPATCHED') return 'is-active';
  return 'is-neutral';
}

function compactId(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function EntryCard({
  entry,
  locale,
  selected,
  onSelect,
}: {
  readonly entry: Entry;
  readonly locale: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const english = locale === 'en';
  return (
    <button
      className={`jobs-entry${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
      type="button"
    >
      <span className={`jobs-entry__status ${stateClass(entry.state)}`}>
        {statusLabel(locale, entry.state)}
      </span>
      <strong>{entry.actionType}</strong>
      <span className="jobs-entry__meta">
        v{entry.actionVersion} · {formatDate(locale, entry.createdAt)}
      </span>
      <span className="jobs-entry__id">
        {english ? 'Run' : 'Tác vụ'} {compactId(entry.jobId)}
      </span>
    </button>
  );
}

export function JobsPage() {
  const locale = useLocale();
  const english = locale === 'en';
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'forbidden'>('loading');
  const [items, setItems] = useState<readonly Entry[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [selected, setSelected] = useState<Entry>();
  const [detailState, setDetailState] = useState<'idle' | 'loading' | 'error'>('idle');

  const load = useCallback(async (cursor?: string) => {
    setState('loading');
    try {
      const page = await listJobs({ limit: 25, ...(cursor === undefined ? {} : { cursor }) });
      setItems((current) => (cursor === undefined ? page.items : [...current, ...page.items]));
      setNextCursor(page.nextCursor);
      setState('ready');
    } catch (error) {
      setState(
        error instanceof JobsReadError && error.code === 'FORBIDDEN' ? 'forbidden' : 'error',
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function select(entry: Entry) {
    setSelected(entry);
    setDetailState('loading');
    try {
      setSelected(await getJob(entry.jobId));
      setDetailState('idle');
    } catch {
      setDetailState('error');
    }
  }

  return (
    <section aria-labelledby="jobs-heading" className="jobs-page">
      <header className="jobs-page__hero">
        <div>
          <p className="jobs-page__eyebrow">{english ? 'AUTOMATION HISTORY' : 'LỊCH SỬ TÁC VỤ'}</p>
          <h1 id="jobs-heading">{english ? 'Runs' : 'Tác vụ'}</h1>
          <p>
            {english
              ? 'A calm, metadata-only view of work completed or running in this workspace.'
              : 'Một góc nhìn gọn gàng về các tác vụ đã chạy hoặc đang chạy trong workspace này.'}
          </p>
        </div>
        <div className="jobs-page__hero-mark" aria-hidden="true">
          RUNS
        </div>
      </header>
      {state === 'loading' ? (
        <div className="jobs-state" role="status">
          {english ? 'Loading runs…' : 'Đang tải tác vụ…'}
        </div>
      ) : null}
      {state === 'forbidden' ? (
        <div className="jobs-state jobs-state--warning" role="alert">
          <strong>{english ? 'Run history is restricted.' : 'Lịch sử tác vụ bị giới hạn.'}</strong>
          <span>
            {english
              ? 'Ask a workspace owner for execution-read access.'
              : 'Hãy nhờ Owner cấp quyền xem lịch sử tác vụ.'}
          </span>
        </div>
      ) : null}
      {state === 'error' ? (
        <div className="jobs-state jobs-state--error" role="alert">
          <strong>
            {english ? 'Run history is unavailable.' : 'Chưa thể tải lịch sử tác vụ.'}
          </strong>
          <span>
            {english
              ? 'Nothing was changed. Try again when the service is ready.'
              : 'Không có dữ liệu nào bị thay đổi. Hãy thử lại khi dịch vụ sẵn sàng.'}
          </span>
          <button onClick={() => void load()} type="button">
            {english ? 'Retry safely' : 'Thử lại an toàn'}
          </button>
        </div>
      ) : null}
      {state === 'ready' ? (
        <div className="jobs-layout">
          <div className="jobs-list">
            {items.length === 0 ? (
              <div className="jobs-empty" role="status">
                <span className="jobs-empty__icon" aria-hidden="true">
                  ✦
                </span>
                <h2>{english ? 'No runs yet' : 'Chưa có tác vụ nào'}</h2>
                <p>
                  {english
                    ? 'Agent and data workflows will appear here once they are accepted by the server.'
                    : 'Tác vụ trợ lý và dữ liệu sẽ xuất hiện ở đây sau khi server ghi nhận.'}
                </p>
                <Link to={`/${locale}/data`}>
                  {english ? 'Open data workspace' : 'Mở không gian dữ liệu'}
                </Link>
              </div>
            ) : (
              items.map((entry) => (
                <EntryCard
                  entry={entry}
                  key={entry.jobId}
                  locale={locale}
                  onSelect={() => void select(entry)}
                  selected={selected?.jobId === entry.jobId}
                />
              ))
            )}
            {nextCursor ? (
              <button
                className="jobs-load-more"
                onClick={() => void load(nextCursor)}
                type="button"
              >
                {english ? 'Load more' : 'Tải thêm'}
              </button>
            ) : null}
          </div>
          <aside className="jobs-detail" aria-label={english ? 'Run details' : 'Chi tiết tác vụ'}>
            {detailState === 'loading' ? (
              <p>{english ? 'Loading details…' : 'Đang tải chi tiết…'}</p>
            ) : null}
            {detailState === 'error' ? (
              <p className="jobs-detail__error">
                {english ? 'This run is no longer available.' : 'Tác vụ này không còn khả dụng.'}
              </p>
            ) : null}
            {detailState === 'idle' && selected ? (
              <>
                <p className="jobs-page__eyebrow">{english ? 'RUN DETAIL' : 'CHI TIẾT TÁC VỤ'}</p>
                <h2>{selected.actionType}</h2>
                <p className={`jobs-entry__status ${stateClass(selected.state)}`}>
                  {statusLabel(locale, selected.state)}
                </p>
                <dl>
                  <div>
                    <dt>{english ? 'Run ID' : 'Mã tác vụ'}</dt>
                    <dd>
                      <code>{compactId(selected.jobId)}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>{english ? 'Revision' : 'Phiên bản'}</dt>
                    <dd>{selected.revision}</dd>
                  </div>
                  <div>
                    <dt>{english ? 'Started' : 'Bắt đầu'}</dt>
                    <dd>{selected.startedAt ? formatDate(locale, selected.startedAt) : '—'}</dd>
                  </div>
                  <div>
                    <dt>{english ? 'Finished' : 'Kết thúc'}</dt>
                    <dd>{selected.finishedAt ? formatDate(locale, selected.finishedAt) : '—'}</dd>
                  </div>
                  <div>
                    <dt>{english ? 'Result' : 'Kết quả'}</dt>
                    <dd>
                      {selected.resultAvailable
                        ? english
                          ? 'Available'
                          : 'Đã có'
                        : english
                          ? 'Not available'
                          : 'Chưa có'}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <p>
                {english
                  ? 'Select a run to see its safe metadata.'
                  : 'Chọn một tác vụ để xem thông tin an toàn.'}
              </p>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  );
}

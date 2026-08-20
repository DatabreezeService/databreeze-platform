import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../../app/locale-context.tsx';
import { appMessage } from '../../app/messages.ts';
import {
  getApprovalRequest,
  listApprovalRequests,
  type ApprovalRequestDetail,
  type ApprovalRequestRow,
  type ApprovalStatus,
  ApprovalReadError,
} from './approval-api.ts';
import './approval-page.css';

const statuses: readonly (ApprovalStatus | 'ALL')[] = [
  'OPEN',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
  'ALL',
];

function compactIdentifier(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function statusLabel(locale: string, status: ApprovalStatus): string {
  const vi: Record<ApprovalStatus, string> = {
    OPEN: 'Đang chờ',
    APPROVED: 'Đã duyệt',
    REJECTED: 'Đã từ chối',
    EXPIRED: 'Hết hạn',
    CANCELLED: 'Đã hủy',
  };
  const en: Record<ApprovalStatus, string> = {
    OPEN: 'Open',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    EXPIRED: 'Expired',
    CANCELLED: 'Cancelled',
  };
  return (locale === 'en' ? en : vi)[status];
}

function statusClass(status: ApprovalStatus): string {
  if (status === 'APPROVED') return 'is-approved';
  if (status === 'REJECTED' || status === 'CANCELLED') return 'is-closed';
  if (status === 'EXPIRED') return 'is-expired';
  return 'is-open';
}

function formatDate(locale: string, value: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function RequestCard({
  request,
  locale,
  selected,
  onSelect,
}: {
  readonly request: ApprovalRequestRow;
  readonly locale: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      className={`approval-card${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
      type="button"
    >
      <span className={`approval-card__status ${statusClass(request.status)}`}>
        {statusLabel(locale, request.status)}
      </span>
      <strong>{request.requestedAction}</strong>
      <span className="approval-card__subject">
        {request.subjectType} · {compactIdentifier(request.subjectId)}
      </span>
      <span className="approval-card__date">{formatDate(locale, request.createdAt)}</span>
    </button>
  );
}

function Detail({
  detail,
  locale,
}: {
  readonly detail: ApprovalRequestDetail;
  readonly locale: string;
}) {
  const request = detail.request;
  const english = locale === 'en';
  return (
    <aside
      className="approval-detail"
      aria-label={english ? 'Approval request details' : 'Chi tiết yêu cầu phê duyệt'}
    >
      <div className="approval-detail__eyebrow">
        {english ? 'REQUEST DETAIL' : 'CHI TIẾT YÊU CẦU'}
      </div>
      <div className="approval-detail__heading">
        <div>
          <h2>{request.requestedAction}</h2>
          <p>
            {request.subjectType} · {compactIdentifier(request.subjectId)}
          </p>
        </div>
        <span className={`approval-card__status ${statusClass(request.status)}`}>
          {statusLabel(locale, request.status)}
        </span>
      </div>
      <dl className="approval-detail__facts">
        <div>
          <dt>{english ? 'Requested by' : 'Người yêu cầu'}</dt>
          <dd>
            <code>{compactIdentifier(request.requestedBy)}</code>
          </dd>
        </div>
        <div>
          <dt>{english ? 'Subject version' : 'Phiên bản đối tượng'}</dt>
          <dd>{request.subjectVersion}</dd>
        </div>
        <div>
          <dt>{english ? 'Policy' : 'Chính sách'}</dt>
          <dd>
            <code>{compactIdentifier(request.policyId)}</code> · v{request.policyVersion}
          </dd>
        </div>
        <div>
          <dt>{english ? 'Created' : 'Đã tạo'}</dt>
          <dd>{formatDate(locale, request.createdAt)}</dd>
        </div>
        {request.dueAt ? (
          <div>
            <dt>{english ? 'Due' : 'Hạn xử lý'}</dt>
            <dd>{formatDate(locale, request.dueAt)}</dd>
          </div>
        ) : null}
      </dl>
      <div className="approval-detail__decisions">
        <h3>{english ? 'Recorded decisions' : 'Quyết định đã ghi nhận'}</h3>
        {detail.decisions.length === 0 ? (
          <p>
            {english ? 'No decision has been recorded.' : 'Chưa có quyết định nào được ghi nhận.'}
          </p>
        ) : (
          detail.decisions.map((decision) => (
            <div className="approval-detail__decision" key={decision.decisionId}>
              <strong>
                {decision.decision === 'APPROVE'
                  ? english
                    ? 'Approved'
                    : 'Đã duyệt'
                  : english
                    ? 'Rejected'
                    : 'Đã từ chối'}
              </strong>
              <span>
                {formatDate(locale, decision.decidedAt)} · {compactIdentifier(decision.actorId)}
              </span>
              {decision.reason ? <p>{decision.reason}</p> : null}
            </div>
          ))
        )}
      </div>
      <p className="approval-detail__guardrail">
        {english
          ? 'Decisions stay in the protected workflow and require current eligibility, subject binding, and MFA. This view never invents an approval action.'
          : 'Quyết định chỉ được thực hiện trong luồng được bảo vệ, với quyền hiện tại, ràng buộc đối tượng và MFA. Màn hình này không tự tạo thao tác phê duyệt.'}
      </p>
    </aside>
  );
}

export function ApprovalPage() {
  const locale = useLocale();
  const english = locale === 'en';
  const [status, setStatus] = useState<ApprovalStatus | 'ALL'>('OPEN');
  const [items, setItems] = useState<readonly ApprovalRequestRow[]>([]);
  const [selected, setSelected] = useState<string>();
  const [detail, setDetail] = useState<ApprovalRequestDetail>();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [detailState, setDetailState] = useState<'idle' | 'loading' | 'error'>('idle');

  const load = useCallback(
    async (nextStatus: ApprovalStatus | 'ALL' = status) => {
      setState('loading');
      try {
        const next = await listApprovalRequests(nextStatus);
        setItems(next);
        setSelected(undefined);
        setDetail(undefined);
        setState('ready');
      } catch {
        setState('error');
      }
    },
    [status],
  );

  useEffect(() => {
    void load(status);
  }, [load, status]);

  async function selectRequest(request: ApprovalRequestRow) {
    setSelected(request.requestId);
    setDetailState('loading');
    try {
      setDetail(await getApprovalRequest(request.requestId));
      setDetailState('idle');
    } catch (error) {
      setDetailState(error instanceof ApprovalReadError ? 'error' : 'error');
    }
  }

  return (
    <section aria-labelledby="approvals-heading" className="governance-page approval-page">
      <header className="governance-page__hero">
        <div>
          <p className="governance-page__eyebrow">
            {english ? 'CONTROLLED DECISIONS' : 'QUYẾT ĐỊNH ĐƯỢC KIỂM SOÁT'}
          </p>
          <h1 id="approvals-heading">{english ? 'Approvals' : 'Phê duyệt'}</h1>
          <p>
            {english
              ? 'Review the decisions waiting in this workspace. Final approval remains protected by the server.'
              : 'Xem các quyết định đang chờ trong workspace. Phê duyệt cuối cùng luôn được máy chủ bảo vệ.'}
          </p>
        </div>
        <div className="governance-page__hero-mark" aria-hidden="true">
          JRA
        </div>
      </header>
      <div className="approval-toolbar">
        <label>
          <span>{english ? 'Show' : 'Hiển thị'}</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as ApprovalStatus | 'ALL')}
          >
            {statuses.map((value) => (
              <option key={value} value={value}>
                {value === 'ALL'
                  ? english
                    ? 'All requests'
                    : 'Tất cả yêu cầu'
                  : statusLabel(locale, value)}
              </option>
            ))}
          </select>
        </label>
        <span className="approval-toolbar__count">
          {state === 'ready' ? `${items.length} ${english ? 'requests' : 'yêu cầu'}` : ''}
        </span>
      </div>
      {state === 'loading' ? (
        <div className="governance-state governance-state--loading" role="status">
          {english ? 'Loading approval requests…' : 'Đang tải yêu cầu phê duyệt…'}
        </div>
      ) : null}
      {state === 'error' ? (
        <div className="governance-state governance-state--error" role="alert">
          <strong>
            {english ? 'Approvals are unavailable.' : 'Chưa thể tải danh sách phê duyệt.'}
          </strong>
          <span>
            {english
              ? 'No decision was sent. Retry when the governance service is ready.'
              : 'Không có quyết định nào được gửi. Hãy thử lại khi dịch vụ quản trị sẵn sàng.'}
          </span>
          <button onClick={() => void load(status)} type="button">
            {english ? 'Retry safely' : 'Thử lại an toàn'}
          </button>
        </div>
      ) : null}
      {state === 'ready' ? (
        <div className="approval-layout">
          <div className="approval-list">
            {items.length === 0 ? (
              <div className="governance-empty" role="status">
                <span className="governance-empty__icon" aria-hidden="true">
                  ✓
                </span>
                <h2>
                  {english ? 'Nothing needs your decision' : 'Không có yêu cầu cần bạn quyết định'}
                </h2>
                <p>
                  {english
                    ? 'New server-authorized approval requests will appear here.'
                    : 'Yêu cầu phê duyệt mới được máy chủ xác nhận sẽ xuất hiện ở đây.'}
                </p>
              </div>
            ) : (
              items.map((request) => (
                <RequestCard
                  key={request.requestId}
                  locale={locale}
                  onSelect={() => void selectRequest(request)}
                  request={request}
                  selected={selected === request.requestId}
                />
              ))
            )}
          </div>
          {detailState === 'loading' ? (
            <div className="approval-detail approval-detail--loading" role="status">
              {english ? 'Loading details…' : 'Đang tải chi tiết…'}
            </div>
          ) : null}
          {detailState === 'error' ? (
            <div className="approval-detail governance-state--error" role="alert">
              {english ? 'This request is no longer available.' : 'Yêu cầu này không còn khả dụng.'}
            </div>
          ) : null}
          {detailState === 'idle' && detail ? <Detail detail={detail} locale={locale} /> : null}
        </div>
      ) : null}
      <Link className="governance-page__back" to={`/${locale}/settings`}>
        {english ? 'Open workspace settings' : 'Mở cài đặt workspace'}
      </Link>
      <p className="governance-page__note">{appMessage(locale, 'access.clientHint')}</p>
    </section>
  );
}

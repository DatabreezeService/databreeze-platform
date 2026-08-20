import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { IamBootstrapProject } from '@databreeze/contracts/v4';

import { useLocale } from '../../app/locale-context.tsx';
import { currentAuthBootstrapV1 } from '../auth/auth-session.ts';
import { fetchAuthorizedDataIndex } from '../data/data-api.ts';
import type { DatasetCardV1 } from '../data/data-model.ts';
import {
  createReport,
  getReport,
  ReportsApiError,
  type ReportDetailV1,
  listReports,
  type ReportListPageV1,
} from './reports-api.ts';
import './reports-page.css';

type PageState = 'loading' | 'ready' | 'error' | 'forbidden';

function formatDate(locale: string, value: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function compactId(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function reportStatusLabel(locale: string, status: ReportDetailV1['status']): string {
  const labels = {
    en: {
      DRAFT: 'Draft',
      RUNNING: 'Generating',
      REVIEW: 'Ready for review',
      RELEASED: 'Released',
      WITHDRAWN: 'Withdrawn',
      BLOCKED: 'Blocked',
    },
    vi: {
      DRAFT: 'Bản nháp',
      RUNNING: 'Đang tạo',
      REVIEW: 'Sẵn sàng xem xét',
      RELEASED: 'Đã phát hành',
      WITHDRAWN: 'Đã thu hồi',
      BLOCKED: 'Bị chặn',
    },
  } as const;
  return (locale === 'en' ? labels.en : labels.vi)[status];
}

function statusClass(status: ReportDetailV1['status']): string {
  if (status === 'RELEASED' || status === 'REVIEW') return 'is-success';
  if (status === 'BLOCKED' || status === 'WITHDRAWN') return 'is-danger';
  if (status === 'RUNNING') return 'is-active';
  return 'is-neutral';
}

function statusMessage(locale: string, state: PageState): string {
  if (state === 'forbidden')
    return locale === 'en'
      ? 'Reports are restricted for this workspace.'
      : 'Workspace này không cho phép xem báo cáo.';
  return locale === 'en'
    ? 'Reports are temporarily unavailable. Nothing was changed.'
    : 'Báo cáo hiện chưa khả dụng. Không có dữ liệu nào bị thay đổi.';
}

type CreateState = 'idle' | 'loading' | 'success' | 'error';

function createErrorMessage(locale: string, error: unknown): string {
  const english = locale === 'en';
  if (error instanceof ReportsApiError) {
    if (error.code === 'FORBIDDEN')
      return english
        ? 'You do not have report access in this workspace.'
        : 'Bạn không có quyền tạo báo cáo trong workspace này.';
    if (error.code === 'NOT_FOUND')
      return english
        ? 'That client or dataset is no longer available.'
        : 'Dự án khách hàng hoặc dữ liệu này không còn khả dụng.';
    if (error.code === 'CONFLICT')
      return english
        ? 'This report request already exists with different details.'
        : 'Yêu cầu báo cáo này đã tồn tại với thông tin khác.';
    if (error.code === 'INVALID_COMMAND')
      return english
        ? 'Check the report name, period, and dataset.'
        : 'Hãy kiểm tra tên báo cáo, kỳ và bộ dữ liệu.';
  }
  return english
    ? 'Reports are temporarily unavailable. Nothing was changed.'
    : 'Báo cáo hiện chưa khả dụng. Không có dữ liệu nào bị thay đổi.';
}

function activeWorkspaceProjects(): readonly IamBootstrapProject[] {
  const bootstrap = currentAuthBootstrapV1();
  if (bootstrap === undefined) return [];
  const session = bootstrap.session;
  if (!('workspaceId' in session)) return [];
  const organization = bootstrap.organizations.find((entry) => entry.id === session.organizationId);
  const workspace = organization?.workspaces.find((entry) => entry.id === session.workspaceId);
  return (
    workspace?.projects.filter((entry) => entry.kind === 'CLIENT' && entry.status === 'ACTIVE') ??
    []
  );
}

function idempotencyKey(): string {
  const value = globalThis.crypto?.randomUUID?.();
  return value === undefined
    ? `report-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
    : `report-${value}`;
}

function ReportCreatePanel({
  locale,
  projects,
  datasets,
  dataState,
  onCreated,
}: {
  readonly locale: string;
  readonly projects: readonly IamBootstrapProject[];
  readonly datasets: readonly DatasetCardV1[];
  readonly dataState: 'loading' | 'ready' | 'error';
  readonly onCreated: (reportId: string) => Promise<void>;
}) {
  const english = locale === 'en';
  const [name, setName] = useState(english ? 'New monthly report' : 'Báo cáo tháng mới');
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [clientId, setClientId] = useState(projects[0]?.id ?? '');
  const [datasetVersionId, setDatasetVersionId] = useState(datasets[0]?.versionId ?? '');
  const [createState, setCreateState] = useState<CreateState>('idle');
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (clientId === '' && projects[0] !== undefined) setClientId(projects[0].id);
  }, [clientId, projects]);

  useEffect(() => {
    if (datasetVersionId === '' && datasets[0]?.versionId !== undefined)
      setDatasetVersionId(datasets[0].versionId);
  }, [datasetVersionId, datasets]);

  const dataset = datasets.find((entry) => entry.versionId === datasetVersionId);
  const disabled =
    createState === 'loading' ||
    projects.length === 0 ||
    dataset === undefined ||
    period.trim() === '' ||
    name.trim().length < 2;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (disabled || dataset?.versionId === undefined) return;
    setCreateState('loading');
    setError(undefined);
    try {
      const result = await createReport(
        {
          schemaVersion: 4,
          name: name.trim(),
          clientId,
          period: period.trim(),
          datasetId: dataset.datasetId,
          datasetVersionId: dataset.versionId,
          supportedFormats: ['WEB'],
        },
        idempotencyKey(),
      );
      setCreateState('success');
      await onCreated(result.reportId);
      setName(english ? 'New monthly report' : 'Báo cáo tháng mới');
    } catch (caught: unknown) {
      setCreateState('error');
      setError(createErrorMessage(locale, caught));
    }
  }

  return (
    <section className="reports-create" aria-labelledby="reports-create-heading">
      <div className="reports-create__heading">
        <div>
          <p className="reports-page__eyebrow">
            {english ? 'START FROM APPROVED DATA' : 'Bắt đầu từ dữ liệu đã duyệt'}
          </p>
          <h2 id="reports-create-heading">
            {english ? 'Create a governed report' : 'Tạo báo cáo có kiểm chứng'}
          </h2>
          <p>
            {english
              ? 'Choose an active client and an approved dataset. The server binds both to this workspace before creating the definition.'
              : 'Chọn một dự án khách hàng đang hoạt động và bộ dữ liệu đã duyệt. Máy chủ sẽ kiểm tra cả hai trong workspace trước khi tạo báo cáo.'}
          </p>
        </div>
        <span className="reports-create__badge" aria-hidden="true">
          ✦
        </span>
      </div>
      {projects.length === 0 ? (
        <div className="reports-create__state" role="status">
          <strong>
            {english ? 'No active client project yet' : 'Chưa có dự án khách hàng đang hoạt động'}
          </strong>
          <span>
            {english
              ? 'Ask an Owner to add a client project in Workspace settings before creating a report.'
              : 'Hãy nhờ Owner thêm một dự án khách hàng trong Cài đặt workspace trước khi tạo báo cáo.'}
          </span>
          <Link to={`/${locale}/settings`}>
            {english ? 'Open workspace settings' : 'Mở cài đặt workspace'} →
          </Link>
        </div>
      ) : dataState === 'loading' ? (
        <p className="reports-create__state" role="status">
          {english ? 'Loading approved datasets…' : 'Đang tải dữ liệu đã duyệt…'}
        </p>
      ) : dataState === 'error' || datasets.length === 0 ? (
        <div className="reports-create__state" role="status">
          <strong>
            {english ? 'No approved dataset is ready' : 'Chưa có bộ dữ liệu đã duyệt'}
          </strong>
          <span>
            {english
              ? 'Approve a dataset in Data first. This form never creates a report from an unverified or hidden version.'
              : 'Hãy duyệt dữ liệu trong Dữ liệu trước. Biểu mẫu này không tạo báo cáo từ phiên bản chưa kiểm chứng hoặc bị ẩn.'}
          </span>
          <Link to={`/${locale}/data`}>{english ? 'Go to Data' : 'Mở Dữ liệu'} →</Link>
        </div>
      ) : (
        <form className="reports-create__form" onSubmit={(event) => void submit(event)}>
          <label>
            <span>{english ? 'Report name' : 'Tên báo cáo'}</span>
            <input maxLength={200} onChange={(event) => setName(event.target.value)} value={name} />
          </label>
          <label>
            <span>{english ? 'Client project' : 'Dự án khách hàng'}</span>
            <select onChange={(event) => setClientId(event.target.value)} value={clientId}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{english ? 'Approved dataset' : 'Bộ dữ liệu đã duyệt'}</span>
            <select
              onChange={(event) => setDatasetVersionId(event.target.value)}
              value={datasetVersionId}
            >
              {datasets
                .filter((entry) => entry.versionId !== undefined)
                .map((entry) => (
                  <option key={entry.versionId} value={entry.versionId}>
                    {entry.label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span>{english ? 'Reporting period' : 'Kỳ báo cáo'}</span>
            <input
              onChange={(event) => setPeriod(event.target.value)}
              type="month"
              value={period}
            />
          </label>
          <div className="reports-create__actions">
            {error !== undefined ? (
              <p className="reports-create__error" role="alert">
                {error}
              </p>
            ) : createState === 'success' ? (
              <p className="reports-create__success" role="status">
                {english ? 'Report definition created.' : 'Đã tạo định nghĩa báo cáo.'}
              </p>
            ) : (
              <span />
            )}
            <button disabled={disabled} type="submit">
              {createState === 'loading'
                ? english
                  ? 'Creating…'
                  : 'Đang tạo…'
                : english
                  ? 'Create report'
                  : 'Tạo báo cáo'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function ReportCard({
  locale,
  report,
  selected,
  onSelect,
}: {
  readonly locale: string;
  readonly report: ReportListPageV1['items'][number];
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const english = locale === 'en';
  return (
    <button
      className={`reports-card${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
      type="button"
    >
      <span className={`reports-card__status ${statusClass(report.status)}`}>
        {reportStatusLabel(locale, report.status)}
      </span>
      <strong>{report.name}</strong>
      <span className="reports-card__period">
        {report.period} · v{report.reportVersion}
      </span>
      <span className="reports-card__meta">
        {english ? 'Dataset' : 'Bộ dữ liệu'} {compactId(report.datasetVersionId)}
      </span>
      <span className="reports-card__date">{formatDate(locale, report.updatedAt)}</span>
    </button>
  );
}

function ReportDetail({
  locale,
  report,
}: {
  readonly locale: string;
  readonly report: ReportDetailV1 | undefined;
}) {
  const english = locale === 'en';
  if (report === undefined) {
    return (
      <div className="reports-detail__empty" role="status">
        <span className="reports-detail__empty-mark" aria-hidden="true">
          ✦
        </span>
        <p>
          {english
            ? 'Choose a report to inspect its governed metadata.'
            : 'Chọn báo cáo để xem thông tin đã được kiểm soát.'}
        </p>
      </div>
    );
  }
  return (
    <div className="reports-detail__body">
      <div className="reports-detail__heading">
        <div>
          <p className="reports-page__eyebrow">
            {english ? 'REPORT DEFINITION' : 'ĐỊNH NGHĨA BÁO CÁO'}
          </p>
          <h2>{report.name}</h2>
          <p>
            {report.period} ·{' '}
            {english
              ? `updated ${formatDate(locale, report.updatedAt)}`
              : `cập nhật ${formatDate(locale, report.updatedAt)}`}
          </p>
        </div>
        <span className={`reports-card__status ${statusClass(report.status)}`}>
          {reportStatusLabel(locale, report.status)}
        </span>
      </div>
      <dl className="reports-detail__facts">
        <div>
          <dt>{english ? 'Dataset version' : 'Phiên bản dữ liệu'}</dt>
          <dd>
            <code>{compactId(report.datasetVersionId)}</code>
          </dd>
        </div>
        <div>
          <dt>{english ? 'Template' : 'Mẫu báo cáo'}</dt>
          <dd>
            v{report.templateVersion} · {report.blockCount} {english ? 'blocks' : 'khối'}
          </dd>
        </div>
        <div>
          <dt>{english ? 'Formats' : 'Định dạng'}</dt>
          <dd>{report.supportedFormats.join(' · ')}</dd>
        </div>
        <div>
          <dt>{english ? 'Report version' : 'Phiên bản báo cáo'}</dt>
          <dd>v{report.reportVersion}</dd>
        </div>
      </dl>
      <div className="reports-detail__run">
        <div>
          <p className="reports-page__eyebrow">{english ? 'LATEST RUN' : 'LẦN CHẠY GẦN NHẤT'}</p>
          <strong>
            {report.latestRun === undefined
              ? english
                ? 'No run frozen yet'
                : 'Chưa có lần chạy cố định'
              : reportStatusLabel(locale, report.status)}
          </strong>
        </div>
        <span>
          {report.latestRun === undefined
            ? english
              ? 'Run generation is not enabled in this workspace yet. The definition is saved safely; a certified run will appear when the execution service is connected.'
              : 'Workspace này chưa bật tạo lần chạy. Định nghĩa đã được lưu an toàn; lần chạy được chứng nhận sẽ xuất hiện khi dịch vụ thực thi được kết nối.'
            : compactId(report.latestRun.runId)}
        </span>
      </div>
    </div>
  );
}

export function ReportsPage() {
  const locale = useLocale();
  const english = locale === 'en';
  const prefix = `/${locale}`;
  const [state, setState] = useState<PageState>('loading');
  const [page, setPage] = useState<ReportListPageV1>();
  const [selectedId, setSelectedId] = useState<string>();
  const [selected, setSelected] = useState<ReportDetailV1>();
  const [detailState, setDetailState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [loadingMore, setLoadingMore] = useState(false);
  const [datasets, setDatasets] = useState<readonly DatasetCardV1[]>([]);
  const [dataState, setDataState] = useState<'loading' | 'ready' | 'error'>('loading');
  const clientProjects = activeWorkspaceProjects();

  const load = useCallback(async (cursor?: string) => {
    if (cursor === undefined) setState('loading');
    else setLoadingMore(true);
    try {
      const result = await listReports({ limit: 25, ...(cursor === undefined ? {} : { cursor }) });
      setPage((current) =>
        cursor === undefined || current === undefined
          ? result
          : {
              ...result,
              items: [...current.items, ...result.items],
            },
      );
      setSelectedId((current) => current ?? result.items[0]?.reportId);
      setState('ready');
    } catch (error: unknown) {
      if (cursor === undefined) {
        setState(
          error instanceof ReportsApiError && error.code === 'FORBIDDEN' ? 'forbidden' : 'error',
        );
      }
    } finally {
      if (cursor !== undefined) setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    setDataState('loading');
    void fetchAuthorizedDataIndex({
      locale: locale === 'en' ? 'en' : 'vi-VN',
      signal: controller.signal,
    })
      .then((result) => {
        setDatasets(
          result.filter((entry) => entry.versionId !== undefined && entry.readiness === 'READY'),
        );
        setDataState('ready');
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setDatasets([]);
        setDataState('error');
      });
    return () => controller.abort();
  }, [locale]);

  useEffect(() => {
    if (state !== 'ready' || selectedId === undefined) {
      setSelected(undefined);
      return;
    }
    let active = true;
    setDetailState('loading');
    void getReport(selectedId)
      .then((result) => {
        if (!active) return;
        setSelected(result);
        setDetailState('idle');
      })
      .catch(() => {
        if (!active) return;
        setSelected(undefined);
        setDetailState('error');
      });
    return () => {
      active = false;
    };
  }, [selectedId, state]);

  const items = page?.items ?? [];
  const refreshAfterCreate = useCallback(
    async (reportId: string): Promise<void> => {
      await load();
      setSelectedId(reportId);
    },
    [load],
  );
  return (
    <section aria-labelledby="reports-heading" className="reports-page">
      <header className="reports-page__hero">
        <div>
          <p className="reports-page__eyebrow">
            {english ? 'REPORT WORKSPACE' : 'KHÔNG GIAN BÁO CÁO'}
          </p>
          <h1 id="reports-heading">{english ? 'Reports' : 'Báo cáo'}</h1>
          <p className="reports-page__intro">
            {english
              ? 'Turn approved data into repeatable, evidence-backed deliverables.'
              : 'Biến dữ liệu đã duyệt thành những báo cáo có thể lặp lại và kiểm chứng được.'}
          </p>
        </div>
        <div
          className="reports-page__signal"
          aria-label={english ? 'Report data status' : 'Trạng thái dữ liệu báo cáo'}
        >
          <span className="reports-page__signal-dot" />
          <span>
            {state === 'ready'
              ? english
                ? 'CONNECTED'
                : 'ĐANG KẾT NỐI'
              : english
                ? 'SYNCING'
                : 'ĐANG ĐỒNG BỘ'}
          </span>
        </div>
      </header>

      {state === 'loading' ? (
        <div className="reports-page__notice" role="status">
          {english ? 'Loading governed reports…' : 'Đang tải báo cáo được cấp quyền…'}
        </div>
      ) : null}
      {state === 'error' || state === 'forbidden' ? (
        <div className="reports-page__notice reports-page__notice--error" role="alert">
          <strong>{statusMessage(locale, state)}</strong>
          <button onClick={() => void load()} type="button">
            {english ? 'Retry safely' : 'Thử lại an toàn'}
          </button>
        </div>
      ) : null}

      {state === 'ready' ? (
        <ReportCreatePanel
          dataState={dataState}
          datasets={datasets}
          locale={locale}
          onCreated={refreshAfterCreate}
          projects={clientProjects}
        />
      ) : null}

      {state === 'ready' && items.length === 0 ? (
        <>
          <div className="reports-page__panel" role="status">
            <div className="reports-page__panel-mark" aria-hidden="true">
              ✦
            </div>
            <div>
              <p className="reports-page__panel-label">Report Factory</p>
              <h2>{english ? 'No report definitions yet' : 'Chưa có định nghĩa báo cáo'}</h2>
              <p>
                {english
                  ? 'Approve a governed dataset first. Once a report is bound to a real dataset, its definition, frozen runs, evidence, and release state will appear here.'
                  : 'Hãy duyệt một bộ dữ liệu trước. Khi báo cáo được liên kết với dữ liệu thật, định nghĩa, lần chạy cố định, bằng chứng và trạng thái phát hành sẽ xuất hiện ở đây.'}
              </p>
            </div>
          </div>
          <div
            className="reports-page__path"
            aria-label={english ? 'Recommended next steps' : 'Bước tiếp theo'}
          >
            <div className="reports-page__path-heading">
              <h2>{english ? 'Start with approved data' : 'Bắt đầu từ dữ liệu đã duyệt'}</h2>
              <span>{english ? 'Server-bound data only' : 'Chỉ dữ liệu theo server'}</span>
            </div>
            <Link className="reports-page__step" to={`${prefix}/data`}>
              <span className="reports-page__step-index">01</span>
              <span>
                <strong>{english ? 'Prepare data' : 'Chuẩn bị dữ liệu'}</strong>
                <small>
                  {english
                    ? 'Upload, clean, and approve a governed version.'
                    : 'Tải lên, làm sạch và duyệt một phiên bản dữ liệu.'}
                </small>
              </span>
              <span className="reports-page__step-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          </div>
        </>
      ) : null}

      {state === 'ready' && items.length > 0 ? (
        <div className="reports-layout">
          <div className="reports-list">
            <div className="reports-list__heading">
              <div>
                <p className="reports-page__eyebrow">
                  {english ? 'GOVERNED DEFINITIONS' : 'ĐỊNH NGHĨA ĐƯỢC CẤP QUYỀN'}
                </p>
                <h2>
                  {english
                    ? `${items.length} report${items.length === 1 ? '' : 's'}`
                    : `${items.length} báo cáo`}
                </h2>
              </div>
              <Link to={`${prefix}/data`}>
                {english ? 'Use approved data' : 'Dùng dữ liệu đã duyệt'} →
              </Link>
            </div>
            {items.map((report) => (
              <ReportCard
                key={report.reportId}
                locale={locale}
                report={report}
                selected={selectedId === report.reportId}
                onSelect={() => setSelectedId(report.reportId)}
              />
            ))}
            {page?.nextCursor ? (
              <button
                className="reports-load-more"
                disabled={loadingMore}
                onClick={() => {
                  if (page.nextCursor !== undefined) void load(page.nextCursor);
                }}
                type="button"
              >
                {loadingMore
                  ? english
                    ? 'Loading more reports…'
                    : 'Đang tải thêm báo cáo…'
                  : english
                    ? 'Load more reports'
                    : 'Tải thêm báo cáo'}
              </button>
            ) : null}
          </div>
          <aside
            className="reports-detail"
            aria-label={english ? 'Report details' : 'Chi tiết báo cáo'}
          >
            {detailState === 'loading' ? (
              <p className="reports-detail__loading">
                {english ? 'Loading governed details…' : 'Đang tải chi tiết được cấp quyền…'}
              </p>
            ) : null}
            {detailState === 'error' ? (
              <p className="reports-detail__loading reports-detail__loading--error">
                {english
                  ? 'This report is no longer available in the current scope.'
                  : 'Báo cáo này không còn trong phạm vi hiện tại.'}
              </p>
            ) : null}
            {detailState !== 'loading' && detailState !== 'error' ? (
              <ReportDetail locale={locale} report={selected} />
            ) : null}
          </aside>
        </div>
      ) : null}
    </section>
  );
}

import type { DesktopLocale } from '../../shared/desktop-contract-v1.ts';
import type {
  WorkbenchCatalogPage,
  WorkbenchDatasetHealth,
} from '../../shared/workbench-contract-v1.ts';

export type WorkspaceFileRecord = {
  readonly fileId: string;
  readonly fileName: string;
  readonly sourceLabel?: string;
};

export type WorkspaceOverviewProperties = {
  readonly catalog: WorkbenchCatalogPage;
  readonly datasetFiles?: Readonly<Record<string, readonly WorkspaceFileRecord[]>>;
  readonly locale: DesktopLocale;
  readonly onAskAgent?: () => void;
  readonly onOpenDataset?: (datasetId: string) => void;
  readonly onOpenFile?: (fileId: string) => void;
  readonly onOpenReview?: (reviewId: string) => void;
};

const LABELS = {
  'vi-VN': {
    region: 'Tổng quan không gian làm việc',
    eyebrow: 'Không gian làm việc',
    title: 'Mọi nguồn dữ liệu, trong một nơi',
    subtitle: 'Theo dõi sức khỏe ETL, tệp gốc và các việc cần bạn xem xét.',
    datasets: 'Tập dữ liệu',
    files: (count: number) => `${count} tệp`,
    ready: 'Sẵn sàng',
    attention: 'Cần chú ý',
    blocked: 'Đang chặn',
    openDataset: (name: string) => `Mở ${name}`,
    openFile: (name: string) => `Mở ${name}`,
    reviews: 'Cần bạn xem xét',
    review: (label: string) => `Xem xét ${label}`,
    askAgent: 'Hỏi trợ lý',
    noFiles: 'Chưa có tệp nguồn được liên kết',
  },
  en: {
    region: 'Workspace overview',
    eyebrow: 'Workspace overview',
    title: 'Every source, in one calm view',
    subtitle: 'Monitor ETL health, original files, and work that needs your review.',
    datasets: 'Datasets',
    files: (count: number) => `${count} ${count === 1 ? 'file' : 'files'}`,
    ready: 'Ready',
    attention: 'Needs attention',
    blocked: 'Blocked',
    openDataset: (name: string) => `Open ${name}`,
    openFile: (name: string) => `Open ${name}`,
    reviews: 'Needs your review',
    review: (label: string) => `Review ${label}`,
    askAgent: 'Ask agent',
    noFiles: 'No source files linked yet',
  },
} as const;

function healthLabel(locale: DesktopLocale, health: WorkbenchDatasetHealth): string {
  const copy = LABELS[locale];
  switch (health) {
    case 'READY':
      return copy.ready;
    case 'ATTENTION':
      return copy.attention;
    case 'BLOCKED':
      return copy.blocked;
  }
}

export function WorkspaceOverview({
  catalog,
  datasetFiles = {},
  locale,
  onAskAgent,
  onOpenDataset,
  onOpenFile,
  onOpenReview,
}: WorkspaceOverviewProperties) {
  const copy = LABELS[locale];

  return (
    <section aria-label={copy.region} className="workspace-overview">
      <header className="workspace-overview__header">
        <div>
          <p className="workspace-overview__eyebrow">{copy.eyebrow}</p>
          <h1 className="workspace-overview__title">{copy.title}</h1>
          <p className="workspace-overview__subtitle">{copy.subtitle}</p>
        </div>
        <button className="workspace-overview__agent" onClick={onAskAgent} type="button">
          <span aria-hidden="true" className="workspace-overview__agent-mark">
            ✦
          </span>
          {copy.askAgent}
        </button>
      </header>

      <div className="workspace-overview__section-heading">
        <h2>{copy.datasets}</h2>
        <span>{catalog.datasets.length}</span>
      </div>
      <div className="workspace-overview__datasets">
        {catalog.datasets.map((dataset) => {
          const files = datasetFiles[dataset.datasetId] ?? [];
          return (
            <article className="workspace-overview__dataset" key={dataset.datasetId}>
              <div className="workspace-overview__dataset-topline">
                <div>
                  <p className="workspace-overview__dataset-kicker">{copy.datasets}</p>
                  <h3>{dataset.displayName}</h3>
                </div>
                <span
                  className={`workspace-overview__health workspace-overview__health--${dataset.health.toLowerCase()}`}
                >
                  <span aria-hidden="true" className="workspace-overview__health-dot" />
                  {healthLabel(locale, dataset.health)}
                </span>
              </div>
              <div className="workspace-overview__dataset-meta">
                <span>{copy.files(files.length)}</span>
                <button onClick={() => onOpenDataset?.(dataset.datasetId)} type="button">
                  {copy.openDataset(dataset.displayName)}
                </button>
              </div>
              {files.length > 0 ? (
                <ul className="workspace-overview__files">
                  {files.map((file) => (
                    <li key={file.fileId}>
                      <span aria-hidden="true" className="workspace-overview__file-mark">
                        ▤
                      </span>
                      <span className="workspace-overview__file-copy">
                        <strong>{file.fileName}</strong>
                        {file.sourceLabel ? <small>{file.sourceLabel}</small> : null}
                      </span>
                      <button onClick={() => onOpenFile?.(file.fileId)} type="button">
                        {copy.openFile(file.fileName)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="workspace-overview__empty-files">{copy.noFiles}</p>
              )}
            </article>
          );
        })}
      </div>

      <div className="workspace-overview__section-heading workspace-overview__section-heading--reviews">
        <h2>{copy.reviews}</h2>
        <span>{catalog.reviewItems.length}</span>
      </div>
      <ul className="workspace-overview__reviews">
        {catalog.reviewItems.map((item) => (
          <li key={item.reviewId}>
            <span aria-hidden="true" className="workspace-overview__review-mark">
              !
            </span>
            <span>{item.label}</span>
            <button onClick={() => onOpenReview?.(item.reviewId)} type="button">
              {copy.review(item.label)}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

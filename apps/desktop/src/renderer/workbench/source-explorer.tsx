import type { DesktopLocale } from '../../shared/desktop-contract-v1.ts';
import type { WorkbenchCatalogPage } from '../../shared/workbench-contract-v1.ts';

export type SourceExplorerOpenTarget =
  | { readonly kind: 'folder'; readonly id: string }
  | { readonly kind: 'dataset'; readonly id: string }
  | { readonly kind: 'review'; readonly id: string }
  | { readonly kind: 'analysis'; readonly id: string };

export type SourceExplorerProperties = {
  readonly catalog: WorkbenchCatalogPage;
  readonly locale: DesktopLocale;
  readonly onOpenItem: (target: SourceExplorerOpenTarget) => void;
  readonly onImport: () => void;
};

const LABELS = {
  'vi-VN': {
    region: 'Trình khám phá nguồn',
    folders: 'Thư mục đã kết nối',
    datasets: 'Tập dữ liệu',
    reviews: 'Mục đánh giá',
    analyses: 'Phân tích gần đây',
    import: 'Nhập nguồn',
    pending: (count: number) => `${count} đánh giá`,
  },
  en: {
    region: 'Source explorer',
    folders: 'Connected folders',
    datasets: 'Datasets',
    reviews: 'Review items',
    analyses: 'Recent analyses',
    import: 'Import source',
    pending: (count: number) => `${count} reviews`,
  },
} as const;

export function SourceExplorer({
  catalog,
  locale,
  onOpenItem,
  onImport,
}: SourceExplorerProperties) {
  const copy = LABELS[locale];

  return (
    <section aria-label={copy.region} className="source-explorer">
      <button className="source-explorer__import" onClick={onImport} type="button">
        {copy.import}
      </button>

      <h2 className="source-explorer__heading">{copy.folders}</h2>
      <ul className="source-explorer__list">
        {catalog.folders.map((folder) => (
          <li key={folder.bindingId}>
            <button
              onClick={() => onOpenItem({ kind: 'folder', id: folder.bindingId })}
              type="button"
            >
              {folder.displayName}
            </button>
            {folder.pendingReviewCount > 0 ? (
              <span className="source-explorer__badge">{copy.pending(folder.pendingReviewCount)}</span>
            ) : null}
          </li>
        ))}
      </ul>

      <h2 className="source-explorer__heading">{copy.datasets}</h2>
      <ul className="source-explorer__list">
        {catalog.datasets.map((dataset) => (
          <li key={dataset.datasetId}>
            <button
              onClick={() => onOpenItem({ kind: 'dataset', id: dataset.datasetId })}
              type="button"
            >
              {dataset.displayName}
            </button>
          </li>
        ))}
      </ul>

      <h2 className="source-explorer__heading">{copy.reviews}</h2>
      <ul className="source-explorer__list">
        {catalog.reviewItems.map((item) => (
          <li key={item.reviewId}>
            <button
              onClick={() => onOpenItem({ kind: 'review', id: item.reviewId })}
              type="button"
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>

      <h2 className="source-explorer__heading">{copy.analyses}</h2>
      <ul className="source-explorer__list">
        {catalog.recentAnalyses.map((item) => (
          <li key={item.conversationId}>
            <button
              onClick={() => onOpenItem({ kind: 'analysis', id: item.conversationId })}
              type="button"
            >
              {item.title}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

import { useMemo, useState } from 'react';
import type { DatasetCardV1 } from './data-model.ts';
import { localDataStore } from './local-data-store.ts';
import './dataset-preview-table.css';

export interface DatasetPreviewTableProps {
  readonly dataset: DatasetCardV1;
  readonly locale: 'en' | 'vi-VN';
}

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        heading: 'Xem trước bảng dữ liệu',
        description: 'Dữ liệu được chuẩn hóa và sẵn sàng cho phân tích hoặc vẽ biểu đồ.',
        rowsLabel: 'Tổng số dòng',
        colsLabel: 'Số cột',
        searchPlaceholder: 'Tìm kiếm trong bảng...',
        noData: 'Chưa có bản ghi mẫu trong bộ dữ liệu này.',
        actionAskAgent: 'Hỏi trợ lý về dữ liệu này 💬',
        actionDashboard: 'Mở Bảng điều khiển 📊',
        pageLabel: 'Trang',
        ofLabel: 'trên',
        next: 'Sau',
        prev: 'Trước',
      }
    : {
        heading: 'Data Table Preview',
        description: 'Normalized and ready for exploratory analysis or charting.',
        rowsLabel: 'Total rows',
        colsLabel: 'Columns',
        searchPlaceholder: 'Search in preview...',
        noData: 'No preview records available for this dataset.',
        actionAskAgent: 'Ask Agent about this Data 💬',
        actionDashboard: 'Open Dashboards 📊',
        pageLabel: 'Page',
        ofLabel: 'of',
        next: 'Next',
        prev: 'Previous',
      };
}

const PAGE_SIZE = 8;

export function DatasetPreviewTable({ dataset, locale }: DatasetPreviewTableProps) {
  const text = copy(locale);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const tabularData = localDataStore.getTabularData(dataset.datasetId);
  const columns = tabularData?.columns ?? [];
  const allRows = tabularData?.rows ?? [];

  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return allRows;
    const term = searchTerm.toLowerCase();
    return allRows.filter((row) =>
      Object.values(row).some((val) => val !== null && String(val).toLowerCase().includes(term)),
    );
  }, [allRows, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const paginatedRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (!tabularData || columns.length === 0) {
    return null;
  }

  return (
    <section aria-label={text.heading} className="dataset-preview-table-card">
      <div className="dataset-preview-table-card__header">
        <div>
          <h3>{text.heading}</h3>
          <p>{text.description}</p>
        </div>
        <div className="dataset-preview-table-card__actions">
          <a
            className="db-button db-button--primary"
            href={`/${locale}/analysis?dataset=${encodeURIComponent(dataset.datasetId)}`}
          >
            {text.actionAskAgent}
          </a>
          <a
            className="db-button db-button--secondary"
            href={`/${locale}/dashboards`}
          >
            {text.actionDashboard}
          </a>
        </div>
      </div>

      <div className="dataset-preview-table-card__toolbar">
        <div className="dataset-preview-table-card__meta">
          <span className="dataset-preview-meta-item">
            <strong>{allRows.length.toLocaleString(locale === 'vi-VN' ? 'vi-VN' : 'en-US')}</strong> {text.rowsLabel}
          </span>
          <span className="dataset-preview-meta-item">
            <strong>{columns.length}</strong> {text.colsLabel}
          </span>
        </div>
        <input
          aria-label={text.searchPlaceholder}
          className="dataset-preview-search-input"
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          placeholder={text.searchPlaceholder}
          type="search"
          value={searchTerm}
        />
      </div>

      <div className="dataset-preview-table-wrapper" tabIndex={0}>
        <table className="dataset-preview-table">
          <thead>
            <tr>
              <th className="dataset-preview-th dataset-preview-th--index">#</th>
              {columns.map((col) => (
                <th className="dataset-preview-th" key={col.name}>
                  <div className="dataset-preview-col-head">
                    <span className="dataset-preview-col-name">{col.name}</span>
                    <span className={`dataset-preview-type-badge type-${col.type.toLowerCase()}`}>
                      {col.type}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length === 0 ? (
              <tr>
                <td className="dataset-preview-td--empty" colSpan={columns.length + 1}>
                  {text.noData}
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, rowIdx) => {
                const globalIdx = (currentPage - 1) * PAGE_SIZE + rowIdx + 1;
                return (
                  <tr className="dataset-preview-tr" key={globalIdx}>
                    <td className="dataset-preview-td dataset-preview-td--index">{globalIdx}</td>
                    {columns.map((col) => {
                      const val = row[col.name];
                      return (
                        <td className="dataset-preview-td" key={col.name}>
                          {val === null || val === undefined ? (
                            <span className="dataset-preview-null">null</span>
                          ) : typeof val === 'number' ? (
                            val.toLocaleString(locale === 'vi-VN' ? 'vi-VN' : 'en-US')
                          ) : (
                            String(val)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="dataset-preview-pagination">
          <span>
            {text.pageLabel} {currentPage} {text.ofLabel} {totalPages}
          </span>
          <div className="dataset-preview-pagination-buttons">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              type="button"
            >
              {text.prev}
            </button>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              type="button"
            >
              {text.next}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

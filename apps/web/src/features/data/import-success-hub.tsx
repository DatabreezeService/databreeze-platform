import { Link } from 'react-router-dom';
import type { DatasetCardV1 } from './data-model.ts';
import './import-success-hub.css';

export interface ImportSuccessHubProps {
  readonly dataset: DatasetCardV1;
  readonly starterDashboardId?: string;
  readonly importId?: string;
  readonly dashboardStatus: 'READY' | 'BUILDING' | 'UNAVAILABLE';
  readonly locale: 'en' | 'vi-VN';
  readonly onDismiss: () => void;
}

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        badge: 'Xuất bản thành công',
        title: 'Bộ dữ liệu đã sẵn sàng',
        subtitle:
          'Dữ liệu đã được chuẩn hóa thành phiên bản bất biến và có thể dùng ngay trong Phân tích.',
        datasetTitle: 'Bộ dữ liệu chính thức',
        dashboardTitle: 'Bảng điều khiển khởi tạo',
        dashboardReady: 'Bảng điều khiển khởi tạo đã sẵn sàng.',
        dashboardBuilding: 'Bảng điều khiển khởi tạo đang được tính toán từ dữ liệu đã duyệt.',
        dashboardUnavailable:
          'Chưa có mẫu biểu đồ an toàn cho cấu trúc dữ liệu này. Bạn vẫn có thể phân tích dữ liệu hoặc tạo biểu đồ sau.',
        actionAnalyze: 'Phân tích dữ liệu',
        actionDashboard: 'Mở bảng điều khiển',
        actionPreview: 'Mở dashboard dữ liệu',
        actionInspect: 'Xem bộ dữ liệu',
      }
    : {
        badge: 'Successfully Published',
        title: 'Your dataset is ready',
        subtitle: 'Your data is now an immutable governed version and is available in Analysis.',
        datasetTitle: 'Governed Dataset',
        dashboardTitle: 'Starter Dashboard',
        dashboardReady: 'The starter dashboard is ready.',
        dashboardBuilding: 'The starter dashboard is being calculated from the approved data.',
        dashboardUnavailable:
          'No safe starter template matches this dataset yet. You can still analyze it or add charts later.',
        actionAnalyze: 'Analyze data',
        actionDashboard: 'Open dashboard',
        actionPreview: 'Open data dashboard',
        actionInspect: 'View dataset',
      };
}

export function ImportSuccessHub({
  dataset,
  starterDashboardId,
  importId,
  dashboardStatus,
  locale,
  onDismiss,
}: ImportSuccessHubProps) {
  const text = copy(locale);

  return (
    <section className="import-success-hub" aria-label={text.title}>
      <div className="import-success-badge">
        <span className="import-success-icon">✓</span>
        <span>{text.badge}</span>
      </div>

      <h2 className="import-success-title">{text.title}</h2>
      <p className="import-success-subtitle">{text.subtitle}</p>

      <div className="import-success-cards">
        <div className="import-success-card">
          <span className="import-success-card-tag">{text.datasetTitle}</span>
          <h3>{dataset.label}</h3>
          <p>{dataset.versionLabel}</p>
        </div>

        <div className="import-success-card is-highlight">
          <span className="import-success-card-tag">{text.dashboardTitle}</span>
          <h3>{dataset.label}</h3>
          <p>
            {dashboardStatus === 'READY'
              ? text.dashboardReady
              : dashboardStatus === 'BUILDING'
                ? text.dashboardBuilding
                : text.dashboardUnavailable}
          </p>
        </div>
      </div>

      <div className="import-success-actions">
        <Link
          to={`/${locale}/analysis?dataset=${encodeURIComponent(dataset.datasetId)}`}
          className="db-button db-button--primary"
        >
          {text.actionAnalyze}
        </Link>
        {dashboardStatus === 'READY' && starterDashboardId !== undefined ? (
          <Link
            to={`/${locale}/dashboards?dashboard=${encodeURIComponent(starterDashboardId)}`}
            className="db-button db-button--secondary"
          >
            {text.actionDashboard}
          </Link>
        ) : importId !== undefined && dashboardStatus !== 'UNAVAILABLE' ? (
          <Link
            to={`/${locale}/dashboards?importId=${encodeURIComponent(importId)}`}
            className="db-button db-button--secondary"
          >
            {text.actionPreview}
          </Link>
        ) : null}
        <button type="button" className="db-button db-button--secondary" onClick={onDismiss}>
          {text.actionInspect}
        </button>
      </div>
    </section>
  );
}

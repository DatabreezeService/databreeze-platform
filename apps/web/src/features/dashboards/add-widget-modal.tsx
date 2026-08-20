import { useState } from 'react';
import { localDataStore } from '../data/local-data-store.ts';
import { dashboardPinnedStore, type DashboardWidgetV1 } from './dashboard-pinned-store.ts';
import './add-widget-modal.css';

export interface AddWidgetModalProps {
  readonly isOpen: boolean;
  readonly locale: 'en' | 'vi-VN';
  readonly onClose: () => void;
  readonly pageId: string;
}

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        title: 'Thêm thẻ / biểu đồ mới vào Canvas',
        subtitle: 'Tạo thẻ chỉ số hoặc biểu đồ trực quan từ dữ liệu đã chọn',
        widgetTypeLabel: 'Loại thẻ / biểu đồ',
        datasetLabel: 'Bộ dữ liệu nguồn',
        chartTitleLabel: 'Tiêu đề biểu đồ / thẻ',
        measureLabel: 'Chỉ số đo lường (Cột số)',
        dimensionLabel: 'Phân nhóm theo (Cột danh mục / ngày)',
        kpiValueLabel: 'Giá trị hiển thị',
        previewLabel: 'Xem trước trực tiếp:',
        submit: 'Thêm vào Canvas',
        cancel: 'Hủy',
        types: {
          KPI: '📌 Thẻ chỉ số (KPI)',
          BAR: '📊 Biểu đồ cột (So sánh)',
          LINE: '📈 Biểu đồ đường (Xu hướng)',
          DONUT: '🍩 Biểu đồ tròn (Cơ cấu)',
          TABLE: '📋 Bảng dữ liệu',
        },
      }
    : {
        title: 'Add New Widget / Chart to Canvas',
        subtitle: 'Create a metric card or visual chart from selected data',
        widgetTypeLabel: 'Widget / Chart Type',
        datasetLabel: 'Source Dataset',
        chartTitleLabel: 'Chart / Widget Title',
        measureLabel: 'Metric Measure (Numeric Column)',
        dimensionLabel: 'Group by (Category / Date Column)',
        kpiValueLabel: 'Display Value',
        previewLabel: 'Live Preview:',
        submit: 'Add to Canvas',
        cancel: 'Cancel',
        types: {
          KPI: '📌 Metric Card (KPI)',
          BAR: '📊 Bar Chart (Comparison)',
          LINE: '📈 Line Chart (Trend)',
          DONUT: '🍩 Donut Chart (Mix)',
          TABLE: '📋 Data Table',
        },
      };
}

export function AddWidgetModal({ isOpen, locale, onClose, pageId }: AddWidgetModalProps) {
  const text = copy(locale);
  const datasets = localDataStore.getDatasets();
  const [selectedType, setSelectedType] = useState<DashboardWidgetV1['type']>('KPI');
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(datasets[0]?.datasetId ?? '');
  const [title, setTitle] = useState('');
  const [kpiValue, setKpiValue] = useState('');

  if (!isOpen) return null;

  const currentDataset = localDataStore.getDataset(selectedDatasetId) ?? datasets[0];
  const tabular = currentDataset
    ? localDataStore.getTabularData(currentDataset.datasetId)
    : undefined;
  const columns = tabular?.columns ?? [];
  const numericCols = columns.filter((c) => c.type === 'INTEGER' || c.type === 'DECIMAL');
  const textCols = columns.filter((c) => c.type === 'TEXT' || c.type === 'DATE');

  const [selectedMeasure, setSelectedMeasure] = useState<string>(numericCols[0]?.name ?? '');
  const [selectedDimension, setSelectedDimension] = useState<string>(textCols[0]?.name ?? '');

  const finalTitle =
    title.trim() ||
    (selectedType === 'KPI'
      ? selectedMeasure || (locale === 'vi-VN' ? 'Chỉ số mới' : 'New KPI')
      : `${selectedMeasure || 'Số liệu'} theo ${selectedDimension || 'Nhóm'}`);

  // Compute live values
  let previewValues: { label: string; value: string; num: number }[] = [];
  let kpiDisplay = kpiValue.trim();

  if (selectedType === 'KPI') {
    if (!kpiDisplay && tabular && selectedMeasure) {
      let sum = 0;
      for (const row of tabular.rows) {
        const val = row[selectedMeasure];
        if (typeof val === 'number') sum += val;
      }
      kpiDisplay = sum.toLocaleString(locale === 'vi-VN' ? 'vi-VN' : 'en-US');
    }
  } else if (tabular && selectedDimension && selectedMeasure) {
    const map = new Map<string, number>();
    for (const row of tabular.rows) {
      const dim = String(row[selectedDimension] ?? 'Other');
      const measure = row[selectedMeasure];
      const num = typeof measure === 'number' ? measure : 0;
      map.set(dim, (map.get(dim) ?? 0) + num);
    }
    previewValues = Array.from(map.entries())
      .slice(0, 4)
      .map(([lbl, num]) => ({
        label: lbl,
        value: num.toLocaleString(locale === 'vi-VN' ? 'vi-VN' : 'en-US'),
        num,
      }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    let values: { label: string; value: string }[] = [];

    if (selectedType === 'KPI') {
      values = [{ label: finalTitle, value: kpiDisplay || '100%' }];
    } else if (previewValues.length > 0) {
      values = previewValues.map((v) => ({ label: v.label, value: v.value }));
    } else {
      values = [
        { label: locale === 'vi-VN' ? 'Nhóm A' : 'Group A', value: '45%' },
        { label: locale === 'vi-VN' ? 'Nhóm B' : 'Group B', value: '35%' },
        { label: locale === 'vi-VN' ? 'Nhóm C' : 'Group C', value: '20%' },
      ];
    }

    const widget: DashboardWidgetV1 = {
      widgetId: crypto.randomUUID(),
      pageId,
      type: selectedType,
      title: {
        vi: finalTitle,
        en: finalTitle,
      },
      values,
    };

    dashboardPinnedStore.addWidget(widget);
    onClose();
  }

  return (
    <div className="add-widget-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="add-widget-modal-container" onClick={(e) => e.stopPropagation()}>
        <header className="add-widget-modal-header">
          <div>
            <h3>{text.title}</h3>
            <p>{text.subtitle}</p>
          </div>
          <button
            className="add-widget-modal-close"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <form onSubmit={handleSubmit} className="add-widget-modal-form">
          <div className="add-widget-form-group">
            <label className="add-widget-label">{text.widgetTypeLabel}</label>
            <div className="add-widget-type-selector">
              {(['KPI', 'BAR', 'LINE', 'DONUT', 'TABLE'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`add-widget-type-btn${selectedType === type ? ' is-active' : ''}`}
                  onClick={() => setSelectedType(type)}
                >
                  {text.types[type]}
                </button>
              ))}
            </div>
          </div>

          <div className="add-widget-form-group">
            <label className="add-widget-label" htmlFor="widget-dataset-select">
              {text.datasetLabel}
            </label>
            <select
              id="widget-dataset-select"
              className="add-widget-select"
              value={selectedDatasetId}
              onChange={(e) => setSelectedDatasetId(e.target.value)}
            >
              {datasets.map((d) => (
                <option key={d.datasetId} value={d.datasetId}>
                  {d.label} ({d.versionLabel})
                </option>
              ))}
            </select>
          </div>

          <div className="add-widget-form-group">
            <label className="add-widget-label" htmlFor="widget-title-input">
              {text.chartTitleLabel}
            </label>
            <input
              id="widget-title-input"
              className="add-widget-input"
              placeholder={
                locale === 'vi-VN' ? 'Ví dụ: Doanh thu theo tháng' : 'e.g. Revenue by month'
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {selectedType === 'KPI' ? (
            <div className="add-widget-form-row">
              <div className="add-widget-form-group">
                <label className="add-widget-label">{text.measureLabel}</label>
                <select
                  className="add-widget-select"
                  value={selectedMeasure}
                  onChange={(e) => setSelectedMeasure(e.target.value)}
                >
                  {numericCols.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
              </div>
              <div className="add-widget-form-group">
                <label className="add-widget-label">{text.kpiValueLabel}</label>
                <input
                  className="add-widget-input"
                  placeholder={
                    locale === 'vi-VN'
                      ? 'Tự động tính hoặc nhập ví dụ: ₫1,5 tỷ'
                      : 'Auto or e.g. $1.5M'
                  }
                  value={kpiValue}
                  onChange={(e) => setKpiValue(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="add-widget-form-row">
              <div className="add-widget-form-group">
                <label className="add-widget-label">{text.dimensionLabel}</label>
                <select
                  className="add-widget-select"
                  value={selectedDimension}
                  onChange={(e) => setSelectedDimension(e.target.value)}
                >
                  {textCols.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
              </div>
              <div className="add-widget-form-group">
                <label className="add-widget-label">{text.measureLabel}</label>
                <select
                  className="add-widget-select"
                  value={selectedMeasure}
                  onChange={(e) => setSelectedMeasure(e.target.value)}
                >
                  {numericCols.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Live Preview Box */}
          <div className="add-widget-preview-box">
            <small className="add-widget-preview-title">{text.previewLabel}</small>
            <div className="add-widget-preview-card">
              <h4>{finalTitle}</h4>
              {selectedType === 'KPI' ? (
                <div className="add-widget-preview-kpi">
                  <strong>{kpiDisplay || '100%'}</strong>
                </div>
              ) : previewValues.length > 0 ? (
                <div className="add-widget-preview-bars">
                  {previewValues.map((pv) => {
                    const max = Math.max(...previewValues.map((p) => p.num), 1);
                    const pct = Math.max(10, Math.min(100, (pv.num / max) * 100));
                    return (
                      <div key={pv.label} className="add-widget-preview-bar-row">
                        <span>{pv.label}</span>
                        <div className="add-widget-preview-bar-track">
                          <div style={{ width: `${pct}%` }} />
                        </div>
                        <small>{pv.value}</small>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="add-widget-preview-note">
                  {locale === 'vi-VN'
                    ? 'Sẽ tạo hiển thị tương ứng trên Canvas'
                    : 'Will render on Canvas'}
                </p>
              )}
            </div>
          </div>

          <div className="add-widget-modal-actions">
            <button type="button" className="db-button db-button--secondary" onClick={onClose}>
              {text.cancel}
            </button>
            <button type="submit" className="db-button db-button--primary">
              {text.submit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

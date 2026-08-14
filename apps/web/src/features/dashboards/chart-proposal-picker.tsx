import { useEffect, useId, useState } from 'react';
import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

import {
  ProposalDetails,
  type DashboardChartProposalOptionV1,
  type DashboardChartTypeV1,
} from './proposal-details.tsx';

export type { DashboardChartProposalOptionV1 } from './proposal-details.tsx';

export interface ChartProposalPickerProps {
  readonly locale: SupportedLocaleV1;
  readonly options: readonly DashboardChartProposalOptionV1[];
  readonly selectedOptionIds?: readonly string[];
  readonly onSelectionChange?: (selectedOptionIds: readonly string[]) => void;
  readonly onConfirm: (selectedOptionIds: readonly string[]) => void | Promise<void>;
  readonly confirming?: boolean;
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

function chartTypeLabel(locale: SupportedLocaleV1, type: DashboardChartTypeV1): string {
  const labels: Readonly<Record<DashboardChartTypeV1, readonly [string, string]>> = {
    KPI: ['Chỉ số', 'KPI'],
    TABLE: ['Bảng', 'Table'],
    BAR: ['Cột', 'Bar'],
    STACKED_BAR: ['Cột xếp chồng', 'Stacked bar'],
    LINE: ['Đường', 'Line'],
    AREA: ['Vùng', 'Area'],
    PIE: ['Tròn', 'Pie'],
    DONUT: ['Vành khuyên', 'Donut'],
    TEXT: ['Ghi chú bằng chứng', 'Evidence note'],
  };
  const [vi, en] = labels[type];
  return locale === 'vi-VN' ? vi : en;
}

function validSelection(
  candidate: readonly string[],
  options: readonly DashboardChartProposalOptionV1[],
): string[] {
  const allowed = new Set(options.map((option) => option.optionId));
  return Array.from(new Set(candidate.filter((optionId) => allowed.has(optionId))));
}

function ChartSilhouette({ type }: { readonly type: DashboardChartTypeV1 }) {
  if (type === 'KPI') {
    return (
      <svg viewBox="0 0 96 48" aria-hidden="true" focusable="false">
        <rect x="8" y="8" width="80" height="32" rx="5" />
        <path d="M18 30h22M18 23h44" />
      </svg>
    );
  }
  if (type === 'TABLE' || type === 'TEXT') {
    return (
      <svg viewBox="0 0 96 48" aria-hidden="true" focusable="false">
        <rect x="8" y="8" width="80" height="32" rx="3" />
        <path d="M8 19h80M8 29h80M34 8v32M62 8v32" />
      </svg>
    );
  }
  if (type === 'PIE' || type === 'DONUT') {
    return (
      <svg viewBox="0 0 96 48" aria-hidden="true" focusable="false">
        <circle cx="48" cy="24" r="15" />
        <path d="M48 9v15l12 8" />
        {type === 'DONUT' ? <circle cx="48" cy="24" r="6" /> : null}
      </svg>
    );
  }
  if (type === 'LINE' || type === 'AREA') {
    return (
      <svg viewBox="0 0 96 48" aria-hidden="true" focusable="false">
        {type === 'AREA' ? (
          <path className="dda-chart-silhouette__area" d="M10 36 28 26 45 30 62 15 86 21v15H10Z" />
        ) : null}
        <path d="M10 36 28 26 45 30 62 15 86 21" />
        <path d="M10 40h76M10 8v32" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 96 48" aria-hidden="true" focusable="false">
      <path d="M10 40h76M10 8v32" />
      <rect x="19" y="24" width="12" height="16" rx="2" />
      <rect x="42" y="15" width="12" height="25" rx="2" />
      <rect x="65" y="20" width="12" height="20" rx="2" />
      {type === 'STACKED_BAR' ? <path d="M19 31h12M42 25h12M65 30h12" /> : null}
    </svg>
  );
}

/** DDA-021/DDA-024/DDA-050: local-only compatible selection until explicit confirmation. */
export function ChartProposalPicker({
  locale,
  options,
  selectedOptionIds: initialSelectedOptionIds = [],
  onSelectionChange,
  onConfirm,
  confirming = false,
}: ChartProposalPickerProps) {
  const optionsKey = options.map((option) => option.optionId).join('|');
  const initialSelectionKey = initialSelectedOptionIds.join('|');
  const [selectedOptionIds, setSelectedOptionIds] = useState(() =>
    validSelection(initialSelectedOptionIds, options),
  );
  const [isConfirming, setIsConfirming] = useState(false);
  const listboxId = useId();
  const availableOptions = options.length >= 2 && options.length <= 4 ? options : [];

  useEffect(() => {
    setSelectedOptionIds(validSelection(initialSelectedOptionIds, options));
  }, [initialSelectionKey, optionsKey]);

  function toggle(optionId: string) {
    const next = selectedOptionIds.includes(optionId)
      ? selectedOptionIds.filter((candidate) => candidate !== optionId)
      : [...selectedOptionIds, optionId];
    setSelectedOptionIds(next);
    onSelectionChange?.(next);
  }

  async function confirm() {
    if (selectedOptionIds.length === 0 || isConfirming || confirming) return;
    setIsConfirming(true);
    try {
      await onConfirm([...selectedOptionIds]);
    } finally {
      setIsConfirming(false);
    }
  }

  if (availableOptions.length === 0) {
    return (
      <p className="dda-dashboard-agent-panel__state" role="alert">
        {label(
          locale,
          'Không có từ hai đến bốn đề xuất biểu đồ tương thích để xem xét.',
          'There are not two to four compatible chart proposals to review.',
        )}
      </p>
    );
  }

  const selectedCount = selectedOptionIds.length;
  const confirmLabel =
    locale === 'vi-VN'
      ? `Thêm ${selectedCount} biểu đồ vào canvas`
      : `Add ${selectedCount} ${selectedCount === 1 ? 'chart' : 'charts'} to canvas`;

  return (
    <section className="dda-chart-proposal-picker" aria-labelledby={listboxId}>
      <div className="dda-chart-proposal-picker__heading">
        <h3 id={listboxId}>
          {label(locale, 'Đề xuất biểu đồ tương thích', 'Compatible chart proposals')}
        </h3>
        <p>{label(locale, 'Chọn một hoặc nhiều phương án.', 'Select one or more options.')}</p>
      </div>
      <div
        className="dda-chart-proposal-picker__options"
        role="listbox"
        aria-label={label(locale, 'Các đề xuất biểu đồ', 'Chart proposals')}
        aria-multiselectable="true"
      >
        {availableOptions.map((option) => {
          const selected = selectedOptionIds.includes(option.optionId);
          const descriptionId = `${listboxId}-${option.optionId}-description`;
          const localized = locale === 'vi-VN' ? 'vi' : 'en';
          return (
            <article className="dda-chart-proposal-card" key={option.optionId}>
              <button
                type="button"
                className="dda-chart-proposal-card__select"
                role="option"
                aria-selected={selected}
                aria-describedby={descriptionId}
                onClick={() => toggle(option.optionId)}
              >
                <span className="dda-chart-proposal-card__silhouette">
                  <ChartSilhouette type={option.chartType} />
                </span>
                <span className="dda-chart-proposal-card__content">
                  <span className="dda-chart-proposal-card__type">
                    {chartTypeLabel(locale, option.chartType)}
                  </span>
                  <span className="dda-chart-proposal-card__title">{option.title[localized]}</span>
                  <span className="dda-chart-proposal-card__rationale">
                    {option.rationale[localized]}
                  </span>
                  <span className="dda-chart-proposal-card__fields">
                    {label(locale, 'Chiều', 'Dimensions')}:{' '}
                    {option.dimensions
                      .map((field) => `${field.label[localized]} (${field.id})`)
                      .join(', ') || label(locale, 'Không có', 'None')}
                  </span>
                  <span className="dda-chart-proposal-card__fields">
                    {label(locale, 'Chỉ số', 'Measures')}:{' '}
                    {option.measures
                      .map((field) => `${field.label[localized]} (${field.id})`)
                      .join(', ') || label(locale, 'Không có', 'None')}
                  </span>
                  <span className="dda-chart-proposal-card__size">
                    {label(locale, 'Kích thước hỗ trợ', 'Supported size')}:{' '}
                    {option.supportedSize[localized]}
                  </span>
                  <span id={descriptionId} className="dda-sr-only">
                    {option.accessibilityDescription[localized]}
                  </span>
                </span>
              </button>
              <ProposalDetails locale={locale} details={option.details} />
            </article>
          );
        })}
      </div>
      <button
        type="button"
        className="dda-chart-proposal-picker__confirm"
        disabled={selectedCount === 0 || isConfirming || confirming}
        onClick={() => void confirm()}
      >
        {isConfirming || confirming
          ? label(locale, 'Đang thêm biểu đồ…', 'Adding charts…')
          : confirmLabel}
      </button>
    </section>
  );
}

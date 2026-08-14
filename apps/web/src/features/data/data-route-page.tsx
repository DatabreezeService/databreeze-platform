import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { normalizeRouteLocale } from '../../app/locale-context.tsx';
import { FloatingAgentButton } from '../agent/floating-agent-button.tsx';
import { FloatingAgentPanel } from '../agent/floating-agent-panel.tsx';
import { workspaceAgentStore } from '../agent/workspace-agent-store.ts';
import { dashboardDemoMode } from '../dashboards/dashboard-api.ts';
import { DataWorkspacePage } from './data-workspace-page.tsx';
import { dataApiBaseConfiguration, DataApiError, fetchAuthorizedDataIndex } from './data-api.ts';
import type { DatasetCardV1 } from './data-model.ts';

const NO_AUTHORIZED_DATASETS: readonly DatasetCardV1[] = Object.freeze([]);
const DEMO_DATASETS: readonly DatasetCardV1[] = Object.freeze([
  Object.freeze({
    datasetId: '00000000-0000-4000-8000-000000000051',
    label: 'Bán hàng toàn quốc',
    health: Object.freeze({ label: 'Sẵn sàng phân tích', tone: 'HEALTHY' as const }),
    versionLabel: 'Phiên bản 12 · 24.680 hàng',
    refresh: Object.freeze({
      stateLabel: 'Đồng bộ tự động',
      lastSuccessfulLabel: 'Cập nhật 8 phút trước',
    }),
    versions: Object.freeze([
      Object.freeze({ versionId: 'v12', label: 'Phiên bản 12', stateLabel: 'Hiện tại' }),
      Object.freeze({ versionId: 'v11', label: 'Phiên bản 11', stateLabel: '10/08/2026' }),
    ]),
    sources: Object.freeze([
      Object.freeze({
        sourceId: '00000000-0000-4000-8000-000000000052',
        label: 'sales-august.xlsx',
        sourceType: 'XLSX' as const,
        versionLabel: 'Bản gốc · 12/08/2026',
        statusLabel: 'Đã nhập',
        healthLabel: 'Không có lỗi chặn',
        originalAction: 'VIEW_SAFE' as const,
        evidenceAvailable: true,
      }),
      Object.freeze({
        sourceId: '00000000-0000-4000-8000-000000000053',
        label: 'receipts-august.pdf',
        sourceType: 'RECEIPT' as const,
        versionLabel: '18 ảnh gốc',
        statusLabel: 'Đã OCR',
        healthLabel: '2 trường cần xem xét',
        originalAction: 'VIEW_SAFE' as const,
        evidenceAvailable: true,
        extractionReview: Object.freeze({
          uncertainFields: Object.freeze(['Mã số thuế', 'Phí giao hàng']),
        }),
      }),
    ]),
    preparation: Object.freeze({
      automaticPolicy: 'SAFE_NON_LOSSY' as const,
      counts: Object.freeze({
        input: 24683,
        output: 24680,
        unchanged: 24514,
        changed: 166,
        rejected: 0,
        quarantined: 3,
        unsupported: 0,
      }),
      transformations: Object.freeze(['Chuẩn hóa ngày', 'Chuẩn hóa VND', 'Loại khoảng trắng thừa']),
      warnings: Object.freeze(['3 hàng được cách ly để xem xét']),
      healthDimensions: Object.freeze([
        Object.freeze({
          dimension: 'Đầy đủ',
          numerator: 24596,
          denominator: 24680,
          coverage: 0.9966,
          rule: 'required-fields',
          expectation: 'Các trường bắt buộc có giá trị',
          sampleState: 'Toàn bộ dữ liệu',
          limitations: Object.freeze([]),
        }),
        Object.freeze({
          dimension: 'Hợp lệ',
          numerator: 24677,
          denominator: 24680,
          coverage: 0.9999,
          rule: 'typed-values',
          expectation: 'Ngày và số tiền hợp lệ',
          sampleState: 'Toàn bộ dữ liệu',
          limitations: Object.freeze([]),
        }),
      ]),
      overallSummary: Object.freeze({
        formula: 'trung bình có trọng số theo phạm vi kiểm tra',
        coverage: 0.9982,
        provesFactualCorrectness: false as const,
      }),
      datasetVersionLabel: 'Phiên bản 12',
      engineVersionLabel: 'DataBreeze ETL 1.0',
    }),
    reviewItems: Object.freeze([
      Object.freeze({
        reviewId: 'review-1',
        label: 'Xác nhận 2 trường OCR chưa chắc chắn',
        stateLabel: 'Chờ bạn',
      }),
    ]),
  }),
  Object.freeze({
    datasetId: '00000000-0000-4000-8000-000000000061',
    label: 'Tồn kho cửa hàng',
    health: Object.freeze({ label: 'Cần xem xét', tone: 'WARNING' as const }),
    versionLabel: 'Phiên bản 7 · 8.420 hàng',
    refresh: Object.freeze({
      stateLabel: 'Đang chờ xác nhận tệp',
      lastSuccessfulLabel: 'Cập nhật hôm qua',
    }),
    sources: Object.freeze([
      Object.freeze({
        sourceId: '00000000-0000-4000-8000-000000000062',
        label: 'inventory-store-03.csv',
        sourceType: 'CSV' as const,
        statusLabel: 'Nằm sai vị trí',
        healthLabel: 'Cần xác nhận bộ dữ liệu đích',
        originalAction: 'OPEN_ON_SOURCE_DEVICE' as const,
        evidenceAvailable: true,
      }),
    ]),
    reviewItems: Object.freeze([
      Object.freeze({
        reviewId: 'review-2',
        label: 'inventory-store-03.csv có thể thuộc Cửa hàng 03',
        stateLabel: 'Chờ xác nhận',
      }),
    ]),
  }),
]);

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        loading: 'Đang tải dữ liệu được cấp quyền...',
        error: 'Không thể tải dữ liệu được cấp quyền.',
        retry: 'Thử lại',
      }
    : {
        loading: 'Loading authorized data...',
        error: 'Authorized data could not be loaded.',
        retry: 'Try again',
      };
}

type DataLoadStateV1 =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly datasets: readonly DatasetCardV1[] }
  | { readonly status: 'error' };

/** WEB-002/020/021/024: production data is loaded from the authorized API; demo is explicit only. */
export function DataRoutePage() {
  const { locale: routeLocale } = useParams();
  const locale = normalizeRouteLocale(routeLocale);
  const demoMode = dashboardDemoMode();
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<DataLoadStateV1>({ status: 'loading' });
  const text = copy(locale);

  useEffect(() => {
    const controller = new AbortController();
    if (demoMode) {
      setState({ status: 'ready', datasets: DEMO_DATASETS });
      return () => controller.abort();
    }
    setState({ status: 'loading' });
    void fetchAuthorizedDataIndex({
      baseUrl: dataApiBaseConfiguration().baseUrl,
      locale,
      signal: controller.signal,
    })
      .then((datasets) => {
        if (!controller.signal.aborted) setState({ status: 'ready', datasets });
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          (error instanceof DataApiError && error.code === 'DATASETS_ABORTED')
        )
          return;
        setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [demoMode, locale, retryKey]);

  const visibleDatasets = state.status === 'ready' ? state.datasets : NO_AUTHORIZED_DATASETS;
  return (
    <div className="data-route-page">
      {state.status === 'loading' ? (
        <section aria-label={locale === 'vi-VN' ? 'Dữ liệu' : 'Data'}>
          <p role="status">{text.loading}</p>
        </section>
      ) : state.status === 'error' ? (
        <section aria-label={locale === 'vi-VN' ? 'Dữ liệu' : 'Data'}>
          <p role="alert">{text.error}</p>
          <button onClick={() => setRetryKey((current) => current + 1)} type="button">
            {text.retry}
          </button>
        </section>
      ) : (
        <DataWorkspacePage datasets={visibleDatasets} locale={locale} />
      )}
      <FloatingAgentButton locale={locale} store={workspaceAgentStore} />
      <FloatingAgentPanel locale={locale} store={workspaceAgentStore} surface="data" />
    </div>
  );
}

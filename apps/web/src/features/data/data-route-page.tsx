import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useParams } from 'react-router-dom';

import { normalizeRouteLocale } from '../../app/locale-context.tsx';
import { FloatingAgentButton } from '../agent/floating-agent-button.tsx';
import { FloatingAgentPanel } from '../agent/floating-agent-panel.tsx';
import { workspaceAgentStore } from '../agent/workspace-agent-store.ts';
import { dashboardDemoMode } from '../dashboards/dashboard-api.ts';
import { DataWorkspacePage } from './data-workspace-page.tsx';
import { dataApiBaseConfiguration, DataApiError, fetchAuthorizedDataIndex } from './data-api.ts';
import { DataImportApiError, dataImportApi, type DataImportRecordV1 } from './data-import-api.ts';
import type { DatasetCardV1 } from './data-model.ts';
import { localDataStore } from './local-data-store.ts';

const NO_AUTHORIZED_DATASETS: readonly DatasetCardV1[] = Object.freeze([]);

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        description:
          'Quản lý bộ dữ liệu, tệp nguồn, phiên bản và các mục cần xem xét trong phạm vi được cấp quyền.',
        heading: 'Dữ liệu',
        loading: 'Đang tải dữ liệu được cấp quyền...',
        error: 'Không thể tải dữ liệu được cấp quyền.',
        retry: 'Thử lại',
      }
    : {
        description:
          'Manage datasets, source files, versions, and review items within your authorized scope.',
        heading: 'Data',
        loading: 'Loading authorized data...',
        error: 'Authorized data could not be loaded.',
        retry: 'Try again',
      };
}

type DataLoadStateV1 =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly datasets: readonly DatasetCardV1[];
      readonly pendingImports: readonly DataImportRecordV1[];
    }
  | { readonly status: 'error' };

/** WEB-002/020/021/024: production data is loaded from the authorized API; demo is explicit only. */
export function DataRoutePage() {
  const { locale: routeLocale } = useParams();
  const locale = normalizeRouteLocale(routeLocale);
  const demoMode = dashboardDemoMode();
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<DataLoadStateV1>({ status: 'loading' });
  const text = copy(locale);

  const localDatasets = useSyncExternalStore(
    localDataStore.subscribe,
    () => localDataStore.getDatasets(locale),
    () => localDataStore.getDatasets(locale),
  );

  useEffect(() => {
    const controller = new AbortController();
    if (demoMode) {
      setState({ status: 'ready', datasets: localDatasets, pendingImports: [] });
      return () => controller.abort();
    }
    setState({ status: 'loading' });
    const baseUrl = dataApiBaseConfiguration().baseUrl;
    void Promise.all([
      fetchAuthorizedDataIndex({ baseUrl, locale, signal: controller.signal }),
      dataImportApi.list(50, baseUrl).catch((error: unknown) => {
        // The governed dataset index remains useful if review history is
        // temporarily unavailable. Authentication failures still surface.
        if (error instanceof DataImportApiError && error.status === 401) throw error;
        return Object.freeze([]) as readonly DataImportRecordV1[];
      }),
    ])
      .then(([apiDatasets, imports]) => {
        if (!controller.signal.aborted) {
          setState({
            datasets: apiDatasets,
            pendingImports: imports.filter(
              (record) => record.state === 'REVIEW_REQUIRED' || record.state === 'REVISING',
            ),
            status: 'ready',
          });
        }
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
  }, [demoMode, localDatasets, locale, retryKey]);

  const visibleDatasets = useMemo(() => {
    if (state.status !== 'ready') return NO_AUTHORIZED_DATASETS;
    if (demoMode) return localDatasets;
    return state.datasets;
  }, [demoMode, localDatasets, locale, state]);
  const pendingImports = state.status === 'ready' ? state.pendingImports : [];

  return (
    <div className="data-route-page">
      {state.status === 'loading' ? (
        <section
          aria-labelledby="data-route-heading"
          className="data-route-state data-route-state--loading"
        >
          <header className="data-route-state__heading">
            <h1 id="data-route-heading">{text.heading}</h1>
            <p>{text.description}</p>
          </header>
          <p className="data-route-state__notice" role="status">
            {text.loading}
          </p>
        </section>
      ) : state.status === 'error' ? (
        <section
          aria-labelledby="data-route-heading"
          className="data-route-state data-route-state--error"
        >
          <header className="data-route-state__heading">
            <h1 id="data-route-heading">{text.heading}</h1>
            <p>{text.description}</p>
          </header>
          <p className="data-route-state__notice data-route-state__notice--error" role="alert">
            {text.error}
          </p>
          <button onClick={() => setRetryKey((current) => current + 1)} type="button">
            {text.retry}
          </button>
        </section>
      ) : (
        <DataWorkspacePage
          datasets={visibleDatasets}
          pendingImports={pendingImports}
          locale={locale}
          demoMode={demoMode}
          onDatasetsChanged={() => setRetryKey((current) => current + 1)}
        />
      )}
      <FloatingAgentButton locale={locale} store={workspaceAgentStore} />
      <FloatingAgentPanel locale={locale} store={workspaceAgentStore} surface="data" />
    </div>
  );
}

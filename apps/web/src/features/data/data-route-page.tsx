import { useParams } from 'react-router-dom';
import { normalizeRouteLocale } from '../../app/locale-context.tsx';
import { createAgentStore } from '../agent/agent-store.ts';
import { FloatingAgentButton } from '../agent/floating-agent-button.tsx';
import { FloatingAgentPanel } from '../agent/floating-agent-panel.tsx';
import { DatasetIndexPage } from './dataset-index-page.tsx';

const store = createAgentStore();

export function DataRoutePage() {
  const { locale: routeLocale } = useParams();
  const locale = normalizeRouteLocale(routeLocale);
  return (
    <>
      <DatasetIndexPage
        locale={locale}
        datasets={[
          {
            datasetId: 'ds-1',
            label: locale === 'vi-VN' ? 'Doanh thu TP.HCM' : 'Ho Chi Minh revenue',
            health: 'READY',
            versionLabel: locale === 'vi-VN' ? 'phiên bản 8' : 'version 8',
          },
        ]}
      />
      <FloatingAgentButton locale={locale} store={store} />
      <FloatingAgentPanel locale={locale} store={store} surface="data" />
    </>
  );
}

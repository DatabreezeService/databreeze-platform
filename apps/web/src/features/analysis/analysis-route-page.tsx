import { createAgentStore } from '../agent/agent-store.ts';
import { FloatingAgentPanel } from '../agent/floating-agent-panel.tsx';
import { AnalysisPage } from './analysis-page.tsx';
import { useParams } from 'react-router-dom';
import { normalizeRouteLocale } from '../../app/locale-context.tsx';

const store = createAgentStore({
  conversationId: 'c1',
  title: 'Vì sao doanh thu tháng 7 giảm?',
  datasetLabel: 'Doanh thu TP.HCM',
  datasetVersionLabel: 'phiên bản 7',
});

export function AnalysisRoutePage() {
  const { locale: routeLocale } = useParams();
  const locale = normalizeRouteLocale(routeLocale);
  return (
    <>
      <AnalysisPage locale={locale} store={store} />
      <FloatingAgentPanel locale={locale} store={store} surface="analysis" />
    </>
  );
}

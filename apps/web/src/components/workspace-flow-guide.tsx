import { Link, useLocation } from 'react-router-dom';
import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';
import './workspace-flow-guide.css';

export interface WorkspaceFlowGuideProps {
  readonly locale: SupportedLocaleV1;
}

function copy(locale: SupportedLocaleV1) {
  return locale === 'vi-VN'
    ? {
        title: 'Quy trình làm việc:',
        step1: '1. Nạp dữ liệu',
        step1Desc: 'CSV / Excel',
        step2: '2. Hỏi & Phân tích',
        step2Desc: 'Trợ lý AI tạo biểu đồ',
        step3: '3. Bảng điều khiển',
        step3Desc: 'Ghim & theo dõi Canvas',
      }
    : {
        title: 'Workflow flow:',
        step1: '1. Ingest Data',
        step1Desc: 'CSV / Excel',
        step2: '2. Ask & Analyze',
        step2Desc: 'AI creates charts',
        step3: '3. Dashboards',
        step3Desc: 'Pin & monitor Canvas',
      };
}

export function WorkspaceFlowGuide({ locale }: WorkspaceFlowGuideProps) {
  const text = copy(locale);
  const location = useLocation();
  const path = location.pathname;

  const isData = path.includes('/data');
  const isAnalysis = path.includes('/analysis');
  const isDashboards = path.includes('/dashboards');

  return (
    <nav aria-label={text.title} className="workspace-flow-guide">
      <span className="workspace-flow-guide__title">{text.title}</span>
      <div className="workspace-flow-guide__steps">
        <Link
          to={`/${locale}/data`}
          className={`workspace-flow-step${isData ? ' is-active' : ''}`}
        >
          <span className="workspace-flow-step__badge">1</span>
          <div className="workspace-flow-step__info">
            <span className="workspace-flow-step__name">{text.step1}</span>
            <small className="workspace-flow-step__desc">{text.step1Desc}</small>
          </div>
        </Link>

        <span className="workspace-flow-arrow" aria-hidden="true">→</span>

        <Link
          to={`/${locale}/analysis`}
          className={`workspace-flow-step${isAnalysis ? ' is-active' : ''}`}
        >
          <span className="workspace-flow-step__badge">2</span>
          <div className="workspace-flow-step__info">
            <span className="workspace-flow-step__name">{text.step2}</span>
            <small className="workspace-flow-step__desc">{text.step2Desc}</small>
          </div>
        </Link>

        <span className="workspace-flow-arrow" aria-hidden="true">→</span>

        <Link
          to={`/${locale}/dashboards`}
          className={`workspace-flow-step${isDashboards ? ' is-active' : ''}`}
        >
          <span className="workspace-flow-step__badge">3</span>
          <div className="workspace-flow-step__info">
            <span className="workspace-flow-step__name">{text.step3}</span>
            <small className="workspace-flow-step__desc">{text.step3Desc}</small>
          </div>
        </Link>
      </div>
    </nav>
  );
}

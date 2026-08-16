import { useState } from 'react';
import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

import { AgentInvitation } from './agent-invitation.tsx';
import { AnalysisPlanReview, type AnalysisPlanPreviewV1 } from './analysis-plan-review.tsx';
import {
  DashboardAgentPanel,
  type DashboardAgentResponseV1,
  type DashboardAgentTargetV1,
} from './dashboard-agent-panel.tsx';
import type { DashboardChartProposalOptionV1 } from './chart-proposal-picker.tsx';
import { ResultEvidenceDrawer, type ResultEvidenceCellV1 } from './result-evidence-drawer.tsx';

export interface AnalystPanelProps {
  readonly locale: SupportedLocaleV1;
  readonly preview: AnalysisPlanPreviewV1;
  readonly cells?: readonly ResultEvidenceCellV1[];
  readonly onPropose?: (question: string) => void;
  readonly onExecute?: () => void;
  readonly agentTarget?: DashboardAgentTargetV1;
  readonly agentResponse?: DashboardAgentResponseV1;
  readonly proposalOptions?: readonly DashboardChartProposalOptionV1[];
  readonly onAskChart?: (
    question: string,
    target: DashboardAgentTargetV1,
  ) => DashboardAgentResponseV1 | void | Promise<DashboardAgentResponseV1 | void>;
  readonly onConfirmChartProposals?: (selectedOptionIds: readonly string[]) => void | Promise<void>;
  readonly onUseManualPlan?: () => void;
  readonly confirmingChartProposal?: boolean;
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

/** DDA-015..019: analyst panel composing plan review and evidence. */
export function AnalystPanel({
  locale,
  preview,
  cells = [],
  onPropose,
  onExecute,
  agentTarget,
  agentResponse,
  proposalOptions,
  onAskChart,
  onConfirmChartProposals,
  onUseManualPlan,
  confirmingChartProposal,
}: AnalystPanelProps) {
  const [question, setQuestion] = useState('');
  const [evidenceOpen, setEvidenceOpen] = useState(cells.length > 0);
  const [invitationVisible, setInvitationVisible] = useState(true);
  const [agentOpen, setAgentOpen] = useState(false);

  return (
    <section aria-label={label(locale, 'Nhà phân tích', 'Analyst')}>
      <h1>{label(locale, 'Hỏi dữ liệu có kiểm soát', 'Ask governed data')}</h1>
      <label>
        {label(locale, 'Câu hỏi', 'Question')}
        <input
          aria-label={label(locale, 'Câu hỏi phân tích', 'Analysis question')}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
      </label>
      <div>
        <button type="button" onClick={() => onPropose?.(question)}>
          {label(locale, 'Đề xuất kế hoạch', 'Propose plan')}
        </button>
        <button type="button" onClick={() => onExecute?.()}>
          {label(locale, 'Chạy xác định', 'Execute deterministically')}
        </button>
        <button type="button" onClick={() => setEvidenceOpen((value) => !value)}>
          {label(locale, 'Bằng chứng', 'Evidence')}
        </button>
      </div>
      <AnalysisPlanReview locale={locale} preview={preview} />
      <ResultEvidenceDrawer locale={locale} cells={cells} open={evidenceOpen} />
      <AgentInvitation
        expanded={agentOpen}
        locale={locale}
        visible={invitationVisible}
        onOpen={() => {
          setInvitationVisible(false);
          setAgentOpen(true);
        }}
        onDismiss={() => setInvitationVisible(false)}
      />
      <DashboardAgentPanel
        locale={locale}
        open={agentOpen}
        target={
          agentTarget ?? {
            pageId: 'current-page',
            pageTitle: { vi: 'Trang hiện tại', en: 'Current page' },
          }
        }
        onClose={() => setAgentOpen(false)}
        onSubmitQuestion={onAskChart ?? ((nextQuestion) => onPropose?.(nextQuestion))}
        manualFallback={
          <AnalysisPlanReview locale={locale} preview={preview} presentation="manual-fallback" />
        }
        {...(agentResponse === undefined ? {} : { response: agentResponse })}
        {...(proposalOptions === undefined ? {} : { proposalOptions })}
        {...(onConfirmChartProposals === undefined
          ? {}
          : { onConfirmProposal: onConfirmChartProposals })}
        {...(onUseManualPlan === undefined ? {} : { onUseManualPlan })}
        {...(confirmingChartProposal === undefined
          ? {}
          : { confirmingProposal: confirmingChartProposal })}
      />
    </section>
  );
}

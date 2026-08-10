import { useState } from 'react';
import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

import {
  AnalysisPlanReview,
  type AnalysisPlanPreviewV1,
} from './analysis-plan-review.tsx';
import {
  ResultEvidenceDrawer,
  type ResultEvidenceCellV1,
} from './result-evidence-drawer.tsx';

export interface AnalystPanelProps {
  readonly locale: SupportedLocaleV1;
  readonly preview: AnalysisPlanPreviewV1;
  readonly cells?: readonly ResultEvidenceCellV1[];
  readonly onPropose?: (question: string) => void;
  readonly onExecute?: () => void;
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
}: AnalystPanelProps) {
  const [question, setQuestion] = useState('');
  const [evidenceOpen, setEvidenceOpen] = useState(cells.length > 0);

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
    </section>
  );
}

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EtlReviewPage } from '../src/features/data-intake/etl-review-page.tsx';

describe('[DDA-006][DDA-009][DDA-010] etl review page', () => {
  it('shows schemas steps assumptions samples counts quality evidence and cost', () => {
    render(
      <EtlReviewPage
        locale="vi"
        state="READY_FOR_ACCEPTANCE"
        sourceSchema={['name', 'amount']}
        inferredSchema={['name', 'amount']}
        targetSchema={['name', 'amount']}
        orderedSteps={['TRIM_TEXT', 'PARSE_NUMBER']}
        assumptions={['amount is VND']}
        beforeSample={[{ name: ' A ', amount: '1' }]}
        afterSample={[{ name: 'A', amount: 1 }]}
        counts={{ changed: 1, unchanged: 0, rejected: 0 }}
        exclusions={[]}
        unsupportedScopes={[]}
        qualityEffects={[
          {
            dimension: 'completeness',
            denominator: 1,
            coverage: 1,
            rule: 'required',
            expectation: 'present',
            sampleState: 'FULL',
            limitations: ['fixture-backed'],
          },
          {
            dimension: 'validity',
            denominator: 1,
            coverage: 1,
            rule: 'parse',
            expectation: 'ok',
            sampleState: 'FULL',
            limitations: [],
          },
        ]}
        evidenceStatus="AVAILABLE"
        estimatedCost={{ cpuMs: 12, memoryMb: 32 }}
        overallSummary={{
          formula: 'min(coverage/denominator)',
          coverage: 1,
          provesFactualCorrectness: false,
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Xem xét ETL' })).toBeTruthy();
    expect(screen.getByText(/source: name, amount/u)).toBeTruthy();
    expect(screen.getByText('TRIM_TEXT')).toBeTruthy();
    expect(screen.getByText('amount is VND')).toBeTruthy();
    expect(screen.getByText(/changed=1 unchanged=0 rejected=0/u)).toBeTruthy();
    expect(screen.getByText(/completeness/u)).toBeTruthy();
    expect(screen.getByText(/evidence=AVAILABLE/u)).toBeTruthy();
    expect(screen.getByText(/cost=12ms\/32MB/u)).toBeTruthy();
    expect(
      screen.getByText(
        /Tỷ lệ này đo mức đạt quy tắc, không khẳng định dữ liệu đúng với thực tế\./u,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/percentage correct/iu)).toBeNull();
  });
});

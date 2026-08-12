import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PreparationSummaryPanel } from '../src/features/data-intake/preparation-summary-panel.tsx';
import { QualityDimensions } from '../src/features/data-intake/quality-dimensions.tsx';

describe('[DDA-053][DDA-009] preparation and quality surfaces', () => {
  it('shows numerator denominator coverage rule expectation sample and limitation', () => {
    render(
      <QualityDimensions
        locale="en"
        dimensions={[
          {
            dimension: 'completeness',
            numerator: 97,
            denominator: 100,
            coverage: 0.97,
            rule: 'required-fields',
            expectation: 'all-required-present',
            sampleState: 'PASS',
            limitations: ['Accepted version only'],
          },
        ]}
        overallSummary={{
          formula: 'min(numerator/denominator)',
          coverage: 0.97,
          provesFactualCorrectness: false,
        }}
      />,
    );
    expect(screen.getByText(/numerator=97/u)).toBeTruthy();
    expect(screen.getByText(/denominator=100/u)).toBeTruthy();
    expect(screen.getByText(/coverage=0.97/u)).toBeTruthy();
    expect(screen.getByText(/Does not prove factual correctness/u)).toBeTruthy();
    expect(screen.queryByText(/percentage correct/iu)).toBeNull();
  });

  it('renders first-import preparation summary in Vietnamese by default', () => {
    render(
      <PreparationSummaryPanel
        mode="FIRST_IMPORT"
        automaticPolicy="SAFE_NON_LOSSY"
        counts={{
          input: 10,
          output: 10,
          unchanged: 8,
          changed: 2,
          rejected: 0,
          quarantined: 0,
          unsupported: 0,
        }}
        transformations={['TRIM_TEXT', 'CAST_TYPE']}
        warnings={['HEADER_ALIAS_APPLIED']}
        healthDimensions={[
          {
            dimension: 'completeness',
            numerator: 10,
            denominator: 10,
            coverage: 1,
            rule: 'required',
            expectation: 'present',
            sampleState: 'PASS',
            limitations: ['Derived from accepted version only'],
          },
        ]}
        overallSummary={{
          formula: 'min(numerator/denominator)',
          coverage: 1,
          provesFactualCorrectness: false,
        }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Tóm tắt chuẩn bị' })).toBeTruthy();
    expect(screen.getByText(/SAFE_NON_LOSSY/u)).toBeTruthy();
    expect(screen.getByText('TRIM_TEXT')).toBeTruthy();
    expect(screen.getByText(/Khong chung minh do chinh xac thuc te/u)).toBeTruthy();
  });
});

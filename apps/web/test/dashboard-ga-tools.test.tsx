import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SnapshotComparison } from '../src/features/dashboards/snapshot-comparison.tsx';
import { TemplateDialog } from '../src/features/dashboards/template-dialog.tsx';
import { ExportDialog } from '../src/features/dashboards/export-dialog.tsx';

describe('dashboard GA tools [DDA-047][DDA-048][DDA-049]', () => {
  it('shows comparison disclosures', () => {
    render(
      <SnapshotComparison
        locale="en"
        changes={{ amount: { absolute: 50, percentage: 50 } }}
        changedWidgets={['bar-1']}
        changedInputs={['dataset-b']}
      />,
    );
    expect(screen.getByText(/amount: Δ 50 \/ 50%/u)).toBeTruthy();
    expect(screen.getByText(/Changed widgets: bar-1/u)).toBeTruthy();
  });

  it('clarifies templates exclude foreign data and exports reauthorize', () => {
    render(
      <>
        <TemplateDialog locale="en" open onSave={() => undefined} onClose={() => undefined} />
        <ExportDialog locale="en" open onExport={() => undefined} onClose={() => undefined} />
      </>,
    );
    expect(
      screen.getByText(/Templates store layout and bindings only — never data or permissions./u),
    ).toBeTruthy();
    expect(
      screen.getByText(/Downloads are re-authorized and do not broaden source access./u),
    ).toBeTruthy();
  });
});

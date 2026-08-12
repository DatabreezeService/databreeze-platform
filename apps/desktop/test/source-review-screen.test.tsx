import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SourceReviewScreen } from '../src/renderer/features/sources/source-review-screen.tsx';
import { SOURCE_REVIEW_CONTRACT_V1 } from '../src/shared/source-review-contract-v1.ts';

describe('[DSK-010] source review screen', () => {
  it('shows file label, folders, reasons, sample, schema comparison, and actions', () => {
    const onAction = vi.fn();
    render(
      <SourceReviewScreen
        locale="vi"
        onAction={onAction}
        record={{
          reviewId: '00000000-0000-4000-8000-000000000801',
          fileLabel: 'sales-2026-08.csv',
          currentFolder: 'receipts',
          suggestedFolder: 'sales',
          logicalDatasetLabel: 'Monthly sales',
          confidence: 0.75,
          reasons: ['FOLDER_MISMATCH'],
          warnings: ['Store name is data only'],
          sampleRows: [{ invoice_id: '1', amount: '10' }],
          schemaComparison: {
            current: ['invoice_id', 'amount'],
            expected: ['invoice_id', 'amount', 'region'],
          },
          actions: SOURCE_REVIEW_CONTRACT_V1.actions,
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Xem xét nguồn' })).toBeTruthy();
    expect(screen.getByText(/sales-2026-08.csv/u)).toBeTruthy();
    expect(screen.getByText(/FOLDER_MISMATCH/u)).toBeTruthy();
    expect(screen.getByText('invoice_id')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'MOVE' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'KEEP' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'LATER' })).toBeTruthy();
  });
});

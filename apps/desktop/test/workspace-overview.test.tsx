import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceOverview } from '../src/renderer/workbench/workspace-overview.tsx';

const catalog = {
  folders: [],
  datasets: [
    {
      datasetId: '01DATASET00000000000000001',
      displayName: 'Monthly sales',
      health: 'ATTENTION' as const,
    },
  ],
  reviewItems: [
    {
      reviewId: '01REVIEW000000000000000001',
      label: 'Store column is in the wrong folder',
      kind: 'SOURCE_MISMATCH' as const,
    },
  ],
  recentAnalyses: [],
};

describe('Desktop V2 workspace overview', () => {
  it('surfaces dataset health, contained originals, review work, and the governed agent entry point', async () => {
    const user = userEvent.setup();
    const onOpenDataset = vi.fn();
    const onOpenFile = vi.fn();
    const onOpenReview = vi.fn();
    const onAskAgent = vi.fn();

    render(
      <WorkspaceOverview
        catalog={catalog}
        datasetFiles={{
          '01DATASET00000000000000001': [
            {
              fileId: '01FILE000000000000000001',
              fileName: 'sales-aug.csv',
              sourceLabel: 'C:\\Data\\sales-aug.csv',
            },
            {
              fileId: '01FILE000000000000000002',
              fileName: 'sales-jul.csv',
              sourceLabel: 'C:\\Data\\sales-jul.csv',
            },
          ],
        }}
        locale="en"
        onAskAgent={onAskAgent}
        onOpenDataset={onOpenDataset}
        onOpenFile={onOpenFile}
        onOpenReview={onOpenReview}
      />,
    );

    expect(screen.getByRole('region', { name: 'Workspace overview' })).toBeTruthy();
    expect(screen.getByText('2 files')).toBeTruthy();
    expect(screen.getByText('Needs attention')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Monthly sales' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open sales-aug.csv' })).toBeTruthy();
    expect(screen.getByText('Store column is in the wrong folder')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Open Monthly sales' }));
    await user.click(screen.getByRole('button', { name: 'Open sales-aug.csv' }));
    await user.click(
      screen.getByRole('button', { name: 'Review Store column is in the wrong folder' }),
    );
    await user.click(screen.getByRole('button', { name: 'Ask agent' }));

    expect(onOpenDataset).toHaveBeenCalledWith('01DATASET00000000000000001');
    expect(onOpenFile).toHaveBeenCalledWith('01FILE000000000000000001');
    expect(onOpenReview).toHaveBeenCalledWith('01REVIEW000000000000000001');
    expect(onAskAgent).toHaveBeenCalledTimes(1);
  });
});

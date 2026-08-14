import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnalysisWorkbench } from '../src/renderer/workbench/analysis-workbench.tsx';
import { DockedAgent } from '../src/renderer/workbench/docked-agent.tsx';

describe('Desktop V2 docked agent', () => {
  it('renders docked agent with Vietnamese labels for Dashboard and Data', () => {
    render(
      <DockedAgent locale="vi-VN" open onOpenChange={() => undefined} onSubmit={() => undefined} />,
    );

    expect(
      screen.getByRole('complementary', { name: 'Tác nhân không gian làm việc' }),
    ).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Tin nhắn tới tác nhân' })).toBeTruthy();
  });

  it('keeps Analysis full-width without a duplicate docked agent', () => {
    render(
      <AnalysisWorkbench
        activity="analysis"
        locale="vi-VN"
        offline={false}
        session={{
          signedIn: true,
          accountLabel: 'operator@example.com',
          workspaceLabel: 'Ca nhan',
        }}
        status={{
          folderMonitoring: 'watching',
          syncQueue: 0,
          engineHealth: 'ready',
          pendingReviewCount: 0,
        }}
        catalog={{
          folders: [],
          datasets: [],
          reviewItems: [],
          recentAnalyses: [],
        }}
      />,
    );

    expect(
      screen.queryByRole('complementary', { name: 'Tác nhân không gian làm việc' }),
    ).toBeNull();
    expect(screen.getByRole('main', { name: 'Khu vực phân tích' })).toBeTruthy();
  });

  it('shows one docked agent for Dashboard and never a floating duplicate', () => {
    render(
      <AnalysisWorkbench
        activity="dashboard"
        locale="en"
        offline={false}
        session={{
          signedIn: true,
          accountLabel: 'operator@example.com',
          workspaceLabel: 'Personal',
        }}
        status={{
          folderMonitoring: 'watching',
          syncQueue: 1,
          engineHealth: 'ready',
          pendingReviewCount: 0,
        }}
        catalog={{
          folders: [],
          datasets: [
            {
              datasetId: '01DATASET00000000000000001',
              displayName: 'Monthly sales',
              health: 'READY',
            },
          ],
          reviewItems: [],
          recentAnalyses: [],
        }}
      />,
    );

    expect(screen.getAllByRole('complementary', { name: 'Workspace agent' })).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Workspace overview' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Every source, in one calm view' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /floating agent/iu })).toBeNull();
  });
});

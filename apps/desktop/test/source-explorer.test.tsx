import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SourceExplorer } from '../src/renderer/workbench/source-explorer.tsx';

const catalog = {
  folders: [
    {
      bindingId: '01FOLDER000000000000000001',
      displayName: 'Thu muc ban hang',
      pendingReviewCount: 2,
    },
  ],
  datasets: [
    {
      datasetId: '01DATASET00000000000000001',
      displayName: 'Chi phi Q1',
      health: 'READY' as const,
    },
  ],
  reviewItems: [
    {
      reviewId: '01REVIEW000000000000000001',
      label: 'Hoa don can xem',
      kind: 'OCR_REVIEW_REQUIRED' as const,
    },
  ],
  recentAnalyses: [
    {
      conversationId: '01CONV00000000000000000001',
      title: 'Phan tich bien dong',
    },
  ],
};

describe('Desktop V2 source explorer', () => {
  it('lists content-safe folders, datasets, reviews, and recent analyses in Vietnamese', () => {
    render(
      <SourceExplorer
        catalog={catalog}
        locale="vi-VN"
        onOpenItem={() => undefined}
        onImport={() => undefined}
      />,
    );

    const explorer = screen.getByRole('region', { name: 'Trình khám phá nguồn' });
    expect(within(explorer).getByText('Thu muc ban hang')).toBeTruthy();
    expect(within(explorer).getByText('Chi phi Q1')).toBeTruthy();
    expect(within(explorer).getByText('Hoa don can xem')).toBeTruthy();
    expect(within(explorer).getByText('Phan tich bien dong')).toBeTruthy();
    expect(within(explorer).getByText('2 đánh giá')).toBeTruthy();
    expect(explorer.textContent).not.toMatch(/C:\\|\/Users\/|password|secret/iu);
  });

  it('opens selected sources and exposes manual import in English', async () => {
    const user = userEvent.setup();
    const onOpenItem = vi.fn();
    const onImport = vi.fn();
    render(
      <SourceExplorer catalog={catalog} locale="en" onOpenItem={onOpenItem} onImport={onImport} />,
    );

    expect(screen.getByRole('region', { name: 'Source explorer' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Chi phi Q1' }));
    expect(onOpenItem).toHaveBeenCalledWith({
      kind: 'dataset',
      id: '01DATASET00000000000000001',
    });
    await user.click(screen.getByRole('button', { name: 'Import source' }));
    expect(onImport).toHaveBeenCalledTimes(1);
  });
});

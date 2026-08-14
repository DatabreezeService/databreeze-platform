import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DataWorkspacePage } from '../src/features/data/data-workspace-page.tsx';

describe('[DDA-009][DDA-052][DDA-053] Data destination', () => {
  it('opens a logical dataset with health, preparation, version, and refresh context', async () => {
    const user = userEvent.setup();
    render(
      <DataWorkspacePage
        locale="vi-VN"
        datasets={[
          {
            datasetId: 'sales-hcm',
            label: 'Doanh thu TP.HCM',
            health: { label: 'Cần xem xét 1 cảnh báo', tone: 'WARNING' },
            versionLabel: 'phiên bản 42',
            refresh: {
              stateLabel: 'Đã làm mới',
              lastSuccessfulLabel: 'Lần thành công gần nhất: 10:42',
            },
            versions: [
              { versionId: 'version-42', label: 'phiên bản 42', stateLabel: 'Đang dùng' },
              { versionId: 'version-41', label: 'phiên bản 41', stateLabel: 'Có thể khôi phục' },
            ],
            sources: [
              {
                sourceId: 'source-jan',
                label: 'sales-jan.xlsx',
                sourceType: 'XLSX',
                versionLabel: 'tệp phiên bản 3',
                statusLabel: 'Đã xử lý',
                healthLabel: 'Tốt',
                originalAction: 'OPEN_ON_SOURCE_DEVICE',
                evidenceAvailable: true,
              },
            ],
            preparation: {
              automaticPolicy: 'SAFE_NON_LOSSY',
              counts: {
                input: 120,
                output: 120,
                unchanged: 116,
                changed: 4,
                rejected: 0,
                quarantined: 0,
                unsupported: 0,
              },
              transformations: ['TRIM_TEXT'],
              warnings: ['Kiểm tra một trường có độ phủ thấp.'],
              healthDimensions: [
                {
                  dimension: 'completeness',
                  numerator: 118,
                  denominator: 120,
                  coverage: 0.98,
                  rule: 'required-fields',
                  expectation: 'all-required-present',
                  sampleState: 'FULL',
                  limitations: ['Chỉ phản ánh phiên bản được chấp nhận.'],
                },
              ],
              overallSummary: {
                formula: 'min(numerator/denominator)',
                coverage: 0.98,
                provesFactualCorrectness: false,
              },
              datasetVersionLabel: 'phiên bản 42',
              engineVersionLabel: 'engine 2.4.1',
            },
            reviewItems: [
              { reviewId: 'review-1', label: 'Một tệp cần xem xét', stateLabel: 'Chờ xem xét' },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Dữ liệu' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Doanh thu TP.HCM/u })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Doanh thu TP.HCM/u }));

    expect(screen.getByRole('heading', { name: 'Doanh thu TP.HCM' })).toBeTruthy();
    expect(screen.getAllByText('Cần xem xét 1 cảnh báo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('phiên bản 42').length).toBeGreaterThan(0);
    expect(screen.getByText('Lần thành công gần nhất: 10:42')).toBeTruthy();
    expect(screen.getByText('TRIM_TEXT')).toBeTruthy();
    expect(screen.getByText('engine 2.4.1')).toBeTruthy();
  });

  it('opens the safe original action without exposing a local path', async () => {
    const user = userEvent.setup();
    render(
      <DataWorkspacePage
        locale="vi-VN"
        datasets={[
          {
            datasetId: 'sales-hcm',
            label: 'Doanh thu TP.HCM',
            health: { label: 'Tốt', tone: 'HEALTHY' },
            versionLabel: 'phiên bản 42',
            versions: [],
            sources: [
              {
                sourceId: 'source-jan',
                label: 'sales-jan.xlsx',
                sourceType: 'XLSX',
                statusLabel: 'Đã xử lý',
                healthLabel: 'Tốt',
                originalAction: 'OPEN_ON_SOURCE_DEVICE',
                evidenceAvailable: true,
              },
            ],
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Doanh thu TP.HCM/u }));
    await user.click(screen.getByRole('button', { name: /sales-jan\.xlsx/u }));

    expect(screen.getByRole('region', { name: 'Bản gốc được quản trị' }).textContent).toContain(
      'Mở trên thiết bị nguồn',
    );
    expect(screen.getByRole('button', { name: 'Xem bằng chứng' })).toBeTruthy();
    expect(screen.queryByText(/C:\\Users|\\\//u)).toBeNull();
  });

  it('keeps an empty workspace explicit instead of inventing a dataset', () => {
    render(<DataWorkspacePage locale="en" datasets={[]} />);

    expect(screen.getByRole('heading', { name: 'Data' })).toBeTruthy();
    expect(
      screen.getByText('No authorized datasets are available in this workspace.'),
    ).toBeTruthy();
    expect(screen.queryByText(/version \d+/iu)).toBeNull();
  });
});

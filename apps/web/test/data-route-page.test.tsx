import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { DataRoutePage } from '../src/features/data/data-route-page.tsx';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function emptyIndex() {
  return { accepted: true, value: { datasets: [], page: { limit: 25 } } };
}

function pendingImportEnvelope() {
  return {
    accepted: true,
    value: {
      imports: [
        {
          importId: '00000000-0000-4000-8000-000000000111',
          revision: 1,
          state: 'REVIEW_REQUIRED',
          destination: 'NEW_DATASET',
          datasetName: 'August sales',
          idempotencyKey: 'import-1',
          sources: [
            {
              sessionId: '00000000-0000-4000-8000-000000000112',
              artifactVersionId: '00000000-0000-4000-8000-000000000113',
              fileName: 'sales.csv',
              mediaType: 'text/csv',
              contentSha256: 'a'.repeat(64),
              byteSize: 42,
              rowCount: 2,
              fields: [
                {
                  fieldId: '00000000-0000-4000-8000-000000000114',
                  name: 'region',
                  type: 'TEXT',
                  nullable: false,
                },
              ],
              sampleRows: [{ region: 'North' }],
            },
          ],
          review: {
            reviewRequired: true,
            beforeSample: [{ region: ' North ' }],
            afterSample: [{ region: 'North' }],
            counts: { input: 2, output: 2, changed: 1, rejected: 0 },
            quality: { completeness: 1, validity: 1, uniqueness: 1, consistency: 1 },
            warnings: ['preview'],
            corrections: [],
          },
          createdAt: '2026-08-18T00:00:00.000Z',
          updatedAt: '2026-08-18T00:00:00.000Z',
        },
      ],
    },
  };
}

function approvedImportEnvelope() {
  const envelope = pendingImportEnvelope();
  return {
    accepted: true,
    value: {
      ...envelope.value,
      imports: [
        {
          ...envelope.value.imports[0],
          state: 'READY',
          accepted: {
            datasetId: '00000000-0000-4000-8000-000000000501',
            datasetVersionId: '00000000-0000-4000-8000-000000000502',
            definitionVersionId: '00000000-0000-4000-8000-000000000502',
            dashboardStatus: 'BUILDING',
            approvedAt: '2026-08-18T00:00:00.000Z',
          },
        },
      ],
    },
  };
}

function renderDataRoute(locale = 'vi-VN') {
  return render(
    <MemoryRouter initialEntries={[`/${locale}/data`]}>
      <Routes>
        <Route path="/:locale/data" element={<DataRoutePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('[WEB-020][WEB-021][WEB-024] data route loading states', () => {
  it('shows a localized loading state while the authorized index is pending', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>(() => new Promise(() => undefined)),
    );

    renderDataRoute();

    expect(screen.getByRole('heading', { name: 'Dữ liệu' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Đang tải dữ liệu');
    expect(screen.getByRole('status').closest('section')?.className).toContain(
      'data-route-state--loading',
    );
  });

  it('shows an error state for unauthorized data without falling back to cards', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse({ error: 'hidden' }, 401)),
    );

    renderDataRoute();

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('heading', { name: 'Dữ liệu' })).toBeTruthy();
    expect(
      screen.getByText(
        'Quản lý bộ dữ liệu, tệp nguồn, phiên bản và các mục cần xem xét trong phạm vi được cấp quyền.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Không thể tải dữ liệu');
    expect(screen.getByRole('alert').closest('section')?.className).toContain(
      'data-route-state--error',
    );
    expect(screen.queryByText('Doanh thu TP.HCM')).toBeNull();
  });

  it('keeps the English title hierarchy above the canvas error notice', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse({ error: 'hidden' }, 401)),
    );

    renderDataRoute('en');

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('heading', { name: 'Data' })).toBeTruthy();
    expect(
      screen.getByText(
        'Manage datasets, source files, versions, and review items within your authorized scope.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Authorized data could not be loaded.');
  });

  it('offers the governed upload entry when no datasets exist yet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse(emptyIndex())),
    );

    renderDataRoute();

    await waitFor(() =>
      expect(
        screen.getByText('Chưa có bộ dữ liệu được cấp quyền trong không gian làm việc này.'),
      ).toBeTruthy(),
    );
    expect(screen.queryByText('Doanh thu TP.HCM')).toBeNull();
    expect(screen.getAllByRole('button', { name: '+ Thêm dữ liệu' })).toHaveLength(1);
    expect(screen.getByText('Chọn tệp để tải lên')).toBeTruthy();
    expect(screen.queryByText('Tải tệp an toàn chưa khả dụng trong bản chạy này.')).toBeNull();
  });

  it('opens the import drawer prefilled when a file is selected and sends no bytes before submit', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(jsonResponse(emptyIndex())),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderDataRoute();

    const input = await screen.findByLabelText('Chọn tệp để tải lên');
    await user.upload(
      input,
      new File(['ngay,so_tien\n2026-08-01,120000\n'], 'expenses.csv', { type: 'text/csv' }),
    );

    // WEB-005/DDA-053: selection only opens the governed import flow; bytes are
    // sent exclusively through the data-import session after explicit submit.
    await waitFor(() =>
      expect(screen.getByText('Thêm dữ liệu vào Không gian làm việc')).toBeTruthy(),
    );
    expect(screen.getByText(/expenses\.csv/)).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const method = typeof init?.method === 'string' ? init.method.toUpperCase() : 'GET';
        return (
          method !== 'GET' &&
          (url.includes('/v1/dda/web-intake/upload') || url.includes('/v1/dda/data-imports'))
        );
      }),
    ).toBe(false);
  });

  it('re-opens a server review after reload instead of losing the import session', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof globalThis.fetch>((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/corrections')) {
        const base = pendingImportEnvelope().value.imports[0];
        if (base === undefined) throw new Error('pending import fixture missing');
        return Promise.resolve(
          jsonResponse({
            accepted: true,
            value: {
              ...base,
              revision: 2,
              review: {
                ...base.review,
                afterSample: [{ region: 'South' }],
                corrections: [
                  {
                    correctionId: '00000000-0000-4000-8000-000000000115',
                    message: 'Viết hoa cột region',
                    fieldName: 'region',
                    createdAt: '2026-08-18T00:01:00.000Z',
                  },
                ],
              },
              updatedAt: '2026-08-18T00:01:00.000Z',
            },
          }),
        );
      }
      return Promise.resolve(
        jsonResponse(
          url.includes('/v1/dda/data-imports?') ? pendingImportEnvelope() : emptyIndex(),
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderDataRoute();

    const pending = await screen.findByRole('button', { name: /August sales/ });
    await user.click(pending);

    expect(
      await screen.findByRole('heading', { name: 'Xem xét và Phê duyệt Chuẩn hóa Dữ liệu' }),
    ).toBeTruthy();
    expect(screen.getByText('☁ Được quản lý bởi máy chủ')).toBeTruthy();
    expect(screen.getByText('North')).toBeTruthy();

    await user.type(screen.getByPlaceholderText(/Ví dụ: Đổi cột/u), 'Viết hoa cột region');
    await user.click(screen.getByRole('button', { name: 'Yêu cầu chỉnh lại' }));
    expect(await screen.findByText('South')).toBeTruthy();
  });

  it('does not show a successful revision message when the server rejects the correction', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof globalThis.fetch>((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/corrections')) {
        return Promise.resolve(
          jsonResponse(
            {
              type: 'https://schemas.databreeze.dev/problems/dda-import-revision-conflict',
              title: 'Revision conflict',
              status: 409,
              code: 'DATA_IMPORT_REVISION_CONFLICT',
            },
            409,
          ),
        );
      }
      return Promise.resolve(
        jsonResponse(
          url.includes('/v1/dda/data-imports?') ? pendingImportEnvelope() : emptyIndex(),
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderDataRoute();
    await user.click(await screen.findByRole('button', { name: /August sales/ }));
    await screen.findByRole('heading', { name: 'Xem xét và Phê duyệt Chuẩn hóa Dữ liệu' });

    await user.type(screen.getByPlaceholderText(/Ví dụ: Đổi cột/u), 'Đổi cột ngày');
    await user.click(screen.getByRole('button', { name: 'Yêu cầu chỉnh lại' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Bản xem trước đã thay đổi trên máy chủ',
    );
    expect(screen.queryByText('✓ Đã ghi nhận yêu cầu chỉnh sửa')).toBeNull();
  });

  it('renders bounded approved server samples in the dataset detail table', async () => {
    const user = userEvent.setup();
    const datasetId = '00000000-0000-4000-8000-000000000501';
    const fetchMock = vi.fn<typeof globalThis.fetch>((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/v1/datasets?')) {
        return Promise.resolve(
          jsonResponse({
            accepted: true,
            value: {
              datasets: [
                {
                  datasetId,
                  versionId: '00000000-0000-4000-8000-000000000502',
                  label: 'Bán hàng tháng',
                  status: 'PUBLISHED',
                  versionLabel: '2026-08-18T00:00:00.000Z',
                  publishedAt: '2026-08-18T00:00:00.000Z',
                  fieldCount: 2,
                  fieldTypes: ['TEXT', 'DECIMAL'],
                  health: 'UNKNOWN',
                  readiness: 'READY',
                },
              ],
              page: { limit: 25 },
            },
          }),
        );
      }
      if (url.includes('/v1/dda/data-imports?')) {
        return Promise.resolve(jsonResponse(approvedImportEnvelope()));
      }
      return Promise.resolve(
        jsonResponse({
          accepted: true,
          value: {
            datasetId,
            entries: [],
            page: { limit: 5 },
            generatedAt: '2026-08-18T00:00:00.000Z',
          },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderDataRoute();

    await user.click(await screen.findByRole('button', { name: /Bán hàng tháng/u }));
    await user.click(screen.getByRole('button', { name: 'Dữ liệu' }));

    expect(await screen.findByRole('region', { name: 'Xem trước bảng dữ liệu' })).toBeTruthy();
    expect(screen.getByText('North')).toBeTruthy();
    expect(screen.getAllByText('2', { selector: 'strong' })).toHaveLength(2);
  });

  it('does not expose a dead local cleaning-agent button for server datasets', async () => {
    const user = userEvent.setup();
    const datasetId = '00000000-0000-4000-8000-000000000601';
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>((input) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/v1/datasets?')) {
          return Promise.resolve(
            jsonResponse({
              accepted: true,
              value: {
                datasets: [
                  {
                    datasetId,
                    versionId: '00000000-0000-4000-8000-000000000602',
                    label: 'Server sales',
                    status: 'PUBLISHED',
                    versionLabel: '2026-08-18T00:00:00.000Z',
                    publishedAt: '2026-08-18T00:00:00.000Z',
                    fieldCount: 1,
                    fieldTypes: ['DECIMAL'],
                    health: 'UNKNOWN',
                    readiness: 'READY',
                  },
                ],
                page: { limit: 25 },
              },
            }),
          );
        }
        return Promise.resolve(jsonResponse({ accepted: true, value: { imports: [] } }));
      }),
    );

    renderDataRoute();
    await user.click(await screen.findByRole('button', { name: /Server sales/u }));

    expect(screen.queryByRole('button', { name: /Trợ lý dữ liệu|Data agent/u })).toBeNull();
    expect(
      screen.getByRole('status', {
        name: '',
      }),
    ).toBeTruthy();
    expect(screen.getByText(/Phiên bản này được quản lý bởi máy chủ/u)).toBeTruthy();
  });
});

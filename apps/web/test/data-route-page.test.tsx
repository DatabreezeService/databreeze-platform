import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
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

describe('[WEB-020][WEB-021][WEB-024] data route loading states', () => {
  it('shows a localized loading state while the authorized index is pending', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>(() => new Promise(() => undefined)),
    );

    render(<DataRoutePage />);

    expect(screen.getByRole('heading', { name: 'Dữ liệu' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Đang tải dữ liệu');
  });

  it('shows an error state for unauthorized data without falling back to cards', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse({ error: 'hidden' }, 401)),
    );

    render(<DataRoutePage />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('heading', { name: 'Dữ liệu' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Không thể tải dữ liệu');
    expect(screen.queryByText('Doanh thu TP.HCM')).toBeNull();
  });

  it('offers the governed upload entry when no datasets exist yet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse(emptyIndex())),
    );

    render(<DataRoutePage />);

    await waitFor(() =>
      expect(
        screen.getByText('Chưa có bộ dữ liệu được cấp quyền trong không gian làm việc này.'),
      ).toBeTruthy(),
    );
    expect(screen.queryByText('Doanh thu TP.HCM')).toBeNull();
    expect(screen.getByText('Chọn tệp để tải lên')).toBeTruthy();
    expect(screen.queryByText('Tải tệp an toàn chưa khả dụng trong bản chạy này.')).toBeNull();
  });

  it('opens the import drawer prefilled when a file is selected and sends no bytes before submit', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(jsonResponse(emptyIndex())),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<DataRoutePage />);

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
        const method =
          typeof init?.method === 'string' ? init.method.toUpperCase() : 'GET';
        return (
          method !== 'GET' &&
          (url.includes('/v1/dda/web-intake/upload') || url.includes('/v1/dda/data-imports'))
        );
      }),
    ).toBe(false);
  });
});

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

    expect(screen.getByRole('status').textContent).toContain('Đang tải dữ liệu');
  });

  it('shows an error state for unauthorized data without falling back to cards', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse({ error: 'hidden' }, 401)),
    );

    render(<DataRoutePage />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('Không thể tải dữ liệu');
    expect(screen.queryByText('Doanh thu TP.HCM')).toBeNull();
  });

  it('shows an explicit authorized empty state when the API returns no datasets', async () => {
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
    expect(screen.getByText('Tải tệp an toàn chưa khả dụng trong bản chạy này.')).toBeTruthy();
  });
});

import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';

const artifactVersionId = '00000000-0000-4000-8000-000000000001';
const auditId = '00000000-0000-4000-8000-000000000002';
const sheetId = '00000000-0000-4000-8000-000000000003';

const auditResult = {
  auditId,
  artifactVersionId,
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '00000000-0000-4000-8000-000000000005',
    workspaceId: '00000000-0000-4000-8000-000000000006',
  },
  workbookSha256: 'a'.repeat(64),
  sheets: [{ sheetId, name: 'Orders', maxRow: 24, maxColumn: 8, formulaCount: 16 }],
  findings: [
    {
      findingId: '00000000-0000-4000-8000-000000000004',
      sheetId,
      address: 'C4',
      kind: 'FORMULA_FAMILY_OUTLIER',
      severity: 'WARNING',
      formulaFingerprint: 'b'.repeat(64),
      formula: '=SUM(A1:A3)',
      sourceValue: 'sensitive cell value',
    },
  ],
  blockedReasons: [],
  processorVersion: 'spreadsheet-auditor-0.1.0',
  createdAt: '2026-08-04T00:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('spreadsheet audit review surface', () => {
  it('renders the Vietnamese-first list without source values or formulas', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ accepted: true, value: [auditResult] }), { status: 200 }),
        ),
    );
    const router = createAppRouter({
      initialEntries: [`/vi-VN/audit?artifactVersionId=${artifactVersionId}`],
    });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByRole('heading', { name: 'Kiểm tra bảng tính' })).toBeTruthy();
    expect(await screen.findByRole('link', { name: auditId })).toBeTruthy();
    expect(screen.queryByText('=SUM(A1:A3)')).toBeNull();
    expect(screen.queryByText('sensitive cell value')).toBeNull();
  });

  it('opens an immutable result detail view from the list', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accepted: true, value: [auditResult] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accepted: true, value: auditResult }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const router = createAppRouter({
      initialEntries: [`/en/audit?artifactVersionId=${artifactVersionId}`],
    });
    render(<ApplicationBoundary router={router} />);

    await user.click(await screen.findByRole('link', { name: auditId }));

    expect(await screen.findByRole('heading', { name: 'Spreadsheet audit details' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'C4' })).toBeTruthy();
    expect(screen.queryByText('=SUM(A1:A3)')).toBeNull();
    await waitFor(() => expect(router.state.location.pathname).toBe(`/en/audit/${auditId}`));
  });

  it('shows an explicit empty state when the artifact has no results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ accepted: true, value: [] }))),
    );
    const router = createAppRouter({
      initialEntries: [`/en/audit?artifactVersionId=${artifactVersionId}`],
    });
    render(<ApplicationBoundary router={router} />);

    expect(
      await screen.findByText('No spreadsheet audit results exist for this artifact.'),
    ).toBeTruthy();
  });

  it('shows a safe retry state when the result API is unavailable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('private server detail'));
    vi.stubGlobal('fetch', fetchMock);
    const router = createAppRouter({
      initialEntries: [`/en/audit?artifactVersionId=${artifactVersionId}`],
    });
    render(<ApplicationBoundary router={router} />);

    expect(
      await screen.findByText('Spreadsheet audit results could not load. No changes were sent.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry safely' })).toBeTruthy();
    expect(screen.queryByText('private server detail')).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('does not request data without an exact artifact version', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const router = createAppRouter({ initialEntries: ['/vi-VN/audit'] });
    render(<ApplicationBoundary router={router} />);

    expect(
      await screen.findByText('Chọn một phiên bản hiện vật để xem kết quả kiểm tra.'),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

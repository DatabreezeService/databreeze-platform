import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';

const ids = {
  event: '00000000-0000-4000-8000-000000000101',
  actor: '00000000-0000-4000-8000-000000000102',
  entity: '00000000-0000-4000-8000-000000000103',
  request: '00000000-0000-4000-8000-000000000104',
  subject: '00000000-0000-4000-8000-000000000105',
  policy: '00000000-0000-4000-8000-000000000106',
};

const scope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000107',
  workspaceId: '00000000-0000-4000-8000-000000000108',
};

const auditEvent = {
  schemaVersion: 1,
  eventId: ids.event,
  action: 'workspace.created',
  tenantScope: scope,
  actor: { actorType: 'USER', actorId: ids.actor },
  entityType: 'workspace',
  entityId: ids.entity,
  entityRevision: 1,
  sequence: 4,
  occurredAt: '2026-08-18T12:00:00.000Z',
  correlationId: ids.event,
  idempotencyKey: 'audit-test',
  summary: { name: 'Operations', revision: 1 },
  previousDigest: null,
  digest: 'a'.repeat(64),
};

const approvalRequest = {
  schemaVersion: 1,
  requestId: ids.request,
  tenantScope: scope,
  subjectType: 'DASHBOARD_PUBLICATION',
  subjectId: ids.subject,
  subjectVersion: 1,
  subjectHash: 'b'.repeat(64),
  requestedAction: 'PUBLISH_DASHBOARD',
  policyId: ids.policy,
  policyVersion: 1,
  requestedBy: ids.actor,
  status: 'OPEN',
  createdAt: '2026-08-18T12:01:00.000Z',
  revision: 1,
};

describe('governance user surfaces', () => {
  it('renders server audit history and keeps content-safe metadata behind disclosure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(new Response(JSON.stringify({ items: [auditEvent] }), { status: 200 })),
        ),
    );
    const router = createAppRouter({ initialEntries: ['/en/audit'] });
    render(<ApplicationBoundary router={router} />);
    expect(await screen.findByRole('heading', { name: 'Audit history' })).toBeTruthy();
    expect(await screen.findByText('workspace.created')).toBeTruthy();
    expect(screen.getByText('Operations').closest('details')?.open).toBe(false);
    await userEvent.setup().click(screen.getByText('2 metadata'));
    expect(screen.getByText('Operations')).toBeTruthy();
    expect(screen.getByText('Operations').closest('details')?.open).toBe(true);
  });

  it('renders an honest empty audit state after a confirmed server response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 })),
        ),
    );
    const router = createAppRouter({ initialEntries: ['/vi-VN/audit'] });
    render(<ApplicationBoundary router={router} />);
    expect(await screen.findByText('Lịch sử của bạn sẽ xuất hiện ở đây')).toBeTruthy();
  });

  it('renders approval detail without exposing a client-side decision button', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/v1/approvals/requests/')) {
        return Promise.resolve(
          new Response(JSON.stringify({ request: approvalRequest, decisions: [] }), {
            status: 200,
          }),
        );
      }
      if (url.includes('/v1/approvals/requests')) {
        return Promise.resolve(new Response(JSON.stringify([approvalRequest]), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const router = createAppRouter({ initialEntries: ['/en/approvals'] });
    render(<ApplicationBoundary router={router} />);
    const request = await screen.findByRole('button', { name: /PUBLISH_DASHBOARD/u });
    await userEvent.setup().click(request);
    expect(await screen.findByText('Recorded decisions')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /approve|reject/i })).toBeNull();
  });

  it('never turns an audit API failure into an empty feed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status: 503 }))),
    );
    const router = createAppRouter({ initialEntries: ['/en/audit'] });
    render(<ApplicationBoundary router={router} />);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Audit history is unavailable.',
    );
    expect(screen.queryByText('Your history will appear here')).toBeNull();
  });
});

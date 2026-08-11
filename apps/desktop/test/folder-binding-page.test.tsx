import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FolderBindingPage } from '../src/renderer/features/folders/folder-binding-page.tsx';

describe('folder binding composed surface [DDA-037]', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'databreezeDesktop');
  });

  it('shows hybrid defaults, quarantine queue, and projection review without inventing sync', () => {
    render(
      <FolderBindingPage
        locale="en"
        capabilityGrantId="00000000-0000-4000-8000-0000000000d1"
        organizationId="00000000-0000-4000-8000-000000000001"
        workspaceId="00000000-0000-4000-8000-000000000002"
        reviewQueue={[
          {
            eventId: 'evt_cccccccccccccccccccccccc',
            bindingId: '01HHHHHHHHHHHHHHHHHHHHHHHH',
            reason: 'PARTIAL_OR_LOCK_FILE',
            profileHint: 'CSV',
            observedAtMs: 1,
          },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Approved data folders' })).toBeTruthy();
    expect(
      screen.getByText(
        'Hybrid is the default: originals stay local; only approved projections sync.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Folder review queue' })).toBeTruthy();
    expect(screen.getByText(/PARTIAL_OR_LOCK_FILE/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Hybrid projection preview' })).toBeTruthy();
    expect(screen.getByText('HYBRID')).toBeTruthy();

    const confirm = screen.getByRole('button', {
      name: 'Sync only after the user confirms this projection',
    });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText('Create a folder binding before confirming Hybrid projection sync.'),
    ).toBeTruthy();
  });

  it('enables Hybrid projection confirm only after a binding exists', () => {
    render(
      <FolderBindingPage
        locale="en"
        capabilityGrantId="00000000-0000-4000-8000-0000000000d1"
        organizationId="00000000-0000-4000-8000-000000000001"
        workspaceId="00000000-0000-4000-8000-000000000002"
        initialStatus={{
          bindingId: '01AAAAAAAAAAAAAAAAAAAAAAAA',
          capabilityGrantId: '00000000-0000-4000-8000-0000000000d1',
          capabilityState: 'ACTIVE',
          lifecycle: 'ACTIVE',
          manifestVersion: 1,
          purpose: 'sales-intake',
          supportedProfiles: ['CSV'],
        }}
      />,
    );

    const confirm = screen.getByRole('button', {
      name: 'Sync only after the user confirms this projection',
    });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);
    expect(
      screen.getByText(
        'Hybrid projection confirmed locally; sync still requires DSO capability and API.',
      ),
    ).toBeTruthy();
  });

  it('keeps Vietnamese as the default folder surface locale copy', () => {
    render(
      <FolderBindingPage
        locale="vi-VN"
        capabilityGrantId="00000000-0000-4000-8000-0000000000d1"
        organizationId="00000000-0000-4000-8000-000000000001"
        workspaceId="00000000-0000-4000-8000-000000000002"
        reviewQueue={[]}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Thư mục dữ liệu được phê duyệt' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Hàng đợi xem xét thư mục' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Xem trước chiếu Hybrid' })).toBeTruthy();
  });

  it('loads quarantine review queue from guarded folder IPC when not prop-injected', async () => {
    const listReviewQueue = vi.fn(() =>
      Promise.resolve([
        {
          eventId: 'evt_dddddddddddddddddddddddd',
          bindingId: '01HHHHHHHHHHHHHHHHHHHHHHHH',
          reason: 'SCHEMA_DRIFT' as const,
          profileHint: 'CSV',
          observedAtMs: 9,
        },
      ]),
    );
    Object.defineProperty(window, 'databreezeDesktop', {
      configurable: true,
      value: {
        v1: {
          session: { getSafeState: vi.fn() },
          sidecar: { getStatus: vi.fn() },
          folders: {
            select: vi.fn(),
            create: vi.fn(),
            readStatus: vi.fn(),
            updateManifest: vi.fn(),
            disable: vi.fn(),
            listReviewQueue,
          },
        },
      },
    });

    render(
      <FolderBindingPage
        locale="en"
        capabilityGrantId="01CCCCCCCCCCCCCCCCCCCCCCCC"
        organizationId="01AAAAAAAAAAAAAAAAAAAAAAAA"
        workspaceId="01BBBBBBBBBBBBBBBBBBBBBBBB"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/SCHEMA_DRIFT/)).toBeTruthy();
    });
    expect(listReviewQueue).toHaveBeenCalledOnce();
  });
});

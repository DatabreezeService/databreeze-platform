import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FolderBindingPage } from '../src/renderer/features/folders/folder-binding-page.tsx';

describe('folder binding composed surface [DDA-037]', () => {
  it('shows hybrid defaults, quarantine queue, and projection review without inventing sync', () => {
    render(
      <FolderBindingPage
        locale="en"
        capabilityGrantId="00000000-0000-4000-8000-0000000000d1"
        organizationId="00000000-0000-4000-8000-000000000001"
        workspaceId="00000000-0000-4000-8000-000000000002"
        reviewQueue={[
          {
            eventId: '00000000-0000-4000-8000-0000000000e1',
            bindingId: '00000000-0000-4000-8000-0000000000b1',
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

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Sync only after the user confirms this projection',
      }),
    );
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
      />,
    );
    expect(screen.getByRole('heading', { name: 'Thư mục dữ liệu được phê duyệt' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Hàng đợi xem xét thư mục' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Xem trước chiếu Hybrid' })).toBeTruthy();
  });
});

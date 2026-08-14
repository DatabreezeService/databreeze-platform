import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UploadPanel } from '../src/features/data-intake/upload-panel.tsx';

describe('[DDA-002] upload panel', () => {
  it('shows Vietnamese progress retry and cancel without source values', async () => {
    const user = userEvent.setup();
    const finalize = vi.fn().mockResolvedValue({
      accepted: true,
      sessionId: '00000000-0000-4000-8000-000000000112',
      artifactVersionId: '00000000-0000-4000-8000-000000000012',
      status: 'FINALIZED',
      profileId: 'dda.web.tabular.v1',
    });
    render(
      <UploadPanel
        locale="vi"
        api={{ finalize }}
        sessionId="00000000-0000-4000-8000-000000000112"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Tải tệp CSV/XLSX' })).toBeTruthy();
    const file = new File(['name,amount\nCafe,120000\n'], 'sales.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('Chọn tệp'), file);
    await user.click(screen.getByRole('button', { name: 'Tải lên' }));
    await waitFor(() => expect(finalize).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Đã gửi tệp vào Inbox/u)).toBeTruthy();
    expect(screen.queryByText(/Cafe|120000/u)).toBeNull();
  });

  it('offers English fallback and safe retry on failure', async () => {
    const user = userEvent.setup();
    const finalize = vi.fn().mockRejectedValue(new Error('provider detail'));
    render(
      <UploadPanel
        locale="en"
        api={{ finalize }}
        sessionId="00000000-0000-4000-8000-000000000112"
      />,
    );
    const file = new File(['a,b\n1,2\n'], 'sales.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('Choose file'), file);
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(
      await screen.findByText('The file could not upload. No changes were sent.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry safely' })).toBeTruthy();
    expect(screen.queryByText(/provider detail/u)).toBeNull();
  });
});

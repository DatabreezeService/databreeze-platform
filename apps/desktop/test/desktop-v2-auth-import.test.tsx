import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopAuthScreen } from '../src/renderer/workbench/desktop-auth-screen.tsx';
import { SourceImportDialog } from '../src/renderer/workbench/source-import-dialog.tsx';
import { ExtractionReviewTab } from '../src/renderer/workbench/extraction-review-tab.tsx';
import { AnalysisWorkbench } from '../src/renderer/workbench/analysis-workbench.tsx';
import {
  createEmptyDesktopSession,
  restoreDesktopSessionSnapshot,
} from '../src/renderer/workbench/desktop-session.ts';

describe('Desktop V2 auth, import, review, and session restoration', () => {
  it(
    'supports email/password, OTP, recovery, and Google OIDC entry points in Vietnamese',
    { timeout: 10_000 },
    async () => {
      const user = userEvent.setup();
      const onPasswordSignIn = vi.fn();
      const onVerifyOtp = vi.fn();
      const onRecover = vi.fn();
      const onGoogle = vi.fn();
      render(
        <DesktopAuthScreen
          locale="vi-VN"
          onPasswordSignIn={onPasswordSignIn}
          onVerifyOtp={onVerifyOtp}
          onRecover={onRecover}
          onGoogleOidc={onGoogle}
        />,
      );

      expect(screen.getByRole('heading', { name: 'Đăng nhập Desktop' })).toBeTruthy();
      await user.type(screen.getByLabelText('Email'), 'operator@example.com');
      await user.type(screen.getByLabelText('Mật khẩu'), 'not-a-real-secret');
      await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
      expect(onPasswordSignIn).toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Xác minh OTP' }));
      expect(onVerifyOtp).toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Khôi phục mật khẩu' }));
      expect(onRecover).toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Tiếp tục với Google' }));
      expect(onGoogle).toHaveBeenCalled();
    },
  );

  it('accepts only published CSV, XLSX, image, and PDF import profiles', async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    render(<SourceImportDialog locale="en" open onClose={() => undefined} onImport={onImport} />);

    expect(screen.getByRole('dialog', { name: 'Import source' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'CSV' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'XLSX' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Image' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'PDF' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: /exe|zip|json/iu })).toBeNull();

    await user.click(screen.getByRole('radio', { name: 'PDF' }));
    await user.click(screen.getByRole('button', { name: 'Continue import' }));
    expect(onImport).toHaveBeenCalledWith({ profile: 'PDF' });
  });

  it('shows extraction review beside the preserved original descriptor', () => {
    render(
      <ExtractionReviewTab
        locale="vi-VN"
        original={{
          descriptorId: '01ORIG0000000000000000001',
          label: 'Hoa don goc',
          mediaKind: 'IMAGE',
        }}
        candidate={{
          fields: [{ key: 'total', value: '125000', confidence: 0.42 }],
        }}
      />,
    );

    expect(screen.getByRole('region', { name: 'Xem lại trích xuất' })).toBeTruthy();
    expect(screen.getByText('Hoa don goc')).toBeTruthy();
    expect(screen.getByText('total')).toBeTruthy();
    expect(screen.getByText('125000')).toBeTruthy();
    expect(screen.getByText(/0\.42|42%/u)).toBeTruthy();
  });

  it('restores protected session snapshots and keeps offline last-good content', () => {
    expect(createEmptyDesktopSession()).toEqual({
      signedIn: false,
      accountLabel: null,
      workspaceLabel: null,
    });
    expect(
      restoreDesktopSessionSnapshot({
        signedIn: true,
        accountLabel: 'operator@example.com',
        workspaceLabel: 'Personal',
      }),
    ).toEqual({
      signedIn: true,
      accountLabel: 'operator@example.com',
      workspaceLabel: 'Personal',
    });

    render(
      <AnalysisWorkbench
        activity="data"
        locale="en"
        offline
        lastGoodLabel="Last good catalog from yesterday"
        session={{
          signedIn: true,
          accountLabel: 'operator@example.com',
          workspaceLabel: 'Personal',
        }}
        status={{
          folderMonitoring: 'paused',
          syncQueue: 0,
          engineHealth: 'ready',
          pendingReviewCount: 1,
        }}
        catalog={{
          folders: [],
          datasets: [
            { datasetId: '01DATASET00000000000000001', displayName: 'Cached', health: 'READY' },
          ],
          reviewItems: [],
          recentAnalyses: [],
        }}
      />,
    );

    expect(screen.getByText('Last good catalog from yesterday')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cached' })).toBeTruthy();
  });

  it('keeps usable layout markers for 200 percent scaling and high contrast', () => {
    const { container } = render(
      <AnalysisWorkbench
        activity="settings"
        locale="en"
        offline={false}
        highContrast
        scalePercent={200}
        session={{
          signedIn: true,
          accountLabel: 'operator@example.com',
          workspaceLabel: 'Personal',
        }}
        status={{
          folderMonitoring: 'watching',
          syncQueue: 0,
          engineHealth: 'ready',
          pendingReviewCount: 0,
        }}
        catalog={{
          folders: [],
          datasets: [],
          reviewItems: [],
          recentAnalyses: [],
        }}
      />,
    );

    const root = container.querySelector('.analysis-workbench');
    expect(root?.getAttribute('data-scale')).toBe('200');
    expect(root?.classList.contains('analysis-workbench--high-contrast')).toBe(true);
  });
});

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DownloadsPage } from '../src/features/downloads/downloads-page.tsx';
import type { DownloadReleaseManifestV1 } from '../src/features/downloads/downloads-release-manifest.ts';

describe('public downloads surface [WEB-002, WEB-003, DSK-208, DSK-271]', () => {
  it('renders complete Vietnamese release guidance without inventing an installer URL', () => {
    render(<DownloadsPage locale="vi-VN" />);

    expect(
      screen.getByRole('heading', { name: 'DataBreeze, trên đúng thiết bị của bạn.' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Bản phát hành, có dấu vết rõ ràng.' }),
    ).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Desktop/u }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Đang chuẩn bị bản phát hành' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.queryByRole('link', { name: 'Tải bản cài đặt' })).toBeNull();
    expect(
      within(screen.getByRole('navigation'))
        .getByRole('link', { name: 'Đăng nhập' })
        .getAttribute('href'),
    ).toBe('/vi-VN/sign-in');
  });

  it('changes the release panel when Android is selected', async () => {
    const user = userEvent.setup();
    render(<DownloadsPage locale="en" />);

    await user.click(screen.getByRole('tab', { name: /Android/u }));

    expect(screen.getByRole('tab', { name: /Android/u }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('heading', { name: 'DataBreeze for Android' })).toBeTruthy();
    expect(screen.getByText('Google Play')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Release preparing' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('renders an artifact action only when the manifest marks the release available', () => {
    const manifest: DownloadReleaseManifestV1 = {
      schemaVersion: 1,
      generatedAt: '2026-08-16T00:00:00.000Z',
      channel: 'stable',
      artifacts: [
        {
          platform: 'windows',
          distribution: 'direct',
          availability: 'available',
          version: '1.0.0',
          releasedAt: '2026-08-16T00:00:00.000Z',
          sizeLabel: '84 MB',
          downloadUrl: 'https://downloads.example.test/desktop/1.0.0/DataBreeze-Setup.exe',
          checksumUrl: 'https://downloads.example.test/desktop/1.0.0/SHA256SUMS',
          signatureUrl: 'https://downloads.example.test/desktop/1.0.0/signature.sig',
        },
        { platform: 'android', distribution: 'google-play', availability: 'preparing' },
      ],
    };

    render(<DownloadsPage locale="en" manifest={manifest} />);

    expect(screen.getByRole('link', { name: 'Download installer' }).getAttribute('href')).toBe(
      'https://downloads.example.test/desktop/1.0.0/DataBreeze-Setup.exe',
    );
    expect(screen.getByText('1.0.0')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'SHA-256' }).getAttribute('href')).toBe(
      'https://downloads.example.test/desktop/1.0.0/SHA256SUMS',
    );
    expect(screen.getByRole('link', { name: 'Verified' }).getAttribute('href')).toBe(
      'https://downloads.example.test/desktop/1.0.0/signature.sig',
    );
  });
});

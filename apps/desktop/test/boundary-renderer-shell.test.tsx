import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DesktopApp } from '../src/renderer/app.tsx';

const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function installBridge() {
  Object.defineProperty(window, 'databreezeDesktop', {
    configurable: true,
    value: {
      v1: {
        session: {
          getSafeState: () =>
            Promise.resolve({
              applicationVersion: '0.0.0',
              dataMode: 'LOCAL',
              deviceState: 'locked',
              enrollmentState: 'not-enrolled',
              locale: 'vi-VN',
            }),
        },
        sidecar: {
          getStatus: () =>
            Promise.resolve({
              engineVersion: null,
              lifecycle: 'not-installed',
              protocolVersion: null,
            }),
        },
      },
    },
  });
}

describe('renderer trust boundary and honest bilingual shell', () => {
  it('imports no Electron, Node built-in, main, or preload implementation module', () => {
    const rendererDirectory = path.join(desktopDirectory, 'src', 'renderer');
    const source = readdirSync(rendererDirectory)
      .filter((file) => /\.(?:ts|tsx)$/.test(file))
      .map((file) => readFileSync(path.join(rendererDirectory, file), 'utf8'))
      .join('\n');
    const imports = [...source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)].map(
      (match) => match[1],
    );

    expect(imports).not.toContain('electron');
    expect(imports.some((specifier) => specifier?.startsWith('node:'))).toBe(false);
    expect(imports.some((specifier) => specifier?.includes('/main/'))).toBe(false);
    expect(imports.some((specifier) => specifier?.includes('/preload/'))).toBe(false);
  });

  it('ships an actual restrictive CSP on renderer HTML', () => {
    const html = readFileSync(path.join(desktopDirectory, 'index.html'), 'utf8');
    const policy = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];

    expect(policy).toBeDefined();
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("form-action 'none'");
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|https?:/);
  });

  it('renders bounded Vietnamese defaults and complete equivalent English copy', async () => {
    installBridge();
    render(<DesktopApp />);

    expect(screen.getByRole('img', { name: 'DataBreeze' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tác nhân cục bộ đang khóa' })).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('Chưa đăng ký thiết bị')).toBeTruthy();
      expect(screen.getByText('Engine chưa được cài trong phần nền tảng này')).toBeTruthy();
    });
    expect(
      screen.getByText('Không có đường dẫn hoặc nội dung tệp nào được gửi tới giao diện này.'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('heading', { name: 'Local agent is locked' })).toBeTruthy();
    expect(screen.getByText('Device is not enrolled')).toBeTruthy();
    expect(screen.getByText('The engine is not installed in this foundation slice')).toBeTruthy();
    expect(
      screen.getByText('No file path or file content is sent to this interface.'),
    ).toBeTruthy();
  });

  it('keeps the honest locked shell usable when the bridge is unavailable in browser QA', () => {
    render(<DesktopApp />);

    expect(screen.getByRole('heading', { name: 'Tác nhân cục bộ đang khóa' })).toBeTruthy();
    expect(screen.getByText('Chưa đăng ký thiết bị')).toBeTruthy();
  });
});

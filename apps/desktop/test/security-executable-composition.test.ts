import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { LockedLocalStateAdapter } from '../src/main/adapters/locked-local-state.adapter.ts';
import { UnavailableSidecarAdapter } from '../src/main/adapters/unavailable-sidecar.adapter.ts';
import { createDesktopWindow } from '../src/main/desktop-window.ts';

describe('actual Desktop executable composition', () => {
  it('installs the tested policy before loading the exact renderer file', async () => {
    const sequence: string[] = [];
    const listeners = new Map<string, unknown>();
    const webContents = {
      mainFrame: { url: '' },
      on: vi.fn((name: string, listener: unknown) => {
        sequence.push(`policy:${name}`);
        listeners.set(name, listener);
      }),
      setWindowOpenHandler: vi.fn(() => sequence.push('policy:window-open')),
    };
    const show = vi.fn();
    const loadFile = vi.fn((rendererFilePath: string) => {
      sequence.push('load');
      webContents.mainFrame.url = pathToFileURL(rendererFilePath).href;
      return Promise.resolve();
    });
    class FakeBrowserWindow {
      static options: import('../src/main/window-policy.ts').SecureWindowOptions | undefined;
      readonly webContents = webContents;
      readonly loadFile = loadFile;
      readonly show = show;
      constructor(options: import('../src/main/window-policy.ts').SecureWindowOptions) {
        FakeBrowserWindow.options = options;
      }
      isDestroyed() {
        return false;
      }
      once(_event: string, handler: () => void) {
        handler();
      }
    }
    const electronSession = {
      setPermissionCheckHandler: vi.fn(() => sequence.push('policy:permission-check')),
      setPermissionRequestHandler: vi.fn(() => sequence.push('policy:permission-request')),
    };
    const rendererFilePath = 'C:\\trusted\\renderer\\index.html';

    const result = await createDesktopWindow({
      BrowserWindow: FakeBrowserWindow,
      beforeLoad: () => sequence.push('ipc'),
      electronSession,
      iconPath: 'C:\\trusted\\application.ico',
      preloadPath: 'C:\\trusted\\preload.cjs',
      rendererFilePath,
    });

    expect(result.expectedRendererUrl).toBe(pathToFileURL(rendererFilePath).href);
    expect(result.window.webContents).toBe(webContents);
    expect(FakeBrowserWindow.options?.webPreferences).toEqual({
      allowRunningInsecureContent: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: 'C:\\trusted\\preload.cjs',
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    });
    expect(sequence.slice(-2)).toEqual(['ipc', 'load']);
    expect(sequence.filter((item) => item.startsWith('policy:')).length).toBeGreaterThanOrEqual(6);
    expect(loadFile).toHaveBeenCalledWith(rendererFilePath);
    expect(show).toHaveBeenCalledOnce();
  });

  it('uses honest content-free reference adapters', async () => {
    const localState = new LockedLocalStateAdapter({
      applicationVersion: '0.0.0',
      locale: 'vi-VN',
    });
    const sidecar = new UnavailableSidecarAdapter();

    await expect(localState.getSafeState()).resolves.toEqual({
      applicationVersion: '0.0.0',
      dataMode: 'LOCAL',
      deviceState: 'locked',
      enrollmentState: 'not-enrolled',
      locale: 'vi-VN',
    });
    await expect(sidecar.getStatus()).resolves.toEqual({
      engineVersion: null,
      lifecycle: 'not-installed',
      protocolVersion: null,
    });
  });
});

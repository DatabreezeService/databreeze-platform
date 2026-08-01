import { describe, expect, it, vi } from 'vitest';
import { installNavigationPolicy } from '../src/main/navigation-policy.ts';
import { createSecureWindowOptions } from '../src/main/window-policy.ts';

type EventHandler = (event: { preventDefault: () => void }, url?: string) => void;

function createNavigationFakes() {
  const listeners = new Map<string, EventHandler>();
  let windowOpenHandler: (() => { action: string }) | undefined;
  const webContents = {
    on: vi.fn((event: string, handler: EventHandler) => listeners.set(event, handler)),
    setWindowOpenHandler: vi.fn((handler: () => { action: string }) => {
      windowOpenHandler = handler;
    }),
  };
  const permissionRequest = vi.fn();
  const permissionCheck = vi.fn();
  const electronSession = {
    setPermissionCheckHandler: vi.fn((handler: typeof permissionCheck) => {
      permissionCheck.mockImplementation(handler);
    }),
    setPermissionRequestHandler: vi.fn((handler: typeof permissionRequest) => {
      permissionRequest.mockImplementation(handler);
    }),
  };

  return {
    electronSession,
    listeners,
    permissionCheck,
    permissionRequest,
    webContents,
    windowOpenHandler: () => windowOpenHandler,
  };
}

describe('DSK-001 BrowserWindow and navigation policy', () => {
  it('creates the actual secure web preferences with an application-owned preload', () => {
    const options = createSecureWindowOptions({
      iconPath: 'C:\\trusted\\application.ico',
      preloadPath: 'C:\\trusted\\preload.cjs',
    });

    expect(options.icon).toBe('C:\\trusted\\application.ico');
    expect(options.webPreferences).toEqual({
      allowRunningInsecureContent: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: 'C:\\trusted\\preload.cjs',
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    });
  });

  it('denies new windows, foreign navigation, redirects, webviews, and permissions', () => {
    const fakes = createNavigationFakes();
    installNavigationPolicy({
      electronSession: fakes.electronSession,
      expectedRendererUrl: 'file:///trusted/index.html',
      webContents: fakes.webContents,
    });

    expect(fakes.windowOpenHandler()?.()).toEqual({ action: 'deny' });

    for (const eventName of ['will-navigate', 'will-redirect']) {
      const preventForeign = vi.fn();
      fakes.listeners.get(eventName)?.({ preventDefault: preventForeign }, 'https://attacker.test');
      expect(preventForeign).toHaveBeenCalledOnce();

      const preventInternal = vi.fn();
      fakes.listeners.get(eventName)?.(
        { preventDefault: preventInternal },
        'file:///trusted/index.html',
      );
      expect(preventInternal).not.toHaveBeenCalled();
    }

    const preventWebview = vi.fn();
    fakes.listeners.get('will-attach-webview')?.({ preventDefault: preventWebview });
    expect(preventWebview).toHaveBeenCalledOnce();
    expect(fakes.permissionCheck()).toBe(false);
    const permissionCallback = vi.fn();
    fakes.permissionRequest({}, 'camera', permissionCallback, {});
    expect(permissionCallback).toHaveBeenCalledWith(false);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { registerDesktopIpcV1 } from '../src/main/ipc-registry.ts';
import { DESKTOP_IPC_CHANNELS } from '../src/shared/desktop-contract-v1.ts';

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>;

class FakeIpcMain {
  readonly handlers = new Map<string, Handler>();

  handle(channel: string, handler: Handler) {
    if (this.handlers.has(channel)) throw new Error('duplicate handler');
    this.handlers.set(channel, handler);
  }

  removeHandler(channel: string) {
    this.handlers.delete(channel);
  }

  invoke(channel: string, event: unknown, ...args: unknown[]) {
    const handler = this.handlers.get(channel);
    if (handler === undefined) return Promise.reject(new Error('NO_HANDLER'));
    return handler(event, ...args);
  }
}

function authorizedContext() {
  const frame = { url: 'file:///trusted/index.html' };
  const webContents = { mainFrame: frame };
  const activeWindow = { isDestroyed: () => false, webContents };
  const event = { sender: webContents, senderFrame: frame };
  return { activeWindow, event };
}

function register(overrides: Record<string, unknown> = {}) {
  const ipcMain = new FakeIpcMain();
  const context = authorizedContext();
  const localState = {
    getSafeState: vi.fn<() => Promise<unknown>>(() =>
      Promise.resolve({
        applicationVersion: '0.0.0',
        dataMode: 'LOCAL',
        deviceState: 'locked',
        enrollmentState: 'not-enrolled',
        locale: 'vi-VN',
      }),
    ),
  };
  const sidecar = {
    getStatus: vi.fn<() => Promise<unknown>>(() =>
      Promise.resolve({
        engineVersion: null,
        lifecycle: 'not-installed',
        protocolVersion: null,
      }),
    ),
  };
  const folderGrant = {
    grantFolder: vi.fn<() => Promise<unknown>>(() =>
      Promise.resolve({ fileCount: 2, lastScanAt: '2026-08-04T00:00:00.000Z', status: 'granted' }),
    ),
  };
  const dispose = registerDesktopIpcV1({
    expectedRendererUrl: 'file:///trusted/index.html',
    getActiveWindow: () => context.activeWindow,
    ipcMain,
    folderGrant,
    localState,
    sidecar,
    ...overrides,
  });
  return { ...context, dispose, folderGrant, ipcMain, localState, sidecar };
}

describe('DSK-002 guarded IPC registry', () => {
  it('returns only schema-valid safe state from the two fixed channels', async () => {
    const harness = register();

    await expect(
      harness.ipcMain.invoke(DESKTOP_IPC_CHANNELS.sessionGetSafeState, harness.event),
    ).resolves.toEqual({
      applicationVersion: '0.0.0',
      dataMode: 'LOCAL',
      deviceState: 'locked',
      enrollmentState: 'not-enrolled',
      locale: 'vi-VN',
    });
    await expect(
      harness.ipcMain.invoke(DESKTOP_IPC_CHANNELS.sidecarGetStatus, harness.event),
    ).resolves.toEqual({
      engineVersion: null,
      lifecycle: 'not-installed',
      protocolVersion: null,
    });
    await expect(
      harness.ipcMain.invoke(DESKTOP_IPC_CHANNELS.folderGrant, harness.event),
    ).resolves.toEqual({
      fileCount: 2,
      lastScanAt: '2026-08-04T00:00:00.000Z',
      status: 'granted',
    });
  });

  it('fails closed for unknown channels and any malformed or oversized arguments', async () => {
    const harness = register();
    await expect(harness.ipcMain.invoke('desktop:v1:unknown', harness.event)).rejects.toThrow(
      'NO_HANDLER',
    );

    const accessor = {};
    Object.defineProperty(accessor, 'secret', {
      enumerable: true,
      get: () => {
        throw new Error('must not inspect hostile accessor');
      },
    });
    for (const input of [{ unknown: true }, accessor, 'x'.repeat(70_000)]) {
      await expect(
        harness.ipcMain.invoke(DESKTOP_IPC_CHANNELS.sessionGetSafeState, harness.event, input),
      ).rejects.toThrow('DESKTOP_REQUEST_REJECTED');
    }
  });

  it('rejects wrong frames, origins, senders, replaced windows, and closed windows', async () => {
    const harness = register();
    const channel = DESKTOP_IPC_CHANNELS.sessionGetSafeState;
    const hostileFrame = { url: 'https://attacker.test' };

    for (const event of [
      { sender: harness.activeWindow.webContents, senderFrame: hostileFrame },
      { sender: {}, senderFrame: harness.activeWindow.webContents.mainFrame },
      { sender: harness.activeWindow.webContents, senderFrame: { url: 'file:///other.html' } },
      { sender: harness.activeWindow.webContents, senderFrame: undefined },
    ]) {
      await expect(harness.ipcMain.invoke(channel, event)).rejects.toThrow('DESKTOP_ACCESS_DENIED');
    }

    const replacement = { isDestroyed: () => false, webContents: { mainFrame: hostileFrame } };
    const replaced = register({ getActiveWindow: () => replacement });
    await expect(replaced.ipcMain.invoke(channel, replaced.event)).rejects.toThrow(
      'DESKTOP_ACCESS_DENIED',
    );

    const closed = register({
      getActiveWindow: () => ({
        isDestroyed: () => true,
        webContents: harness.activeWindow.webContents,
      }),
    });
    await expect(closed.ipcMain.invoke(channel, closed.event)).rejects.toThrow(
      'DESKTOP_ACCESS_DENIED',
    );
  });

  it('rejects unknown, accessor, prototype, and oversized results without reading secrets', async () => {
    const harness = register();
    const channel = DESKTOP_IPC_CHANNELS.sessionGetSafeState;
    const getter = vi.fn(() => 'secret');
    const accessorResult = {
      applicationVersion: '0.0.0',
      dataMode: 'LOCAL',
      deviceState: 'locked',
      enrollmentState: 'not-enrolled',
      locale: 'vi-VN',
    };
    Object.defineProperty(accessorResult, 'applicationVersion', { enumerable: true, get: getter });

    for (const result of [
      { applicationVersion: '0.0.0', extra: true },
      Object.assign(Object.create({ inherited: true }), {
        applicationVersion: '0.0.0',
        dataMode: 'LOCAL',
        deviceState: 'locked',
        enrollmentState: 'not-enrolled',
        locale: 'vi-VN',
      }),
      accessorResult,
      {
        applicationVersion: 'x'.repeat(70_000),
        dataMode: 'LOCAL',
        deviceState: 'locked',
        enrollmentState: 'not-enrolled',
        locale: 'vi-VN',
      },
    ]) {
      harness.localState.getSafeState.mockResolvedValueOnce(result);
      await expect(harness.ipcMain.invoke(channel, harness.event)).rejects.toThrow(
        'DESKTOP_RESULT_REJECTED',
      );
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it('maps unexpected handler failures to one safe error without reflecting details', async () => {
    const harness = register();
    harness.localState.getSafeState.mockRejectedValueOnce(
      new Error('secret path C:\\customers\\payroll.xlsx'),
    );

    await expect(
      harness.ipcMain.invoke(DESKTOP_IPC_CHANNELS.sessionGetSafeState, harness.event),
    ).rejects.toThrow(/^DESKTOP_INTERNAL_ERROR$/);
  });

  it('replaces duplicate registrations and makes stale cleanup harmless', async () => {
    const ipcMain = new FakeIpcMain();
    const context = authorizedContext();
    const options = {
      expectedRendererUrl: 'file:///trusted/index.html',
      getActiveWindow: () => context.activeWindow,
      ipcMain,
      sidecar: {
        getStatus: () =>
          Promise.resolve({
            engineVersion: null,
            lifecycle: 'not-installed',
            protocolVersion: null,
          }),
      },
    };
    const first = registerDesktopIpcV1({
      ...options,
      localState: {
        getSafeState: () =>
          Promise.resolve({
            applicationVersion: '1.0.0',
            dataMode: 'LOCAL',
            deviceState: 'locked',
            enrollmentState: 'not-enrolled',
            locale: 'vi-VN',
          }),
      },
    });
    const second = registerDesktopIpcV1({
      ...options,
      localState: {
        getSafeState: () =>
          Promise.resolve({
            applicationVersion: '2.0.0',
            dataMode: 'LOCAL',
            deviceState: 'locked',
            enrollmentState: 'not-enrolled',
            locale: 'vi-VN',
          }),
      },
    });

    first();
    await expect(
      ipcMain.invoke(DESKTOP_IPC_CHANNELS.sessionGetSafeState, context.event),
    ).resolves.toMatchObject({ applicationVersion: '2.0.0' });
    second();
    await expect(
      ipcMain.invoke(DESKTOP_IPC_CHANNELS.sessionGetSafeState, context.event),
    ).rejects.toThrow('NO_HANDLER');
  });
});

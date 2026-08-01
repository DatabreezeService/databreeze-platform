import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DESKTOP_BRIDGE_GLOBAL,
  DESKTOP_IPC_CHANNELS,
  type DesktopBridgeV1,
} from '../src/shared/desktop-contract-v1.ts';

const electron = vi.hoisted(() => ({ expose: vi.fn(), invoke: vi.fn() }));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.expose },
  ipcRenderer: { invoke: electron.invoke },
}));

describe('actual preload entry', () => {
  beforeEach(() => {
    vi.resetModules();
    electron.expose.mockClear();
    electron.invoke.mockReset();
  });

  it('exposes exactly one namespaced frozen global wired only to fixed channels', async () => {
    electron.invoke.mockResolvedValue({
      applicationVersion: '0.0.0',
      dataMode: 'LOCAL',
      deviceState: 'locked',
      enrollmentState: 'not-enrolled',
      locale: 'vi-VN',
    });

    await import('../src/preload/index.ts');

    expect(electron.expose).toHaveBeenCalledOnce();
    expect(electron.expose.mock.calls[0]?.[0]).toBe(DESKTOP_BRIDGE_GLOBAL);
    const exposure = electron.expose.mock.calls[0] as unknown as
      | [string, DesktopBridgeV1]
      | undefined;
    const bridge = exposure?.[1];
    expect(Object.isFrozen(bridge)).toBe(true);
    await bridge?.v1.session.getSafeState();
    expect(electron.invoke).toHaveBeenCalledWith(DESKTOP_IPC_CHANNELS.sessionGetSafeState);
  });
});

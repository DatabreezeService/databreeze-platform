import { describe, expect, it, vi } from 'vitest';
import { createDesktopBridgeV1 } from '../src/preload/bridge-v1.ts';
import { DESKTOP_IPC_CHANNELS } from '../src/shared/desktop-contract-v1.ts';

describe('DSK-002 preload bridge', () => {
  it('exposes one deeply frozen versioned capability surface with no generic primitive', async () => {
    const invoke = vi.fn((channel: string) =>
      Promise.resolve(
        channel === DESKTOP_IPC_CHANNELS.sessionGetSafeState
          ? {
              applicationVersion: '0.0.0',
              dataMode: 'LOCAL',
              deviceState: 'locked',
              enrollmentState: 'not-enrolled',
              locale: 'vi-VN',
            }
          : { engineVersion: null, lifecycle: 'not-installed', protocolVersion: null },
      ),
    );
    const bridge = createDesktopBridgeV1(invoke);

    expect(Object.keys(bridge)).toEqual(['v1']);
    expect(Object.keys(bridge.v1).sort()).toEqual(['folders', 'session', 'sidecar']);
    expect(Object.keys(bridge.v1.session)).toEqual(['getSafeState']);
    expect(Object.keys(bridge.v1.sidecar)).toEqual(['getStatus']);
    expect(Object.keys(bridge.v1.folders).sort()).toEqual([
      'create',
      'disable',
      'listReviewQueue',
      'readStatus',
      'select',
      'updateManifest',
    ]);
    expect(Object.isFrozen(bridge)).toBe(true);
    expect(Object.isFrozen(bridge.v1)).toBe(true);
    expect(Object.isFrozen(bridge.v1.session)).toBe(true);
    expect(Object.isFrozen(bridge.v1.folders)).toBe(true);
    expect(bridge).not.toHaveProperty('invoke');
    expect(bridge).not.toHaveProperty('send');
    expect(bridge).not.toHaveProperty('filesystem');
    expect(bridge).not.toHaveProperty('process');
    expect(bridge).not.toHaveProperty('shell');

    await expect(bridge.v1.session.getSafeState()).resolves.toMatchObject({
      enrollmentState: 'not-enrolled',
    });
    await expect(bridge.v1.sidecar.getStatus()).resolves.toMatchObject({
      lifecycle: 'not-installed',
    });
    expect(invoke.mock.calls).toEqual([
      [DESKTOP_IPC_CHANNELS.sessionGetSafeState],
      [DESKTOP_IPC_CHANNELS.sidecarGetStatus],
    ]);
  });

  it('rejects every unexpected capability argument before invoking IPC', async () => {
    const invoke = vi.fn(() => Promise.reject(new Error('IPC must not be reached')));
    const bridge = createDesktopBridgeV1(invoke);
    const hostileAccessor = {};
    const getter = vi.fn(() => 'secret');
    Object.defineProperty(hostileAccessor, 'secret', { enumerable: true, get: getter });
    const hostilePrototype = Object.create({ inherited: true }) as Record<string, unknown>;
    hostilePrototype['value'] = 'unexpected';
    const unexpectedInputs = [
      undefined,
      null,
      { unknown: true },
      hostileAccessor,
      hostilePrototype,
      'x'.repeat(70_000),
    ];
    const noArgMethods = [
      bridge.v1.session.getSafeState as (...args: unknown[]) => Promise<unknown>,
      bridge.v1.sidecar.getStatus as (...args: unknown[]) => Promise<unknown>,
      bridge.v1.folders.select as (...args: unknown[]) => Promise<unknown>,
    ];

    for (const method of noArgMethods) {
      for (const input of unexpectedInputs) {
        await expect(method(input)).rejects.toThrow(/^DESKTOP_REQUEST_REJECTED$/);
      }
    }

    expect(invoke).not.toHaveBeenCalled();
    expect(getter).not.toHaveBeenCalled();
  });
});

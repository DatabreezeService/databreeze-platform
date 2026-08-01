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
    expect(Object.keys(bridge.v1)).toEqual(['session', 'sidecar']);
    expect(Object.keys(bridge.v1.session)).toEqual(['getSafeState']);
    expect(Object.keys(bridge.v1.sidecar)).toEqual(['getStatus']);
    expect(Object.isFrozen(bridge)).toBe(true);
    expect(Object.isFrozen(bridge.v1)).toBe(true);
    expect(Object.isFrozen(bridge.v1.session)).toBe(true);
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
});

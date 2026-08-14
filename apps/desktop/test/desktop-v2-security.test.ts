import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/require-await -- IPC fakes intentionally mirror async bridge methods. */

import { createDesktopBridgeV1 } from '../src/preload/bridge-v1.ts';
import {
  DESKTOP_IPC_CHANNELS,
  WORKBENCH_IPC_CHANNELS,
  parseWorkbenchCatalogPage,
  parseWorkbenchSessionSnapshot,
} from '../src/shared/desktop-contract-v1.ts';
import { registerDesktopIpcV1 } from '../src/main/ipc-registry.ts';

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>;

class FakeIpcMain {
  readonly handlers = new Map<string, Handler>();

  handle(channel: string, handler: Handler) {
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

describe('Desktop V2 workbench security boundary', () => {
  it('exposes only versioned workbench bridge capabilities without raw OS primitives', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === WORKBENCH_IPC_CHANNELS.sessionRead) {
        return {
          signedIn: true,
          accountLabel: 'operator@example.com',
          workspaceLabel: 'Personal',
        };
      }
      if (channel === WORKBENCH_IPC_CHANNELS.catalogPage) {
        return {
          folders: [],
          datasets: [],
          reviewItems: [],
          recentAnalyses: [],
        };
      }
      if (channel === DESKTOP_IPC_CHANNELS.sessionGetSafeState) {
        return {
          applicationVersion: '0.0.0',
          dataMode: 'LOCAL',
          deviceState: 'locked',
          enrollmentState: 'not-enrolled',
          locale: 'vi-VN',
        };
      }
      return { engineVersion: null, lifecycle: 'not-installed', protocolVersion: null };
    });
    const bridge = createDesktopBridgeV1(invoke);

    expect(Object.keys(bridge.v1).sort()).toEqual(['folders', 'session', 'sidecar', 'workbench']);
    expect(Object.keys(bridge.v1.workbench).sort()).toEqual([
      'decideFolderReview',
      'getSyncStatus',
      'importSource',
      'listCatalogPage',
      'readOriginalDescriptor',
      'readSession',
      'runAgentTurn',
      'signInWithPassword',
      'startGoogleOidc',
      'verifyOtp',
    ]);
    expect(bridge).not.toHaveProperty('filesystem');
    expect(bridge).not.toHaveProperty('keychain');
    expect(bridge).not.toHaveProperty('shell');
    expect(bridge).not.toHaveProperty('process');

    await expect(bridge.v1.workbench.readSession()).resolves.toEqual({
      signedIn: true,
      accountLabel: 'operator@example.com',
      workspaceLabel: 'Personal',
    });
  });

  it('rejects unknown IPC channels, oversized payloads, and wrong senders', async () => {
    const frame = { url: 'file:///trusted/index.html' };
    const webContents = { mainFrame: frame };
    const activeWindow = { isDestroyed: () => false, webContents };
    const ipcMain = new FakeIpcMain();
    registerDesktopIpcV1({
      expectedRendererUrl: 'file:///trusted/index.html',
      getActiveWindow: () => activeWindow,
      ipcMain,
      localState: {
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
      workbench: {
        readSession: () =>
          Promise.resolve({
            signedIn: false,
            accountLabel: null,
            workspaceLabel: null,
          }),
        listCatalogPage: () =>
          Promise.resolve({
            folders: [],
            datasets: [],
            reviewItems: [],
            recentAnalyses: [],
          }),
      },
    });

    await expect(
      ipcMain.invoke('desktop:v1:workbench:unknown', {
        sender: webContents,
        senderFrame: frame,
      }),
    ).rejects.toThrow(/NO_HANDLER/);

    await expect(
      ipcMain.invoke(WORKBENCH_IPC_CHANNELS.sessionRead, {
        sender: {},
        senderFrame: { url: 'https://evil.example' },
      }),
    ).rejects.toThrow(/DESKTOP_ACCESS_DENIED/);

    const bridge = createDesktopBridgeV1(async () => {
      throw new Error('must not invoke');
    });
    await expect(
      (bridge.v1.workbench.listCatalogPage as (...args: unknown[]) => Promise<unknown>)({
        cursor: 'x'.repeat(70_000),
      }),
    ).rejects.toThrow(/DESKTOP_REQUEST_REJECTED/);
  });

  it('validates workbench session and catalog schemas without raw paths', () => {
    expect(() =>
      parseWorkbenchSessionSnapshot({
        signedIn: true,
        accountLabel: 'a@b.co',
        workspaceLabel: 'WS',
        refreshToken: 'secret',
      }),
    ).toThrow();

    expect(() =>
      parseWorkbenchCatalogPage({
        folders: [
          {
            bindingId: '01FOLDER000000000000000001',
            displayName: 'Sales',
            pendingReviewCount: 1,
            absolutePath: 'C:\\Secrets',
          },
        ],
        datasets: [],
        reviewItems: [],
        recentAnalyses: [],
      }),
    ).toThrow();

    expect(
      parseWorkbenchSessionSnapshot({
        signedIn: true,
        accountLabel: 'a@b.co',
        workspaceLabel: 'WS',
      }),
    ).toEqual({
      signedIn: true,
      accountLabel: 'a@b.co',
      workspaceLabel: 'WS',
    });
  });
});

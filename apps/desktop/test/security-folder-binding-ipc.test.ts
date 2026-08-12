import { describe, expect, it, vi } from 'vitest';
import { createDesktopBridgeV1 } from '../src/preload/bridge-v1.ts';
import { DESKTOP_IPC_CHANNELS } from '../src/shared/desktop-contract-v1.ts';
import { FOLDER_IPC_CHANNELS } from '../src/shared/folder-binding-contract-v1.ts';

const CAPABILITY = '01CCCCCCCCCCCCCCCCCCCCCCCC';
const ORG = '01AAAAAAAAAAAAAAAAAAAAAAAA';
const WORKSPACE = '01BBBBBBBBBBBBBBBBBBBBBBBB';
const BINDING = '01HHHHHHHHHHHHHHHHHHHHHHHH';
const MAP = '01GGGGGGGGGGGGGGGGGGGGGGGG';

describe('DDA-012 security folder binding IPC surface', () => {
  it('exposes only select/create/read-status/update-manifest/disable/list-review-queue folder operations', async () => {
    const invoke = vi.fn((channel: string) => {
      if (channel === DESKTOP_IPC_CHANNELS.sessionGetSafeState) {
        return Promise.resolve({
          applicationVersion: '0.0.0',
          dataMode: 'HYBRID',
          deviceState: 'locked',
          enrollmentState: 'not-enrolled',
          locale: 'vi-VN',
        });
      }
      if (channel === DESKTOP_IPC_CHANNELS.sidecarGetStatus) {
        return Promise.resolve({
          engineVersion: null,
          lifecycle: 'not-installed',
          protocolVersion: null,
        });
      }
      if (channel === FOLDER_IPC_CHANNELS.select) {
        return Promise.resolve({ selectionToken: 'sel_opaque_1' });
      }
      if (
        channel === FOLDER_IPC_CHANNELS.create ||
        channel === FOLDER_IPC_CHANNELS.readStatus ||
        channel === FOLDER_IPC_CHANNELS.updateManifest ||
        channel === FOLDER_IPC_CHANNELS.disable
      ) {
        return Promise.resolve({
          bindingId: BINDING,
          capabilityGrantId: CAPABILITY,
          capabilityState: 'ACTIVE',
          lifecycle: 'ACTIVE',
          manifestVersion: 1,
          purpose: 'sales-intake',
          supportedProfiles: ['CSV'],
        });
      }
      if (channel === FOLDER_IPC_CHANNELS.listReviewQueue) {
        return Promise.resolve([
          {
            eventId: 'evt_bbbbbbbbbbbbbbbbbbbbbbbb',
            bindingId: BINDING,
            reason: 'PARTIAL_OR_LOCK_FILE',
            profileHint: 'CSV',
            observedAtMs: 7,
          },
        ]);
      }
      return Promise.reject(new Error(`unexpected channel ${channel}`));
    });

    const bridge = createDesktopBridgeV1(invoke);
    expect(Object.keys(bridge.v1).sort()).toEqual(['folders', 'session', 'sidecar', 'workbench']);
    expect(Object.keys(bridge.v1.folders).sort()).toEqual([
      'create',
      'disable',
      'listReviewQueue',
      'readStatus',
      'select',
      'updateManifest',
    ]);
    expect(bridge).not.toHaveProperty('filesystem');
    expect(bridge).not.toHaveProperty('shell');
    expect(bridge.v1.folders).not.toHaveProperty('openPath');
    expect(bridge.v1.folders).not.toHaveProperty('listDirectory');
    expect(bridge.v1.folders).not.toHaveProperty('readFile');
    expect(bridge.v1.workbench).not.toHaveProperty('filesystem');
    expect(bridge.v1.workbench).not.toHaveProperty('shell');

    await expect(bridge.v1.folders.select()).resolves.toEqual({ selectionToken: 'sel_opaque_1' });
    await expect(
      bridge.v1.folders.create({
        selectionToken: 'sel_opaque_1',
        capabilityGrantId: CAPABILITY,
        organizationId: ORG,
        workspaceId: WORKSPACE,
        displayName: 'Sales',
        manifest: {
          purpose: 'sales-intake',
          supportedProfiles: ['CSV'],
          schemaFingerprints: ['c'.repeat(64)],
          groupingRules: ['by-period'],
          versionBehavior: 'APPEND',
          periodOverlapPolicy: 'REJECT',
          duplicateKeyFields: ['id'],
          mappingPolicyId: MAP,
          stabilityDebounceMs: 1000,
          publicationProjection: {
            class: 'METADATA_ONLY',
            fieldAllowlist: [],
          },
        },
      }),
    ).resolves.toMatchObject({ bindingId: BINDING });
    await expect(bridge.v1.folders.listReviewQueue()).resolves.toEqual([
      {
        eventId: 'evt_bbbbbbbbbbbbbbbbbbbbbbbb',
        bindingId: BINDING,
        reason: 'PARTIAL_OR_LOCK_FILE',
        profileHint: 'CSV',
        observedAtMs: 7,
      },
    ]);

    expect(invoke.mock.calls.map((call) => call[0])).toEqual([
      FOLDER_IPC_CHANNELS.select,
      FOLDER_IPC_CHANNELS.create,
      FOLDER_IPC_CHANNELS.listReviewQueue,
    ]);
  });

  it('rejects path-bearing payloads and unknown folder operations before IPC', async () => {
    const invoke = vi.fn(() => Promise.reject(new Error('IPC must not be reached')));
    const bridge = createDesktopBridgeV1(invoke);

    await expect(
      (bridge.v1.folders.create as unknown as (value: unknown) => Promise<unknown>)({
        selectionToken: 'sel_1',
        capabilityGrantId: CAPABILITY,
        organizationId: ORG,
        workspaceId: WORKSPACE,
        displayName: 'Sales',
        canonicalPath: 'C:\\escape',
        manifest: {
          purpose: 'sales-intake',
          supportedProfiles: ['CSV'],
          schemaFingerprints: ['d'.repeat(64)],
          groupingRules: ['by-period'],
          versionBehavior: 'APPEND',
          periodOverlapPolicy: 'REJECT',
          duplicateKeyFields: ['id'],
          mappingPolicyId: MAP,
          stabilityDebounceMs: 1000,
          publicationProjection: { class: 'METADATA_ONLY', fieldAllowlist: [] },
        },
      }),
    ).rejects.toThrow(/^DESKTOP_REQUEST_REJECTED$/);

    expect(invoke).not.toHaveBeenCalled();
    expect(bridge.v1.folders).not.toHaveProperty('browse');
    expect(bridge.v1.folders).not.toHaveProperty('exec');
  });
});

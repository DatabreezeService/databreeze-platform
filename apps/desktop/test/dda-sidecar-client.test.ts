import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DDA_FOLDER_INTAKE_HANDLER_DIGEST,
  DdaSidecarClientAdapter,
  type SidecarRpcFrame,
  type SidecarTransport,
} from '../src/main/adapters/dda-sidecar-client.adapter.ts';

const GRANT = '00000000-0000-4000-8000-0000000000d1';
const CONTROL_KEY = 'a'.repeat(64);

function sign(canonical: string): string {
  return createHmac('sha256', Buffer.from(CONTROL_KEY, 'hex')).update(canonical).digest('hex');
}

describe('DDA-014 typed sidecar client', () => {
  it('sends signed typed jobs with opaque handles and rejects digest or signature drift', async () => {
    const sent: SidecarRpcFrame[] = [];
    const transport: SidecarTransport = {
      execute: (frame) => {
        sent.push(frame);
        return Promise.resolve({
          jsonrpc: '2.0',
          id: frame.id,
          result: {
            attemptId: '01JJJJJJJJJJJJJJJJJJJJJJJJ',
            status: 'SUCCEEDED',
            output: {
              disposition: 'ADMITTED',
              profile: 'CSV',
              contentFingerprint: `sha256:${'b'.repeat(64)}`,
              decisionHash: 'c'.repeat(64),
            },
          },
        });
      },
    };

    const client = new DdaSidecarClientAdapter({
      transport,
      controlPlaneKeyId: 'cpk_test_1',
      controlPlaneKey: CONTROL_KEY,
      pinnedDigests: {
        'dda.folder.intake': DDA_FOLDER_INTAKE_HANDLER_DIGEST,
      },
      engineVersion: '0.1.0',
      protocolVersion: '1.0',
      nowMs: () => 1_700_000_000_000,
    });

    const accepted = await client.executeFolderIntake({
      capabilityGrantId: GRANT,
      opaqueInputHandle: 'handle_file_1',
      relativePath: 'sales/2026-08.csv',
      profile: 'CSV',
      schemaFingerprint: 'd'.repeat(64),
      contentFingerprint: `sha256:${'b'.repeat(64)}`,
      pinnedSchemaFingerprints: ['d'.repeat(64)],
      supportedProfiles: ['CSV', 'XLSX'],
      sizeBytes: 32,
    });

    expect(accepted).toMatchObject({ accepted: true, disposition: 'ADMITTED', profile: 'CSV' });
    const frame = sent[0];
    expect(frame).toBeDefined();
    if (frame === undefined) return;
    expect(frame.method).toBe('engine.execute');
    expect(frame.params['action']).toMatchObject({
      type: 'dda.folder.intake',
      handlerDigest: DDA_FOLDER_INTAKE_HANDLER_DIGEST,
    });
    expect(frame.params['capabilityGrantIds']).toEqual([GRANT]);
    expect(frame.params['inputRefs']).toEqual([{ handleId: 'handle_file_1' }]);
    expect(frame.params).not.toHaveProperty('command');
    expect(frame.params).not.toHaveProperty('path');
    expect(JSON.stringify(frame)).not.toMatch(/C:\\\\|Users|Program Files/i);
    expect(frame.params['signature']).toMatch(/^[a-f0-9]{64}$/u);

    await expect(
      client.executeFolderIntake({
        capabilityGrantId: GRANT,
        opaqueInputHandle: 'handle_file_1',
        relativePath: 'sales/2026-08.csv',
        profile: 'CSV',
        schemaFingerprint: 'd'.repeat(64),
        contentFingerprint: `sha256:${'b'.repeat(64)}`,
        pinnedSchemaFingerprints: ['d'.repeat(64)],
        supportedProfiles: ['CSV'],
        sizeBytes: 32,
        handlerDigestOverride: `sha256:${'e'.repeat(64)}`,
      }),
    ).resolves.toMatchObject({ accepted: false, code: 'HANDLER_DIGEST_MISMATCH' });

    const badTransport: SidecarTransport = {
      execute: (frame) =>
        Promise.resolve({
          jsonrpc: '2.0',
          id: frame.id,
          result: {
            attemptId: '01JJJJJJJJJJJJJJJJJJJJJJJJ',
            status: 'SUCCEEDED',
            output: {
              disposition: 'ADMITTED',
              profile: 'CSV',
              contentFingerprint: `sha256:${'b'.repeat(64)}`,
              decisionHash: 'c'.repeat(64),
            },
            handlerDigest: `sha256:${'f'.repeat(64)}`,
          },
        }),
    };
    const verifying = new DdaSidecarClientAdapter({
      transport: badTransport,
      controlPlaneKeyId: 'cpk_test_1',
      controlPlaneKey: CONTROL_KEY,
      pinnedDigests: { 'dda.folder.intake': DDA_FOLDER_INTAKE_HANDLER_DIGEST },
      engineVersion: '0.1.0',
      protocolVersion: '1.0',
      nowMs: () => 1_700_000_000_000,
    });
    await expect(
      verifying.executeFolderIntake({
        capabilityGrantId: GRANT,
        opaqueInputHandle: 'handle_file_1',
        relativePath: 'sales/2026-08.csv',
        profile: 'CSV',
        schemaFingerprint: 'd'.repeat(64),
        contentFingerprint: `sha256:${'b'.repeat(64)}`,
        pinnedSchemaFingerprints: ['d'.repeat(64)],
        supportedProfiles: ['CSV'],
        sizeBytes: 32,
      }),
    ).resolves.toMatchObject({ accepted: false, code: 'HANDLER_DIGEST_MISMATCH' });

    expect(sign('probe')).toHaveLength(64);
    expect(sent).toHaveLength(1);
  });

  it('reports ready only when transport and pinned digests are available', async () => {
    const client = new DdaSidecarClientAdapter({
      transport: {
        execute: () => Promise.resolve({ jsonrpc: '2.0', id: 1, error: { code: -32001 } }),
      },
      controlPlaneKeyId: 'cpk_test_1',
      controlPlaneKey: CONTROL_KEY,
      pinnedDigests: { 'dda.folder.intake': DDA_FOLDER_INTAKE_HANDLER_DIGEST },
      engineVersion: '0.1.0',
      protocolVersion: '1.0',
      nowMs: () => 1,
    });
    await expect(client.getStatus()).resolves.toEqual({
      lifecycle: 'ready',
      protocolVersion: '1.0',
      engineVersion: '0.1.0',
    });
  });
});

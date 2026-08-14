import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';

import type { FolderBindingPort } from '../src/application/folder-binding.port.ts';
import { FolderIntakeService } from '../src/application/folder-intake.service.ts';
import {
  FolderManifestService,
  type FolderBindingStore,
} from '../src/application/folder-manifest.service.ts';
import { FolderSyncService } from '../src/application/folder-sync.service.ts';
import { fingerprintLocalTabularFile } from '../src/application/local-tabular-fingerprint.ts';
import { PublicationProjectionService } from '../src/application/publication-projection.service.ts';
import { StableFileDetector } from '../src/application/stable-file-detector.ts';
import {
  DDA_FOLDER_INTAKE_HANDLER_DIGEST,
  DdaSidecarClientAdapter,
} from '../src/main/adapters/dda-sidecar-client.adapter.ts';
import { DsoCapabilityClientAdapter } from '../src/main/adapters/dso-capability-client.adapter.ts';
import { FolderWatcherLifecycle } from '../src/main/folder-watcher-lifecycle.ts';

const ORG = '00000000-0000-4000-8000-000000000001';
const WORKSPACE = '00000000-0000-4000-8000-000000000002';
const DEVICE = '00000000-0000-4000-8000-0000000000d0';
const GRANT = '00000000-0000-4000-8000-0000000000d1';
const CAPABILITY = '00000000-0000-4000-8000-0000000000c1';
const ROOT = 'C:\\ApprovedSales';
const CONTROL_KEY = 'a'.repeat(64);

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(
  entries: ReadonlyArray<{ readonly name: string; readonly data: Buffer }>,
): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const compressed = deflateRawSync(entry.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc32(entry.data), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    const localHeaderOffset = offset;
    localParts.push(local, compressed);
    offset += local.length + compressed.length;

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc32(entry.data), 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(localHeaderOffset, 42);
    name.copy(central, 46);
    centralParts.push(central);
  }
  const directory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, directory, end]);
}

/**
 * Golden Desktop folder journey: DSO grant → CSV/XLSX intake → typed sidecar → reviewed Hybrid sync.
 */
describe('DDA golden folder journey', () => {
  it('binds with DSO grant, admits CSV/XLSX, executes typed sidecar job, then syncs approved projection', async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith('/grants')) {
        return Promise.resolve(
          Response.json({
            accepted: true,
            value: [
              {
                schemaVersion: 1,
                grantId: GRANT,
                deviceId: DEVICE,
                organizationId: ORG,
                workspaceId: WORKSPACE,
                capabilityId: CAPABILITY,
                authorizationEpoch: 1,
                allowedActionTypes: ['dda.folder.intake'],
                allowedDataClassifications: ['INTERNAL'],
                synchronizationPayloadClasses: ['APPROVED_DERIVED_RESULT'],
                issuedAt: '2026-08-01T00:00:00.000Z',
                expiresAt: '2026-12-31T00:00:00.000Z',
                status: 'ACTIVE',
                revision: 1,
              },
            ],
          }),
        );
      }
      return Promise.resolve(
        Response.json({
          accepted: true,
          value: [
            {
              schemaVersion: 1,
              capabilityId: CAPABILITY,
              deviceId: DEVICE,
              organizationId: ORG,
              type: 'APPROVED_FOLDER',
              opaqueLocalHandle: 'handle_approved_folder_1',
              constraintDigest: 'a'.repeat(64),
              status: 'ACTIVE',
              reportedAt: '2026-08-01T00:00:00.000Z',
              revision: 1,
            },
          ],
        }),
      );
    });

    const dso = new DsoCapabilityClientAdapter({
      baseUrl: 'https://api.example.test',
      deviceId: DEVICE,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      authorizationEpoch: 1,
      getAccessToken: () => Promise.resolve('tok_test'),
      fetchImpl: fetchImpl as typeof fetch,
      nowMs: () => Date.parse('2026-08-11T00:00:00.000Z'),
    });
    await dso.refresh();

    const port: FolderBindingPort = {
      selectFolder: () => Promise.resolve({ selectionToken: 'sel_1' }),
      resolveSelection: () => Promise.resolve({ canonicalPath: ROOT }),
      assertPathInsideBinding: (root, candidate) =>
        candidate.toLowerCase().startsWith(root.toLowerCase()),
      detectSymlinkEscape: () => Promise.resolve(false),
    };
    const store: FolderBindingStore = { bindings: new Map() };
    let resolveCapability = (grantId: string) => dso.resolveCapability(grantId);
    const folders = new FolderManifestService({
      port,
      store,
      nowMs: () => 1_700_000_000_000,
      resolveCapability: (grantId) => resolveCapability(grantId),
    });

    const schemaFingerprint = createHash('sha256').update('region,amount').digest('hex');
    const created = await folders.createBinding({
      selectionToken: 'sel_1',
      capabilityGrantId: GRANT,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      displayName: 'Sales',
      manifest: {
        purpose: 'sales-intake',
        supportedProfiles: ['CSV', 'XLSX'],
        schemaFingerprints: [schemaFingerprint],
        groupingRules: ['by-period'],
        versionBehavior: 'APPEND',
        periodOverlapPolicy: 'REJECT',
        duplicateKeyFields: ['invoice_id'],
        mappingPolicyId: '01GGGGGGGGGGGGGGGGGGGGGGGG',
        stabilityDebounceMs: 250,
        publicationProjection: {
          class: 'DASHBOARD_AGGREGATES',
          fieldAllowlist: ['region', 'amount'],
        },
      },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;

    const csv = Buffer.from('region,amount\nHN,1000\n', 'utf8');
    const csvFingerprint = fingerprintLocalTabularFile(`${ROOT}\\sales.csv`, csv);
    expect(csvFingerprint).toMatchObject({ accepted: true, profile: 'CSV' });
    if (!('accepted' in csvFingerprint) || csvFingerprint.accepted !== true) return;

    const xlsx = zipStore([
      { name: '[Content_Types].xml', data: Buffer.from('<Types/>') },
      { name: 'xl/workbook.xml', data: Buffer.from('<workbook/>') },
      {
        name: 'xl/worksheets/sheet1.xml',
        data: Buffer.from(
          '<worksheet><sheetData><row><c><v>region</v></c><c><v>amount</v></c></row></sheetData></worksheet>',
        ),
      },
    ]);
    const xlsxFingerprint = fingerprintLocalTabularFile(`${ROOT}\\sales.xlsx`, xlsx);
    expect(xlsxFingerprint).toMatchObject({ accepted: true, profile: 'XLSX' });

    const sidecar = new DdaSidecarClientAdapter({
      transport: {
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
                contentFingerprint: csvFingerprint.contentFingerprint,
                decisionHash: 'c'.repeat(64),
              },
            },
          }),
      },
      controlPlaneKeyId: 'cpk_test_1',
      controlPlaneKey: CONTROL_KEY,
      pinnedDigests: { 'dda.folder.intake': DDA_FOLDER_INTAKE_HANDLER_DIGEST },
      engineVersion: '0.1.0',
      protocolVersion: '1.0',
      nowMs: () => 1_700_000_000_000,
    });
    const job = await sidecar.executeFolderIntake({
      capabilityGrantId: GRANT,
      opaqueInputHandle: 'handle_file_csv_1',
      relativePath: 'sales.csv',
      profile: 'CSV',
      schemaFingerprint: csvFingerprint.schemaFingerprint,
      contentFingerprint: csvFingerprint.contentFingerprint,
      pinnedSchemaFingerprints: [schemaFingerprint],
      supportedProfiles: ['CSV', 'XLSX'],
      sizeBytes: csv.length,
    });
    expect(job).toMatchObject({ accepted: true, disposition: 'ADMITTED' });

    const lifecycle = new FolderWatcherLifecycle({
      folders,
      assertInsideBinding: (root, candidate) =>
        candidate.toLowerCase().startsWith(root.toLowerCase()),
      createWatcher: () => ({
        onEvent: () => () => undefined,
        start: () => undefined,
        dispose: () => undefined,
      }),
      createIntake: (configuration) =>
        new FolderIntakeService({
          detector: new StableFileDetector({
            debounceMs: configuration.manifest.stabilityDebounceMs,
            nowMs: () => 1_700_000_000_000,
          }),
          bindingId: configuration.bindingId,
          bindingRoot: configuration.canonicalPath,
          manifest: configuration.manifest,
          assertInsideBinding: (candidate) =>
            candidate.toLowerCase().startsWith(configuration.canonicalPath.toLowerCase()),
          readFingerprint: (filePath) => {
            if (filePath.endsWith('.csv')) return Promise.resolve(csvFingerprint);
            if (filePath.endsWith('.xlsx')) return Promise.resolve(xlsxFingerprint);
            return Promise.resolve({ rejected: 'UNSUPPORTED_PROFILE' as const });
          },
        }),
      nowMs: () => 1_700_000_000_000,
    });
    lifecycle.attach(created.value.bindingId);
    expect(folders.watcherConfiguration(created.value.bindingId)).not.toBeNull();

    const revokedFetch = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith('/grants')) {
        return Promise.resolve(
          Response.json({
            accepted: true,
            value: [
              {
                schemaVersion: 1,
                grantId: GRANT,
                deviceId: DEVICE,
                organizationId: ORG,
                workspaceId: WORKSPACE,
                capabilityId: CAPABILITY,
                authorizationEpoch: 1,
                allowedActionTypes: ['dda.folder.intake'],
                allowedDataClassifications: ['INTERNAL'],
                synchronizationPayloadClasses: ['APPROVED_DERIVED_RESULT'],
                issuedAt: '2026-08-01T00:00:00.000Z',
                status: 'REVOKED',
                revision: 2,
              },
            ],
          }),
        );
      }
      return Promise.resolve(
        Response.json({
          accepted: true,
          value: [
            {
              schemaVersion: 1,
              capabilityId: CAPABILITY,
              deviceId: DEVICE,
              organizationId: ORG,
              type: 'APPROVED_FOLDER',
              opaqueLocalHandle: 'handle_approved_folder_1',
              constraintDigest: 'a'.repeat(64),
              status: 'ACTIVE',
              reportedAt: '2026-08-01T00:00:00.000Z',
              revision: 1,
            },
          ],
        }),
      );
    });
    const revokedDso = new DsoCapabilityClientAdapter({
      baseUrl: 'https://api.example.test',
      deviceId: DEVICE,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      authorizationEpoch: 1,
      getAccessToken: () => Promise.resolve('tok_test'),
      fetchImpl: revokedFetch as typeof fetch,
      nowMs: () => Date.parse('2026-08-11T00:00:00.000Z'),
    });
    await revokedDso.refresh();
    resolveCapability = (grantId) => revokedDso.resolveCapability(grantId);
    expect(folders.watcherConfiguration(created.value.bindingId)).toBeNull();
    lifecycle.reconcile();

    const projection = new PublicationProjectionService({
      workspacePolicy: {
        maxProjectionClass: 'DASHBOARD_AGGREGATES',
        allowedFields: ['region', 'amount'],
        allowOriginalContent: false,
      },
    });
    const draft = {
      class: 'DASHBOARD_AGGREGATES' as const,
      fieldAllowlist: ['region', 'amount'],
      rowCount: 1,
      byteCount: 32,
      destination: 'CLOUD_WORKSPACE_PROJECTION' as const,
      evidenceConsequences: ['removes original paths', 'keeps aggregate evidence keys'],
      dataMode: 'HYBRID' as const,
      version: 1,
    };
    const approved = projection.approve(draft);
    expect(approved.accepted).toBe(true);
    if (!approved.accepted) return;

    const uploads: Array<{ idempotencyKey: string; projectionId: string }> = [];
    const sync = new FolderSyncService({
      upload: (request) => {
        uploads.push({
          idempotencyKey: request.idempotencyKey,
          projectionId: request.projectionId,
        });
        return Promise.resolve({ accepted: true, receiptId: 'rcpt_golden_1' });
      },
      nowMs: () => 1_700_000_000_000,
    });
    const projectionId = '01GOLDENFOLDERJOURNEY00001';
    const bytes = new TextEncoder().encode('{"region":"HN","amount":1000}');
    const first = await sync.enqueueApprovedProjection({
      projectionId,
      version: approved.value.version,
      class: approved.value.class,
      bytes,
      destination: 'CLOUD_WORKSPACE_PROJECTION',
    });
    expect(first.state).toBe('QUEUED');
    await expect(sync.flush()).resolves.toMatchObject({ delivered: 1, failed: 0 });
    expect(JSON.stringify(uploads)).not.toMatch(/C:\\\\|Users|Approved/i);
  });
});

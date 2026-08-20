import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { LocalWorkerObjectByteStoreAdapter } from '../../../src/features/iae/adapter/local-worker-object-byte-store.adapter.js';
import type { IaeWorkerObjectByteStorePortV1 } from '../../../src/features/iae/application/worker-object-transfer.port.js';

function id(value: string) {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('invalid test id');
  return parsed.value;
}

const scope = Object.freeze({
  scopeType: 'workspace' as const,
  organizationId: id('00000000-0000-4000-8000-000000000001'),
  workspaceId: id('00000000-0000-4000-8000-000000000002'),
});

const sourceBytes = new TextEncoder().encode('revenue,region\n10,north\n');
const sourceHash = '6b8f12a0efb1ca3004caa0b90dab185ef04df27e8033de33d6435b35ef8782c3';
const sourceId = '00000000-0000-4000-8000-000000000201';

void test('reads source bytes through the exact ArtifactVersion reader and delegates writes to result storage', async () => {
  const writes: unknown[] = [];
  const output: IaeWorkerObjectByteStorePortV1 = {
    readExact: async () => ({ accepted: false, code: 'OBJECT_NOT_FOUND' as const }),
    writeExact: async (input) => {
      writes.push(input);
      return {
        accepted: true as const,
        value: {
          objectId: input.objectId,
          bytes: input.bytes,
          contentSha256: input.contentSha256,
          contentLength: input.contentLength,
        },
      };
    },
  };
  const adapter = new LocalWorkerObjectByteStoreAdapter({
    input: {
      loadVersion: async (input) => ({
        artifactVersionId: input.artifactVersionId,
        tenantScope: input.tenantScope,
        contentSha256: sourceHash,
        mediaType: 'text/csv',
        bytes: sourceBytes,
      }),
    },
    output,
  });

  const loaded = await adapter.readExact({
    tenantScope: scope,
    objectId: sourceId,
    maximumByteLength: 1024,
  });
  assert.equal(loaded.accepted, true);
  if (loaded.accepted) {
    assert.equal(loaded.value.objectId, sourceId);
    assert.equal(loaded.value.contentSha256, sourceHash);
    assert.deepEqual([...loaded.value.bytes], [...sourceBytes]);
  }

  const written = await adapter.writeExact({
    tenantScope: scope,
    objectId: 'result-object',
    bytes: new Uint8Array([1, 2, 3]),
    contentSha256: '0000000000000000000000000000000000000000000000000000000000000000',
    contentLength: 3,
    maximumByteLength: 10,
  });
  assert.equal(written.accepted, true);
  assert.equal(writes.length, 1);
});

void test('fails closed when the exact source reader cannot load or returns a tampered digest', async () => {
  const output: IaeWorkerObjectByteStorePortV1 = {
    readExact: async () => ({ accepted: false, code: 'OBJECT_NOT_FOUND' as const }),
    writeExact: async () => ({ accepted: false, code: 'STORE_UNAVAILABLE' as const }),
  };
  const missing = new LocalWorkerObjectByteStoreAdapter({
    input: { loadVersion: async () => undefined },
    output,
  });
  assert.deepEqual(
    await missing.readExact({ tenantScope: scope, objectId: sourceId, maximumByteLength: 1024 }),
    { accepted: false, code: 'OBJECT_NOT_FOUND' },
  );

  const tampered = new LocalWorkerObjectByteStoreAdapter({
    input: {
      loadVersion: async (input) => ({
        artifactVersionId: input.artifactVersionId,
        tenantScope: input.tenantScope,
        contentSha256: '0000000000000000000000000000000000000000000000000000000000000000',
        mediaType: 'text/csv',
        bytes: sourceBytes,
      }),
    },
    output,
  });
  assert.deepEqual(
    await tampered.readExact({ tenantScope: scope, objectId: sourceId, maximumByteLength: 1024 }),
    { accepted: false, code: 'STORE_UNAVAILABLE' },
  );
});

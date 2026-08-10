import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { ObjectStorageArtifactProcessingContentAdapter } from '../../../src/features/iae/adapter/object-storage-artifact-processing-content.adapter.js';
import type { ArtifactProcessingContentPortV1 } from '../../../src/features/iae/application/artifact-processing-content.port.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const scope = scopeResult.accepted ? scopeResult.value : (null as never);

const otherScopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000099',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(otherScopeResult.accepted, true);
const otherScope = otherScopeResult.accepted ? otherScopeResult.value : (null as never);

const ARTIFACT = '00000000-0000-4000-8000-000000000023';
const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const PNG_HASH = createHash('sha256').update(PNG_BYTES).digest('hex');

function buildAdapter(overrides?: {
  readonly bytesByVersion?: ReadonlyMap<string, Uint8Array>;
  readonly metaByVersion?: ReadonlyMap<
    string,
    {
      readonly tenantScope: typeof scope;
      readonly contentSha256: string;
      readonly mediaType: string;
      readonly imageWidth?: number;
      readonly imageHeight?: number;
    }
  >;
}): ArtifactProcessingContentPortV1 {
  const bytesByVersion = overrides?.bytesByVersion ?? new Map([[ARTIFACT, PNG_BYTES]]);
  const metaByVersion =
    overrides?.metaByVersion ??
    new Map([
      [
        ARTIFACT,
        {
          tenantScope: scope,
          contentSha256: PNG_HASH,
          mediaType: 'image/png',
          imageWidth: 32,
          imageHeight: 48,
        },
      ],
    ]);
  return new ObjectStorageArtifactProcessingContentAdapter({
    async loadVersion(input) {
      const meta = metaByVersion.get(input.artifactVersionId);
      if (!meta) return undefined;
      if (
        meta.tenantScope.scopeType !== 'organization' &&
        input.tenantScope.scopeType !== 'organization' &&
        meta.tenantScope.workspaceId !== input.tenantScope.workspaceId
      ) {
        return undefined;
      }
      const bytes = bytesByVersion.get(input.artifactVersionId);
      if (!bytes) return undefined;
      return {
        artifactVersionId: input.artifactVersionId,
        tenantScope: meta.tenantScope,
        contentSha256: meta.contentSha256,
        mediaType: meta.mediaType,
        bytes,
        ...(meta.imageWidth !== undefined ? { imageWidth: meta.imageWidth } : {}),
        ...(meta.imageHeight !== undefined ? { imageHeight: meta.imageHeight } : {}),
        pageCount: 1,
      };
    },
  });
}

void test('[DDA-003, DDA-041] processing content rejects wrong-scope artifact', async () => {
  const port = buildAdapter();
  const result = await port.openProcessingContent({
    tenantScope: otherScope,
    artifactVersionId: ARTIFACT,
    maximumByteLength: 10_000,
    allowedMediaTypes: ['image/png'],
  });
  assert.equal(result.accepted, false);
  if (result.accepted) return;
  assert.equal(result.code, 'PROCESSING_CONTENT_SCOPE_DENIED');
});

void test('[DDA-041] processing content rejects unsupported media type and oversize payload', async () => {
  const port = buildAdapter();
  const unsupported = await port.openProcessingContent({
    tenantScope: scope,
    artifactVersionId: ARTIFACT,
    maximumByteLength: 10_000,
    allowedMediaTypes: ['image/jpeg'],
  });
  assert.equal(unsupported.accepted, false);
  if (!unsupported.accepted) {
    assert.equal(unsupported.code, 'PROCESSING_CONTENT_UNSUPPORTED_MEDIA_TYPE');
  }

  const oversize = await port.openProcessingContent({
    tenantScope: scope,
    artifactVersionId: ARTIFACT,
    maximumByteLength: 4,
    allowedMediaTypes: ['image/png'],
  });
  assert.equal(oversize.accepted, false);
  if (!oversize.accepted) {
    assert.equal(oversize.code, 'PROCESSING_CONTENT_OVERSIZE');
  }
});

void test('[DDA-041] processing content rejects hash mismatch and returns approved bytes on success', async () => {
  const port = buildAdapter();
  const mismatch = await port.openProcessingContent({
    tenantScope: scope,
    artifactVersionId: ARTIFACT,
    expectedContentSha256: '0'.repeat(64),
    maximumByteLength: 10_000,
    allowedMediaTypes: ['image/png'],
  });
  assert.equal(mismatch.accepted, false);
  if (!mismatch.accepted) {
    assert.equal(mismatch.code, 'PROCESSING_CONTENT_HASH_MISMATCH');
  }

  const ok = await port.openProcessingContent({
    tenantScope: scope,
    artifactVersionId: ARTIFACT,
    expectedContentSha256: PNG_HASH,
    maximumByteLength: 10_000,
    allowedMediaTypes: ['image/png'],
  });
  assert.equal(ok.accepted, true);
  if (!ok.accepted) return;
  assert.equal(ok.value.contentSha256, PNG_HASH);
  assert.equal(ok.value.mediaType, 'image/png');
  assert.equal(ok.value.byteLength, PNG_BYTES.byteLength);
  assert.deepEqual(Array.from(ok.value.bytes), Array.from(PNG_BYTES));
  assert.equal(ok.value.imageWidth, 32);
  assert.equal(ok.value.imageHeight, 48);
});

void test('[DDA-003] default object-storage adapter fails closed without a version reader', async () => {
  const port = new ObjectStorageArtifactProcessingContentAdapter();
  const result = await port.openProcessingContent({
    tenantScope: scope,
    artifactVersionId: ARTIFACT,
    maximumByteLength: 10_000,
    allowedMediaTypes: ['image/png'],
  });
  assert.equal(result.accepted, false);
  if (result.accepted) return;
  assert.equal(result.code, 'PROCESSING_CONTENT_UNAVAILABLE');
});

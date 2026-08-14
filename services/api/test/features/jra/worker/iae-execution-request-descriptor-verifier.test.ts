import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { createExecutionRequestDescriptorV1 } from '../../../../src/features/jra/application/execution-request-descriptor.js';
import {
  IaeExecutionRequestDescriptorVerifierAdapter,
  iaeExecutionRequestInputManifestHashV1,
  type IaeExecutionRequestObjectAuthorityPortV1,
  type IaeExecutionRequestObjectMetadataV1,
} from '../../../../src/features/iae/worker/adapter/execution-request-descriptor-verifier.adapter.js';

function id(value: string) {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('invalid test identifier');
  return parsed.value;
}

const tenantScope: TenantScopeV1 = Object.freeze({
  scopeType: 'workspace',
  organizationId: id('00000000-0000-4000-8000-000000000001'),
  workspaceId: id('00000000-0000-4000-8000-000000000002'),
});
const objects = Object.freeze([
  Object.freeze({
    objectId: 'object-one',
    tenantScope,
    dataMode: 'Cloud' as const,
    cloudAvailable: true,
    cloudExecutionAllowed: true,
    status: 'ACTIVE' as const,
    scanState: 'CLEAN' as const,
    contentSha256: 'a'.repeat(64),
    contentLength: 12,
  }),
  Object.freeze({
    objectId: 'object-two',
    tenantScope,
    dataMode: 'Hybrid' as const,
    cloudAvailable: true,
    cloudExecutionAllowed: true,
    status: 'ACTIVE' as const,
    scanState: 'CLEAN' as const,
    contentSha256: 'b'.repeat(64),
    contentLength: 34,
  }),
]);

function descriptor(inputObjects: readonly IaeExecutionRequestObjectMetadataV1[] = objects) {
  const parsed = createExecutionRequestDescriptorV1({
    schemaVersion: 1,
    descriptorId: id('00000000-0000-4000-8000-000000000003'),
    resultUsageSettlementBindingId: id('00000000-0000-4000-8000-000000000006'),
    tenantScope,
    jobId: id('00000000-0000-4000-8000-000000000004'),
    stepId: id('00000000-0000-4000-8000-000000000005'),
    action: {
      type: 'spreadsheet.audit',
      version: 1,
      inputSchemaId: 'input.v1',
      outputSchemaId: 'output.v1',
      handlerDigest: 'c'.repeat(64),
      requiredCapabilities: ['artifact.read'],
      sideEffectClass: 'NONE',
      riskClass: 'READ_ONLY',
    },
    inputObjectIds: inputObjects.map(({ objectId }) => objectId),
    inputManifestHash: iaeExecutionRequestInputManifestHashV1(inputObjects),
    parameters: { includeHidden: false },
    outputPolicy: {
      outputObjectId: 'result-object',
      maxBytes: 1_024,
      mediaType: 'application/json',
    },
    deadline: '2026-08-13T01:00:00.000Z',
    locale: 'vi-VN',
    createdAt: '2026-08-13T00:00:00.000Z',
  });
  if (!parsed.accepted) throw new Error('invalid descriptor fixture');
  return parsed.value;
}

function authority(metadata: readonly IaeExecutionRequestObjectMetadataV1[]) {
  const port: IaeExecutionRequestObjectAuthorityPortV1 = {
    findExactObjectMetadata: ({ objectId }) =>
      Promise.resolve(metadata.find((candidate) => candidate.objectId === objectId)),
  };
  return port;
}

void test('[IAE-002/IAE-004/JRA-004/JRA-023] verifies every exact cloud-readable object binding', async () => {
  const verifier = new IaeExecutionRequestDescriptorVerifierAdapter(authority(objects));
  assert.equal(await verifier.verify(descriptor()), true);
});

void test('[IAE-004/JRA-023] fails closed on missing, cross-scope, local-only, or hash-drifted metadata', async () => {
  const candidate = descriptor();
  const {
    cloudExecutionAllowed: omittedCloudExecutionAuthority,
    ...withoutCloudExecutionAuthority
  } = objects[1]!;
  void omittedCloudExecutionAuthority;
  assert.equal(
    await new IaeExecutionRequestDescriptorVerifierAdapter(authority(objects.slice(0, 1))).verify(
      candidate,
    ),
    false,
  );
  assert.equal(
    await new IaeExecutionRequestDescriptorVerifierAdapter(
      authority([
        objects[0]!,
        {
          ...objects[1]!,
          tenantScope: {
            ...tenantScope,
            workspaceId: id('00000000-0000-4000-8000-000000000099'),
          },
        },
      ]),
    ).verify(candidate),
    false,
  );
  assert.equal(
    await new IaeExecutionRequestDescriptorVerifierAdapter(
      authority([objects[0]!, { ...objects[1]!, dataMode: 'Local', cloudAvailable: false }]),
    ).verify(candidate),
    false,
  );
  assert.equal(
    await new IaeExecutionRequestDescriptorVerifierAdapter(
      authority([objects[0]!, withoutCloudExecutionAuthority]),
    ).verify(candidate),
    false,
  );
  assert.equal(
    await new IaeExecutionRequestDescriptorVerifierAdapter(
      authority([objects[0]!, { ...objects[1]!, contentSha256: 'd'.repeat(64) }]),
    ).verify(candidate),
    false,
  );
});

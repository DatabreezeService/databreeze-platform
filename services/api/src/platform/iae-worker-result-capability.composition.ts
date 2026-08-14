import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  IaePreparedWorkerResultOutputAuthorityV1,
  IaeWorkerResultWriteCapabilityIssuerPortV1,
} from '../features/iae/application/worker-result-write-capability.service.js';
import type {
  WorkerPreparedResultV1,
  WorkerResultWriteCapabilityAuthorityPortV1,
  WorkerResultWriteCapabilityV1,
} from '../features/jra/worker/worker-result-preparation.port.js';
import type { WorkerIdentityV1 } from '../features/jra/worker/worker-ports.js';

const SHA256 = /^[a-f0-9]{64}$/u;

function authoritativeOutput(
  value: WorkerPreparedResultV1['outputs'][number],
): IaePreparedWorkerResultOutputAuthorityV1 | undefined {
  if (value.sourceArtifactVersionIds.length === 0) return undefined;
  const sourceArtifactVersionIds = value.sourceArtifactVersionIds.map((source) =>
    parseStableIdentifierV1(source),
  );
  if (sourceArtifactVersionIds.some((source) => !source.accepted)) return undefined;
  if (
    typeof value.processorVersion !== 'string' ||
    (value.dataMode !== 'Hybrid' && value.dataMode !== 'Cloud') ||
    (value.payloadClass !== 'RECONSTRUCTABLE_DERIVED_CONTENT' &&
      value.payloadClass !== 'APPROVED_DERIVED_RESULT') ||
    !SHA256.test(value.sourceLineageHash)
  )
    return undefined;
  return Object.freeze({
    outputName: value.outputName,
    objectId: value.objectId,
    mediaType: value.mediaType,
    contentSha256: value.contentSha256,
    byteLength: value.byteLength,
    maxBytes: value.maxBytes,
    allowedMediaTypes: Object.freeze([...value.allowedMediaTypes]),
    sourceArtifactVersionIds: Object.freeze(
      sourceArtifactVersionIds.map((source) => {
        if (!source.accepted) throw new Error('unreachable');
        return source.value;
      }),
    ),
    sourceLineageHash: value.sourceLineageHash,
    processorVersion: value.processorVersion,
    dataMode: value.dataMode,
    payloadClass: value.payloadClass,
  });
}

/** Root-owned public-port bridge; it performs no feature persistence reads. */
export class IaeWorkerResultCapabilityAuthorityBridge
  implements WorkerResultWriteCapabilityAuthorityPortV1
{
  public constructor(private readonly issuer: IaeWorkerResultWriteCapabilityIssuerPortV1) {}

  public async issue(
    identity: WorkerIdentityV1,
    preparation: WorkerPreparedResultV1,
  ): Promise<readonly WorkerResultWriteCapabilityV1[]> {
    const outputs = preparation.outputs.map(authoritativeOutput);
    if (outputs.some((output) => output === undefined))
      throw new Error('IAE_PREPARED_RESULT_AUTHORITY_UNAVAILABLE');
    const result = await this.issuer.issue(identity, {
      submissionId: preparation.submissionId,
      attemptId: preparation.attemptId,
      jobId: preparation.jobId,
      tenantScope: preparation.tenantScope,
      executionDescriptorId: preparation.descriptorId,
      executionDescriptorHash: preparation.descriptorHash,
      outputPolicyHash: preparation.outputPolicyHash,
      outputs: outputs as readonly IaePreparedWorkerResultOutputAuthorityV1[],
    });
    if (!result.accepted) {
      const code = 'code' in result ? result.code : 'CAPABILITY_UNAVAILABLE';
      throw new Error(`IAE_RESULT_WRITE_CAPABILITY_${code}`);
    }
    if (result.value.length !== preparation.outputs.length)
      throw new Error('IAE_RESULT_WRITE_CAPABILITY_INCOMPLETE');
    return Object.freeze(
      result.value.map((capability, index) => {
        const policy = preparation.outputs[index];
        if (
          policy === undefined ||
          policy.outputName !== capability.outputName ||
          policy.objectId !== capability.objectId ||
          policy.maxBytes !== capability.maxBytes
        )
          throw new Error('IAE_RESULT_WRITE_CAPABILITY_MISMATCH');
        return Object.freeze({
          ...policy,
          capabilityId: capability.capabilityId,
          issuedAt: capability.issuedAt,
          expiresAt: capability.expiresAt,
          signedCapability: capability.signedCapability,
        });
      }),
    );
  }
}

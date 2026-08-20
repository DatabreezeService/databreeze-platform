import type { ExecutionAttemptV1 } from '@databreeze/domain/execution-attempt/v1';
import type { JobV1 } from '@databreeze/domain/jobs/v1';
import {
  parseStableIdentifierV1,
  tenantScopesEqualV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import { createIamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { ExecutionRouteWorkspacePolicyAuthorityPortV1 } from '../../dso/application/execution-route-policy-authority.port.js';
import type { ArtifactRepositoryPortV1 } from '../application/artifact-repository.port.js';
import type {
  IaeWorkerInputObjectResolutionResultV1,
  IaeWorkerInputObjectResolverPortV1,
} from '../application/worker-object-capability.port.js';

const LOCAL_ACTOR_ID = '00000000-0000-4000-8000-0000000000a0';
// Keep the local resolver aligned with the authoritative JRA/IAE worker grant
// boundary. Larger source objects need the separately approved streaming
// transfer protocol; advertising 20 GiB here makes the capability service
// reject an otherwise valid grant before the worker can read it.
const MAX_INPUT_BYTES = 10 * 1024 * 1024 * 1024;

function rejected(
  code: 'INPUT_OBJECTS_UNAVAILABLE' | 'INVALID_OBJECT_REFERENCE',
): IaeWorkerInputObjectResolutionResultV1 {
  return Object.freeze({ accepted: false, code });
}

/**
 * Local exact ArtifactVersion metadata resolver for JRA-033.
 *
 * The descriptor supplies the opaque IDs through the internal server adapter;
 * this class verifies scope, ACTIVE/CLEAN state, current DSO placement policy,
 * and immutable hash/length metadata. It never returns bytes, paths, URLs, or
 * storage credentials.
 */
export class LocalWorkerInputObjectResolverAdapter implements IaeWorkerInputObjectResolverPortV1 {
  public constructor(
    private readonly dependencies: {
      readonly artifacts: ArtifactRepositoryPortV1;
      readonly policies: ExecutionRouteWorkspacePolicyAuthorityPortV1;
    },
  ) {}

  public async resolveInputObjects(input: {
    readonly tenantScope: TenantScopeV1;
    readonly job: JobV1;
    readonly attempt: ExecutionAttemptV1;
    readonly inputObjectIds?: readonly string[];
  }): Promise<IaeWorkerInputObjectResolutionResultV1> {
    if (
      input.tenantScope.scopeType !== 'workspace' ||
      input.inputObjectIds === undefined ||
      input.inputObjectIds.length === 0 ||
      input.inputObjectIds.length > 128
    )
      return rejected('INVALID_OBJECT_REFERENCE');
    const context = createIamTenantContextV1({
      tenantScope: input.tenantScope,
      actorId: LOCAL_ACTOR_ID,
      correlationId: input.attempt.attemptId,
      idempotencyKey: `local-worker-input-${input.attempt.attemptId}`,
      authorizationEpoch: 1,
      mfaReenrollmentRequired: false,
    });
    if (!context.accepted) return rejected('INPUT_OBJECTS_UNAVAILABLE');
    const policy = await this.dependencies.policies.resolveCurrentWorkspacePolicy({
      organizationId: input.tenantScope.organizationId,
      workspaceId: input.tenantScope.workspaceId,
    });
    if (
      policy === undefined ||
      policy.policy.mode === 'LOCAL' ||
      !policy.policy.allowedPlacementKinds.includes('CLOUD')
    )
      return rejected('INPUT_OBJECTS_UNAVAILABLE');

    const objects = [];
    for (const rawObjectId of input.inputObjectIds) {
      const parsedObjectId = parseStableIdentifierV1(rawObjectId);
      if (!parsedObjectId.accepted) return rejected('INVALID_OBJECT_REFERENCE');
      const version = await this.dependencies.artifacts.findVersion(
        context.value,
        parsedObjectId.value,
      );
      if (
        version === undefined ||
        !tenantScopesEqualV1(version.tenantScope, input.tenantScope) ||
        version.status !== 'ACTIVE' ||
        version.scanState !== 'CLEAN' ||
        !/^[a-f0-9]{64}$/u.test(version.contentSha256) ||
        !Number.isSafeInteger(version.byteSize) ||
        version.byteSize < 0
      )
        return rejected('INPUT_OBJECTS_UNAVAILABLE');
      const placements = await this.dependencies.artifacts.listPlacements(
        context.value,
        version.versionId,
      );
      if (
        !placements.some(
          (placement) =>
            placement.kind === 'CLOUD' &&
            placement.available &&
            placement.contentSha256 === version.contentSha256,
        )
      )
        return rejected('INPUT_OBJECTS_UNAVAILABLE');
      objects.push(
        Object.freeze({
          objectId: version.versionId,
          contentSha256: version.contentSha256,
          contentLength: version.byteSize,
        }),
      );
    }
    const totalBytes = objects.reduce((total, object) => total + object.contentLength, 0);
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_INPUT_BYTES)
      return rejected('INVALID_OBJECT_REFERENCE');
    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        objects: Object.freeze(objects),
        maxBytes: MAX_INPUT_BYTES,
      }),
    });
  }
}

import { createArtifactVersionV1, createContentPlacementV1 } from '@databreeze/domain/artifact/v1';
import { createInboxItemV1 } from '@databreeze/domain/artifact-intake/v1';
import { isDataModePayloadAllowedV1 } from '@databreeze/domain/data-mode/v1';
import { tenantScopesEqualV1 } from '@databreeze/domain/tenant-scope/v1';
import { createHash, randomUUID } from 'node:crypto';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { ExecutionRouteWorkspacePolicyAuthorityPortV1 } from '../../dso/application/execution-route-policy-authority.port.js';
import type { IaeAuthorizationPortV1 } from '../application/iae-authorization.port.js';
import type {
  LocalWebIntakeErrorCodeV1,
  LocalWebIntakeObjectStorePortV1,
  IaeLocalWebIntakePortV1,
  LocalWebIntakeResultV1,
  LocalWebIntakeUploadInputV1,
  LocalWebIntakeUploadValueV1,
} from '../application/local-web-intake.port.js';

export type LocalWebIntakeDatabaseV1 = {
  readonly artifactVersion: {
    create(input: { readonly data: Record<string, unknown> }): Promise<unknown>;
    findUnique?(input: { readonly where: Record<string, unknown> }): Promise<unknown>;
  };
  readonly contentPlacement: {
    create(input: { readonly data: Record<string, unknown> }): Promise<unknown>;
  };
  readonly inboxItem: {
    create(input: { readonly data: Record<string, unknown> }): Promise<unknown>;
    findFirst(input: { readonly where: Record<string, unknown> }): Promise<unknown>;
  };
  $transaction<TValue>(
    work: (transaction: LocalWebIntakeDatabaseV1) => Promise<TValue>,
  ): Promise<TValue>;
};

function rejected<TValue>(code: LocalWebIntakeErrorCodeV1): LocalWebIntakeResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

function databaseScope(scope: IamTenantContextV1['tenantScope']): Record<string, string | null> {
  const result: Record<string, string | null> = {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
  };
  if (scope.scopeType !== 'organization') result['workspaceId'] = scope.workspaceId;
  result['projectId'] = scope.scopeType === 'project' ? scope.projectId : null;
  return result;
}

function safeFileName(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 255 &&
    !value.includes('/') &&
    !value.includes('\\') &&
    ![...value].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 0x1f || code === 0x7f;
    })
  );
}

/** Plan 408: local-only, server-owned first-file path. It never accepts client authority. */
export class PrismaLocalWebIntakeAdapter implements IaeLocalWebIntakePortV1 {
  public constructor(
    private readonly options: {
      readonly database: LocalWebIntakeDatabaseV1;
      readonly authorization: IaeAuthorizationPortV1;
      readonly policies: ExecutionRouteWorkspacePolicyAuthorityPortV1;
      readonly objectStore: LocalWebIntakeObjectStorePortV1;
      readonly ids?: { next(): string };
      readonly clock?: () => Date;
    },
  ) {}

  public async upload(
    context: IamTenantContextV1,
    input: LocalWebIntakeUploadInputV1,
  ): Promise<LocalWebIntakeResultV1<LocalWebIntakeUploadValueV1>> {
    if (context.tenantScope.scopeType !== 'workspace') {
      return rejected('LOCAL_INTAKE_SCOPE_DENIED');
    }
    const workspaceScope = context.tenantScope;
    if (!tenantScopesEqualV1(workspaceScope, input.tenantScope)) {
      return rejected('LOCAL_INTAKE_SCOPE_DENIED');
    }
    if (!safeFileName(input.fileName) || input.bytes.byteLength < 1) {
      return rejected('LOCAL_INTAKE_INVALID_INPUT');
    }
    if (input.bytes.byteLength > 100 * 1024 * 1024) {
      return rejected('LOCAL_INTAKE_LIMIT_SIZE');
    }
    if (!/^[a-f0-9]{64}$/u.test(input.expectedSha256)) {
      return rejected('LOCAL_INTAKE_INVALID_INPUT');
    }
    const actualHash = createHash('sha256').update(input.bytes).digest('hex');
    if (actualHash !== input.expectedSha256.toLowerCase()) {
      return rejected('LOCAL_INTAKE_INVALID_INPUT');
    }
    const authorized = await this.options.authorization.authorize(context, {
      tenantScope: context.tenantScope,
      action: 'ARTIFACT_UPLOAD_CREATE',
    });
    if (!authorized.accepted) return rejected('LOCAL_INTAKE_PERMISSION_DENIED');
    const current = await this.options.policies.resolveCurrentWorkspacePolicy({
      organizationId: workspaceScope.organizationId,
      workspaceId: workspaceScope.workspaceId,
    });
    if (!current) {
      return rejected('LOCAL_INTAKE_POLICY_UNAVAILABLE');
    }
    if (current.authorizationEpoch !== context.authorizationEpoch) {
      return rejected('LOCAL_INTAKE_POLICY_UNAVAILABLE');
    }
    if (
      current.policy.mode === 'LOCAL' ||
      // The DSO policy vocabulary uses the canonical placement kind `CLOUD`;
      // `CLOUD_OBJECT` is the upload-admission description, not a policy value.
      !current.policy.allowedPlacementKinds.includes('CLOUD') ||
      !isDataModePayloadAllowedV1(current.policy, 'INTERNAL', 'ORIGINAL_CONTENT')
    ) {
      return rejected('LOCAL_INTAKE_DATA_MODE_DENIED');
    }

    const existing = await this.options.database.inboxItem.findFirst({
      where: { ...databaseScope(context.tenantScope), idempotencyKey: input.idempotencyKey },
    });
    if (existing !== null && existing !== undefined) {
      const row = existing as Record<string, unknown>;
      const version =
        typeof this.options.database.artifactVersion.findUnique === 'function'
          ? await this.options.database.artifactVersion.findUnique({
              where: { id: String(row['artifactVersionId']) },
            })
          : undefined;
      if (
        version !== undefined &&
        version !== null &&
        (String((version as Record<string, unknown>)['contentSha256']) !== actualHash ||
          Number((version as Record<string, unknown>)['byteSize']) !== input.bytes.byteLength ||
          String((version as Record<string, unknown>)['mediaType']) !== input.mediaType ||
          String((version as Record<string, unknown>)['displayName']) !== input.fileName)
      ) {
        return rejected('LOCAL_INTAKE_IDEMPOTENCY_CONFLICT');
      }
      return Object.freeze({
        accepted: true,
        value: Object.freeze({
          sessionId: String(row['id']),
          inboxItemId: String(row['id']),
          artifactVersionId: String(row['artifactVersionId']),
          status: 'PENDING_REVIEW' as const,
          replayed: true,
        }),
      });
    }

    const now = this.options.clock?.() ?? new Date();
    const nextId = () => this.options.ids?.next() ?? randomUUID();
    const artifactId = nextId();
    const versionId = nextId();
    const inboxItemId = nextId();
    const placementId = nextId();
    const createdAt = now.toISOString();
    const artifact = createArtifactVersionV1({
      artifactId,
      versionId,
      tenantScope: context.tenantScope,
      sourceKind: 'FILE',
      dataMode: 'Hybrid',
      contentSha256: actualHash,
      byteSize: input.bytes.byteLength,
      mediaType: input.mediaType,
      displayName: input.fileName,
      createdAt,
      status: 'QUARANTINED',
      scanState: 'PENDING',
    });
    if (!artifact.accepted) {
      console.error('artifact invalid', artifact);
      return rejected('LOCAL_INTAKE_INVALID_INPUT');
    }
    const artifactValue = artifact.value;
    const placement = createContentPlacementV1({
      placementId,
      artifactVersion: artifactValue,
      tenantScope: context.tenantScope,
      kind: 'CLOUD',
      opaqueReference: `local-${versionId}`,
      contentSha256: actualHash,
      available: true,
      revision: 1,
    });
    if (!placement.accepted) {
      console.error('placement invalid', placement);
      return rejected('LOCAL_INTAKE_INVALID_INPUT');
    }
    const placementValue = placement.value;
    const inbox = createInboxItemV1({
      inboxItemId,
      tenantScope: context.tenantScope,
      idempotencyKey: input.idempotencyKey,
      artifactVersionId: versionId,
      createdAt,
    });
    if (!inbox.accepted) {
      console.error('inbox invalid', inbox);
      return rejected('LOCAL_INTAKE_INVALID_INPUT');
    }
    const inboxValue = inbox.value;
    const objectKey = `local/web-intake/${workspaceScope.organizationId}/${workspaceScope.workspaceId}/${versionId}`;
    try {
      await this.options.objectStore.put({
        objectKey,
        bytes: input.bytes,
        contentSha256: actualHash,
        mediaType: input.mediaType,
      });
      await this.options.database.$transaction(async (transaction) => {
        await transaction.artifactVersion.create({
          data: {
            ...databaseScope(context.tenantScope),
            id: artifactValue.versionId,
            artifactId: artifactValue.artifactId,
            sourceKind: artifactValue.sourceKind,
            dataMode: artifactValue.dataMode,
            contentSha256: artifactValue.contentSha256,
            byteSize: BigInt(artifactValue.byteSize),
            mediaType: artifactValue.mediaType,
            displayName: artifactValue.displayName,
            createdAt: now,
            status: artifactValue.status,
            scanState: artifactValue.scanState,
          },
        });
        await transaction.contentPlacement.create({
          data: {
            ...databaseScope(context.tenantScope),
            id: placementValue.placementId,
            artifactVersionId: placementValue.artifactVersionId,
            kind: placementValue.kind,
            opaqueReference: placementValue.opaqueReference,
            contentSha256: placementValue.contentSha256,
            available: true,
            revision: 1,
            createdAt: now,
            updatedAt: now,
          },
        });
        await transaction.inboxItem.create({
          data: {
            ...databaseScope(context.tenantScope),
            id: inboxValue.inboxItemId,
            idempotencyKey: inboxValue.idempotencyKey,
            artifactVersionId: inboxValue.artifactVersionId,
            state: inboxValue.state,
            labels: [],
            priority: 'NORMAL',
            createdAt: now,
            revision: 1,
          },
        });
      });
    } catch {
      await this.options.objectStore.delete(objectKey).catch(() => undefined);
      return rejected('LOCAL_INTAKE_UNAVAILABLE');
    }
    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        sessionId: inboxItemId,
        inboxItemId,
        artifactVersionId: versionId,
        status: 'PENDING_REVIEW' as const,
        replayed: false,
      }),
    });
  }
}

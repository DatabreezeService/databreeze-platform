import { createHash, randomUUID } from 'node:crypto';

import {
  createDataModePolicyVersionV1,
  type DataModePolicyVersionV1,
} from '@databreeze/domain/data-mode/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { InitialWorkspacePolicyProvisionerPortV1 } from '../../iam/application/initial-workspace-policy-provisioner.port.js';

interface VersionDelegateV1 {
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<readonly unknown[]>;
  findUnique(input: { readonly where: { readonly id: string } }): Promise<unknown>;
  create(input: { readonly data: Readonly<Record<string, unknown>> }): Promise<unknown>;
}

interface PointerDelegateV1 {
  findFirst(input: { readonly where: Readonly<Record<string, unknown>> }): Promise<unknown>;
  create(input: { readonly data: Readonly<Record<string, unknown>> }): Promise<unknown>;
}

export interface InitialWorkspacePolicyDatabaseClientV1 {
  readonly deviceDataModePolicyRecord: VersionDelegateV1;
  readonly workspaceDataModePolicyRecord: PointerDelegateV1;
}

interface IdGeneratorV1 {
  next(): string;
}

const DEFAULT_PAYLOADS = Object.freeze({
  PUBLIC: Object.freeze(['CONTROL_METADATA', 'APPROVED_DERIVED_RESULT']),
  // Plan 408 / WEB-002: an explicit Owner upload is eligible for local-first
  // Hybrid intake when the source is classified INTERNAL. More sensitive
  // classifications remain metadata-only until an administrator narrows or
  // explicitly expands the workspace policy.
  INTERNAL: Object.freeze(['CONTROL_METADATA', 'APPROVED_DERIVED_RESULT', 'ORIGINAL_CONTENT']),
  CONFIDENTIAL: Object.freeze(['CONTROL_METADATA']),
  RESTRICTED: Object.freeze(['CONTROL_METADATA']),
});
const DEFAULT_PLACEMENTS = Object.freeze(['LOCAL', 'CLOUD']);
const DEFAULT_EXECUTORS = Object.freeze(['DESKTOP', 'CLOUD']);
const DEFAULT_DESTINATIONS = Object.freeze(['WEB', 'DESKTOP']);

function canonicalHash(input: Readonly<Record<string, unknown>>): string {
  return createHash('sha256').update(JSON.stringify(input), 'utf8').digest('hex');
}

function stableId(value: string): string {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('DSO_INITIAL_WORKSPACE_POLICY_INVALID');
  return parsed.value;
}

function createInitialPolicy(input: {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly policyId: string;
  readonly policyVersionId: string;
  readonly publishedAt: string;
}): DataModePolicyVersionV1 {
  const canonicalInput = Object.freeze({
    schemaVersion: 1,
    policyId: input.policyId,
    policyVersionId: input.policyVersionId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    revision: 1,
    mode: 'HYBRID',
    allowedPayloadClasses: DEFAULT_PAYLOADS,
    allowedPlacementKinds: DEFAULT_PLACEMENTS,
    allowedExecutorClasses: DEFAULT_EXECUTORS,
    allowedDestinationClasses: DEFAULT_DESTINATIONS,
    publishedAt: input.publishedAt,
  });
  const parsed = createDataModePolicyVersionV1({
    ...canonicalInput,
    canonicalHash: canonicalHash(canonicalInput),
  });
  if (!parsed.accepted) throw new Error('DSO_INITIAL_WORKSPACE_POLICY_INVALID');
  return parsed.value;
}

function policyFromRow(value: unknown): DataModePolicyVersionV1 | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const row = value as Record<string, unknown>;
  const publishedAt = row['publishedAt'];
  const parsed = createDataModePolicyVersionV1({
    policyId: row['policyId'],
    policyVersionId: row['id'],
    organizationId: row['organizationId'],
    workspaceId: row['workspaceId'],
    revision: row['revision'],
    mode: row['mode'],
    allowedPayloadClasses: row['allowedPayloadClasses'],
    allowedPlacementKinds: row['allowedPlacementKinds'],
    allowedExecutorClasses: row['allowedExecutorClasses'],
    allowedDestinationClasses: row['allowedDestinationClasses'],
    canonicalHash: row['canonicalHash'],
    publishedAt: publishedAt instanceof Date ? publishedAt.toISOString() : publishedAt,
  });
  return parsed.accepted ? parsed.value : undefined;
}

function versionData(policy: DataModePolicyVersionV1): Readonly<Record<string, unknown>> {
  return Object.freeze({
    id: policy.policyVersionId,
    policyId: policy.policyId,
    organizationId: policy.organizationId,
    workspaceId: policy.workspaceId,
    revision: policy.revision,
    mode: policy.mode,
    allowedPayloadClasses: policy.allowedPayloadClasses,
    allowedPlacementKinds: policy.allowedPlacementKinds,
    allowedExecutorClasses: policy.allowedExecutorClasses,
    allowedDestinationClasses: policy.allowedDestinationClasses,
    canonicalHash: policy.canonicalHash,
    publishedAt: new Date(policy.publishedAt),
  });
}

/** DSO-008/027: transaction-bound, creation-only personal Workspace default authority. */
export class PrismaInitialWorkspacePolicyProvisionerAdapter
  implements InitialWorkspacePolicyProvisionerPortV1
{
  public constructor(
    private readonly database: InitialWorkspacePolicyDatabaseClientV1,
    private readonly ids: IdGeneratorV1 = { next: randomUUID },
  ) {}

  public async provision(
    input: Parameters<InitialWorkspacePolicyProvisionerPortV1['provision']>[0],
  ): ReturnType<InitialWorkspacePolicyProvisionerPortV1['provision']> {
    const organizationId = stableId(input.organizationId);
    const workspaceId = stableId(input.workspaceId);
    if (!parseStrictUtcTimestampV1(input.publishedAt).accepted)
      throw new Error('DSO_INITIAL_WORKSPACE_POLICY_INVALID');

    const currentValue = await this.database.workspaceDataModePolicyRecord.findFirst({
      where: { organizationId, workspaceId },
    });
    if (currentValue !== null) {
      if (typeof currentValue !== 'object')
        throw new Error('DSO_INITIAL_WORKSPACE_POLICY_CONFLICT');
      const current = currentValue as Record<string, unknown>;
      if (
        current['organizationId'] !== organizationId ||
        current['workspaceId'] !== workspaceId ||
        current['revision'] !== 1 ||
        typeof current['id'] !== 'string' ||
        typeof current['currentVersionId'] !== 'string'
      )
        throw new Error('DSO_INITIAL_WORKSPACE_POLICY_CONFLICT');
      const row = await this.database.deviceDataModePolicyRecord.findUnique({
        where: { id: current['currentVersionId'] },
      });
      const policy = policyFromRow(row);
      if (
        !policy ||
        policy.policyId !== current['id'] ||
        policy.organizationId !== organizationId ||
        policy.workspaceId !== workspaceId ||
        policy.revision !== 1 ||
        policy.mode !== 'HYBRID' ||
        policy.canonicalHash !== current['currentVersionHash']
      )
        throw new Error('DSO_INITIAL_WORKSPACE_POLICY_CONFLICT');
      return Object.freeze({
        policyId: policy.policyId,
        policyVersionId: policy.policyVersionId,
        dataModeProjection: policy.mode,
      });
    }

    const scopedVersions = await this.database.deviceDataModePolicyRecord.findMany({
      where: { organizationId, workspaceId },
    });
    if (scopedVersions.length !== 0) throw new Error('DSO_INITIAL_WORKSPACE_POLICY_CONFLICT');

    const policy = createInitialPolicy({
      organizationId,
      workspaceId,
      policyId: stableId(this.ids.next()),
      policyVersionId: stableId(this.ids.next()),
      publishedAt: input.publishedAt,
    });
    await this.database.deviceDataModePolicyRecord.create({ data: versionData(policy) });
    await this.database.workspaceDataModePolicyRecord.create({
      data: {
        id: policy.policyId,
        organizationId,
        workspaceId,
        currentVersionId: policy.policyVersionId,
        currentVersionHash: policy.canonicalHash,
        revision: 1,
      },
    });
    return Object.freeze({
      policyId: policy.policyId,
      policyVersionId: policy.policyVersionId,
      dataModeProjection: policy.mode,
    });
  }
}

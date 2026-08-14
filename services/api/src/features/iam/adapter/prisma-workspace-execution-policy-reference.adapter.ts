import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  WorkspaceExecutionPolicyReferenceAuthorityPortV1,
  WorkspaceExecutionPolicyReferenceV1,
} from '../application/workspace-execution-policy-reference.port.js';

interface WorkspaceReferenceRowV1 {
  readonly id: string;
  readonly organizationId: string;
  readonly dataModePolicyId: string | null;
  readonly currentDataModePolicyVersionId: string | null;
  readonly dataModeProjection: string | null;
  readonly authorizationEpoch: number;
}

export interface WorkspaceExecutionPolicyReferenceDatabaseClientV1 {
  readonly workspaceIdentity: {
    findFirst(input: {
      readonly where: Readonly<Record<string, unknown>>;
    }): Promise<WorkspaceReferenceRowV1 | null>;
  };
}

function fromRow(row: WorkspaceReferenceRowV1): WorkspaceExecutionPolicyReferenceV1 | undefined {
  const organizationId = parseStableIdentifierV1(row.organizationId);
  const workspaceId = parseStableIdentifierV1(row.id);
  const policyId = parseStableIdentifierV1(row.dataModePolicyId);
  const versionId = parseStableIdentifierV1(row.currentDataModePolicyVersionId);
  if (
    !organizationId.accepted ||
    !workspaceId.accepted ||
    !policyId.accepted ||
    !versionId.accepted ||
    (row.dataModeProjection !== 'LOCAL' &&
      row.dataModeProjection !== 'HYBRID' &&
      row.dataModeProjection !== 'CLOUD') ||
    !Number.isSafeInteger(row.authorizationEpoch) ||
    row.authorizationEpoch < 1
  )
    return undefined;
  return Object.freeze({
    organizationId: organizationId.value,
    workspaceId: workspaceId.value,
    dataModePolicyId: policyId.value,
    currentDataModePolicyVersionId: versionId.value,
    dataModeProjection: row.dataModeProjection,
    authorizationEpoch: row.authorizationEpoch,
  });
}

export class PrismaWorkspaceExecutionPolicyReferenceAuthorityAdapter
  implements WorkspaceExecutionPolicyReferenceAuthorityPortV1
{
  public constructor(
    private readonly database: WorkspaceExecutionPolicyReferenceDatabaseClientV1,
  ) {}

  public async resolveExact(
    input: Parameters<WorkspaceExecutionPolicyReferenceAuthorityPortV1['resolveExact']>[0],
  ): Promise<WorkspaceExecutionPolicyReferenceV1 | undefined> {
    try {
      const row = await this.database.workspaceIdentity.findFirst({
        where: { id: input.workspaceId, organizationId: input.organizationId },
      });
      if (row === null) return undefined;
      const reference = fromRow(row);
      return reference?.organizationId === input.organizationId &&
        reference.workspaceId === input.workspaceId
        ? reference
        : undefined;
    } catch {
      return undefined;
    }
  }
}

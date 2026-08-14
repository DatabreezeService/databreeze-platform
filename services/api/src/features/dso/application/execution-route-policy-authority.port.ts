import type { DataModePolicyVersionV1 } from '@databreeze/domain/data-mode/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

export interface CurrentExecutionRouteWorkspacePolicyV1 {
  readonly policy: DataModePolicyVersionV1;
  readonly authorizationEpoch: number;
}

/**
 * DSO-026/027: root composition supplies the authoritative current Workspace policy and IAM
 * authorization epoch. It returns no content, paths, locations, credentials, or inferred policy.
 */
export interface ExecutionRouteWorkspacePolicyAuthorityPortV1 {
  resolveCurrentWorkspacePolicy(input: {
    readonly organizationId: StableIdentifierV1;
    readonly workspaceId: StableIdentifierV1;
  }): Promise<CurrentExecutionRouteWorkspacePolicyV1 | undefined>;
}

export class UnavailableExecutionRouteWorkspacePolicyAuthority
  implements ExecutionRouteWorkspacePolicyAuthorityPortV1
{
  public resolveCurrentWorkspacePolicy(
    _input: Parameters<
      ExecutionRouteWorkspacePolicyAuthorityPortV1['resolveCurrentWorkspacePolicy']
    >[0],
  ): Promise<undefined> {
    void _input;
    return Promise.resolve(undefined);
  }
}

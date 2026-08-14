import type { DataModePolicyVersionV1 } from '@databreeze/domain/data-mode/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

export interface DataModePolicyVersionLookupPortV1 {
  findExact(input: {
    readonly organizationId: StableIdentifierV1;
    readonly workspaceId: StableIdentifierV1;
    readonly policyId: StableIdentifierV1;
    readonly policyVersionId: StableIdentifierV1;
  }): Promise<DataModePolicyVersionV1 | undefined>;
}

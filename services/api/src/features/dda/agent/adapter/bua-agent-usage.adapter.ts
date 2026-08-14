import type { EntitlementAdmissionInputV1 } from '../../../bua/application/entitlement-admission.service.js';
import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type {
  AgentUsageAdmissionInputV1,
  AgentUsageAdmissionV1,
  AgentUsagePortV1,
} from '../application/agent-runtime.port.js';

export type AgentUsageAdmissionResolutionV1 = Pick<
  EntitlementAdmissionInputV1,
  'snapshotId' | 'feature' | 'reservationId' | 'entryId' | 'metric' | 'requestedUnits'
>;

export interface AgentUsageAdmissionResolverPortV1 {
  /** Resolves entitlement identifiers and units from server-owned policy, never model input. */
  resolve(input: AgentUsageAdmissionInputV1): Promise<AgentUsageAdmissionResolutionV1 | undefined>;
}

export interface AgentUsageAdmissionPortV1 {
  admit(
    context: IamTenantContextV1,
    input: EntitlementAdmissionInputV1,
  ): Promise<{ readonly accepted: true; readonly value: unknown } | { readonly accepted: false }>;
}

function denied(): AgentUsageAdmissionV1 {
  return Object.freeze({ allowed: false, code: 'BUDGET_DENIED' as const });
}

/** BUA-005/008: admits agent usage only through a server-owned entitlement mapping. */
export class BuaAgentUsageAdapter implements AgentUsagePortV1 {
  public constructor(
    private readonly admission: AgentUsageAdmissionPortV1,
    private readonly resolver: AgentUsageAdmissionResolverPortV1,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  public async admit(input: AgentUsageAdmissionInputV1): Promise<AgentUsageAdmissionV1> {
    try {
      const resolution = await this.resolver.resolve(input);
      if (resolution === undefined) return denied();
      const result = await this.admission.admit(input.context, {
        ...resolution,
        tenantScope: input.context.tenantScope,
        idempotencyKey: input.correlationId,
        now: this.clock(),
      });
      if (!result.accepted) return denied();
      return Object.freeze({ allowed: true as const });
    } catch {
      return denied();
    }
  }
}

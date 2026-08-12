import { createHash, randomUUID } from 'node:crypto';

import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { StarterDashboardTemplateRegistry } from './starter-dashboard-template.registry.js';
import type {
  StarterDashboardProblemCodeV1,
  StarterDashboardProfileV1,
  StarterDashboardRecordV1,
} from './starter-dashboard.types.js';

export type StarterDashboardResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: StarterDashboardProblemCodeV1 };

export interface StarterDashboardDependenciesV1 {
  readonly registry: StarterDashboardTemplateRegistry;
  readonly savePrivateDashboard: (
    record: StarterDashboardRecordV1,
  ) => Promise<StarterDashboardRecordV1>;
  readonly queueMaterialization: (dashboardVersionId: string) => Promise<void>;
  readonly findExistingForDatasetVersion: (
    datasetVersionId: string,
  ) => Promise<StarterDashboardRecordV1 | undefined>;
}

function rejected(code: StarterDashboardProblemCodeV1): StarterDashboardResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

/** DDA-054: create private deterministic starter dashboards. */
export class StarterDashboardService {
  readonly #idempotency = new Map<string, StarterDashboardRecordV1>();

  public constructor(private readonly deps: StarterDashboardDependenciesV1) {}

  public async createStarterDashboard(
    context: { readonly tenantScope: TenantScopeV1; readonly memberAuthorized: boolean },
    input: {
      readonly datasetVersionId: string;
      readonly policyVersionId: string;
      readonly profile: StarterDashboardProfileV1;
      readonly roles: Readonly<Record<string, string>>;
      readonly units: Readonly<Record<string, string>>;
      readonly grains: readonly string[];
      readonly idempotencyKey: string;
      readonly restrictedMetrics?: readonly string[];
    },
  ): Promise<StarterDashboardResultV1<StarterDashboardRecordV1>> {
    void context.tenantScope;
    void input.policyVersionId;
    if (!context.memberAuthorized) return rejected('UNAUTHORIZED');

    const cached = this.#idempotency.get(input.idempotencyKey);
    if (cached) return Object.freeze({ accepted: true, value: cached });

    const existing = await this.deps.findExistingForDatasetVersion(input.datasetVersionId);
    if (existing) {
      this.#idempotency.set(input.idempotencyKey, existing);
      return Object.freeze({ accepted: true, value: existing });
    }

    const matched = this.deps.registry.match({
      profile: input.profile,
      roles: input.roles,
      units: input.units,
      grains: input.grains,
    });
    if (!matched.accepted) return rejected(matched.code);

    const measure = input.roles['measure'];
    if (measure && input.restrictedMetrics?.includes(measure)) {
      return rejected('RESTRICTED_METRIC');
    }

    const dashboardVersionId = randomUUID();
    void createHash;
    const record: StarterDashboardRecordV1 = Object.freeze({
      dashboardVersionId,
      datasetVersionId: input.datasetVersionId,
      templateId: matched.value.templateId,
      visibility: 'PRIVATE',
      published: false,
      aiUsed: false,
    });
    const saved = await this.deps.savePrivateDashboard(record);
    await this.deps.queueMaterialization(saved.dashboardVersionId);
    this.#idempotency.set(input.idempotencyKey, saved);
    return Object.freeze({ accepted: true, value: saved });
  }

  public async loadDatasetCanvas(
    context: { readonly tenantScope: TenantScopeV1; readonly memberAuthorized: boolean },
    datasetVersionId: string,
  ): Promise<StarterDashboardResultV1<StarterDashboardRecordV1>> {
    void context.tenantScope;
    if (!context.memberAuthorized) return rejected('UNAUTHORIZED');
    const existing = await this.deps.findExistingForDatasetVersion(datasetVersionId);
    if (!existing) return rejected('NO_SAFE_TEMPLATE');
    return Object.freeze({ accepted: true, value: existing });
  }
}

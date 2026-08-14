import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type {
  DashboardAuthActionV1,
  DashboardAuthorizationPortV1,
} from './dashboard-authorization.port.js';

export type DashboardQueryErrorV1 = 'UNAUTHORIZED';

export type DashboardQueryResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DashboardQueryErrorV1 };

/** DDA-026: re-authorize every interactive dashboard read without permission expansion. */
export class DashboardQueryServiceV1 {
  public constructor(private readonly authorization: DashboardAuthorizationPortV1) {}

  public async authorizeAction(
    context: IamTenantContextV1,
    input: { readonly snapshotId: string; readonly action: DashboardAuthActionV1 },
  ): Promise<DashboardQueryResultV1<{ readonly allowed: true }>> {
    const decision = await this.authorization.authorizeDashboardAction({
      context,
      tenantScope: context.tenantScope,
      actorId: context.actorId,
      snapshotId: input.snapshotId,
      action: input.action,
    });
    if (!decision.allowed) return Object.freeze({ accepted: false, code: 'UNAUTHORIZED' as const });
    return Object.freeze({ accepted: true, value: Object.freeze({ allowed: true as const }) });
  }

  public async view(
    context: IamTenantContextV1,
    input: {
      readonly snapshotId: string;
      readonly rows: readonly Record<string, string>[];
    },
  ): Promise<
    DashboardQueryResultV1<{
      readonly rows: readonly Record<string, string>[];
      readonly permissionExpansion: {
        readonly grantsDatasetAccess: false;
        readonly grantsOriginalAccess: false;
        readonly grantsEvidenceAccess: false;
        readonly grantsAnalysisAccess: false;
        readonly grantsFolderAccess: false;
      };
      readonly deniedFieldsExposed: false;
    }>
  > {
    const decision = await this.authorization.authorizeDashboardAction({
      context,
      tenantScope: context.tenantScope,
      actorId: context.actorId,
      snapshotId: input.snapshotId,
      action: 'VIEW',
    });
    if (!decision.allowed) return Object.freeze({ accepted: false, code: 'UNAUTHORIZED' as const });

    const visible = new Set(
      await this.authorization.projectVisibleFields({
        context,
        tenantScope: context.tenantScope,
        actorId: context.actorId,
        snapshotId: input.snapshotId,
      }),
    );
    const rows = input.rows.map((row) => {
      const projected: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        if (visible.has(key)) projected[key] = value;
      }
      return Object.freeze(projected);
    });

    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        rows: Object.freeze(rows),
        permissionExpansion: Object.freeze({
          grantsDatasetAccess: false as const,
          grantsOriginalAccess: false as const,
          grantsEvidenceAccess: false as const,
          grantsAnalysisAccess: false as const,
          grantsFolderAccess: false as const,
        }),
        deniedFieldsExposed: false as const,
      }),
    });
  }
}

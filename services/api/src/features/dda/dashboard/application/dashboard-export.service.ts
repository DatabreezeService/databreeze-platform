import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type { DashboardAuthorizationPortV1 } from './dashboard-authorization.port.js';

export type DashboardExportResultV1 =
  | {
      readonly accepted: true;
      readonly value: {
        readonly csvRows: readonly Record<string, string>[];
        readonly json: {
          readonly chartSpec: Readonly<Record<string, unknown>>;
          readonly metadata: { readonly snapshotId: string };
          readonly provenanceManifest: {
            readonly permissionFiltered: true;
            readonly broaderSourceAccess: false;
          };
        };
      };
    }
  | { readonly accepted: false; readonly code: 'UNAUTHORIZED' };

/** DDA-049: permission-filtered open-format export with download reauthorization. */
export class DashboardExportServiceV1 {
  public constructor(private readonly authorization: DashboardAuthorizationPortV1) {}

  public async export(
    context: IamTenantContextV1,
    input: {
      readonly snapshotId: string;
      readonly rows: readonly Record<string, string>[];
      readonly chartSpec: Readonly<Record<string, unknown>>;
    },
  ): Promise<DashboardExportResultV1> {
    const decision = await this.authorization.authorizeDashboardAction({
      tenantScope: context.tenantScope,
      actorId: context.actorId,
      snapshotId: input.snapshotId,
      action: 'DOWNLOAD',
    });
    if (!decision.allowed) return Object.freeze({ accepted: false, code: 'UNAUTHORIZED' as const });

    const visible = new Set(
      await this.authorization.projectVisibleFields({
        tenantScope: context.tenantScope,
        actorId: context.actorId,
        snapshotId: input.snapshotId,
      }),
    );
    const csvRows = input.rows.map((row) => {
      const projected: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        if (visible.has(key)) projected[key] = value;
      }
      return Object.freeze(projected);
    });

    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        csvRows: Object.freeze(csvRows),
        json: Object.freeze({
          chartSpec: input.chartSpec,
          metadata: Object.freeze({ snapshotId: input.snapshotId }),
          provenanceManifest: Object.freeze({
            permissionFiltered: true as const,
            broaderSourceAccess: false as const,
          }),
        }),
      }),
    });
  }
}

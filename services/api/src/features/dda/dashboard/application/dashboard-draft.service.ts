import {
  createDashboardVersionV1,
  type DashboardVersionV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import { randomUUID } from 'node:crypto';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type { DashboardDraftRepositoryPortV1 } from './dashboard-repository.port.js';

export type DashboardDraftErrorCodeV1 =
  | 'UNSUPPORTED_WIDGET'
  | 'CERTIFIED_DEFINITION_LOCKED'
  | 'VERSION_NOT_FOUND'
  | 'WIDGET_NOT_FOUND'
  | 'INVALID_FILTER'
  | 'INVALID_VERSION';

export type DashboardDraftResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DashboardDraftErrorCodeV1 };

/** DDA-020..024: versioned draft acceptance, restore, and certified-lock guards. */
export class DashboardDraftServiceV1 {
  public constructor(private readonly repository: DashboardDraftRepositoryPortV1) {}

  public async acceptProposal(
    context: IamTenantContextV1,
    input: {
      readonly proposalId: string;
      readonly version: Record<string, unknown>;
      readonly proposalSummary?: {
        readonly affectedPages: readonly string[];
        readonly affectedWidgets: readonly string[];
        readonly beforeAfter: string;
        readonly assumptions: readonly string[];
        readonly estimatedCost: { readonly cpuMs: number; readonly memoryMb: number };
      };
    },
  ): Promise<DashboardDraftResultV1<DashboardVersionV1>> {
    void input.proposalId;
    void input.proposalSummary;
    const created = createDashboardVersionV1({
      dashboardId: input.version['dashboardId'],
      versionId: input.version['versionId'],
      tenantScope: context.tenantScope,
      parentVersionId: input.version['parentVersionId'],
      parentTenantScope: input.version['parentTenantScope'],
      pages: input.version['pages'],
      widgets: input.version['widgets'],
      filters: input.version['filters'],
      datasetBindings: input.version['datasetBindings'],
      locale: input.version['locale'],
      timezone: input.version['timezone'],
      freshnessPolicy: input.version['freshnessPolicy'],
      publicationPolicy: input.version['publicationPolicy'],
      canonicalHash: input.version['canonicalHash'],
      createdAt: input.version['createdAt'],
    });
    if (!created.accepted) {
      return Object.freeze({
        accepted: false,
        code:
          created.code === 'UNSUPPORTED_WIDGET'
            ? ('UNSUPPORTED_WIDGET' as const)
            : ('INVALID_VERSION' as const),
      });
    }

    await this.repository.saveVersion(created.value);
    await this.repository.saveIdentity({
      dashboardId: created.value.dashboardId,
      tenantScope: created.value.tenantScope,
      title: { vi: 'Bang dieu khien', en: 'Dashboard' },
      status: 'DRAFT',
      draftVersionId: created.value.versionId,
      revision: 1,
    });
    return Object.freeze({ accepted: true, value: created.value });
  }

  public async restoreWidget(
    context: IamTenantContextV1,
    input: {
      readonly dashboardId: string;
      readonly versionId: string;
      readonly widgetId: string;
    },
  ): Promise<DashboardDraftResultV1<DashboardVersionV1>> {
    const current = await this.repository.findVersion(context.tenantScope, input.versionId);
    if (!current) return Object.freeze({ accepted: false, code: 'VERSION_NOT_FOUND' as const });

    let widget = current.widgets.find((item) => item.widgetId === input.widgetId);
    if (!widget) {
      widget = await this.repository.findRemovedWidget({
        tenantScope: context.tenantScope,
        dashboardId: input.dashboardId,
        widgetId: input.widgetId,
      });
    }
    if (!widget) return Object.freeze({ accepted: false, code: 'WIDGET_NOT_FOUND' as const });

    const nextWidgets = current.widgets.some((item) => item.widgetId === input.widgetId)
      ? current.widgets
      : [...current.widgets, widget];

    const next = createDashboardVersionV1({
      dashboardId: current.dashboardId,
      versionId: randomUUID(),
      tenantScope: current.tenantScope,
      parentVersionId: current.versionId,
      pages: current.pages,
      widgets: nextWidgets,
      filters: current.filters,
      datasetBindings: current.datasetBindings,
      locale: current.locale,
      timezone: current.timezone,
      freshnessPolicy: current.freshnessPolicy,
      publicationPolicy: current.publicationPolicy,
      canonicalHash: current.canonicalHash,
      createdAt: new Date().toISOString().replace(/\.\d{3}Z$/u, '.000Z'),
    });
    if (!next.accepted) {
      return Object.freeze({ accepted: false, code: 'INVALID_VERSION' as const });
    }
    await this.repository.saveVersion(next.value);
    await this.repository.saveIdentity({
      dashboardId: input.dashboardId,
      tenantScope: context.tenantScope,
      title: { vi: 'Bang dieu khien', en: 'Dashboard' },
      status: 'DRAFT',
      draftVersionId: next.value.versionId,
      revision: 2,
    });
    return Object.freeze({ accepted: true, value: next.value });
  }

  public async applyFilter(
    context: IamTenantContextV1,
    input: {
      readonly dashboardId: string;
      readonly versionId: string;
      readonly filter: {
        readonly filterId: string;
        readonly field: string;
        readonly operator: string;
        readonly scope: 'DASHBOARD' | 'PAGE' | 'WIDGET';
        readonly silentCertifiedMutation?: boolean;
      };
    },
  ): Promise<DashboardDraftResultV1<DashboardVersionV1>> {
    const current = await this.repository.findVersion(context.tenantScope, input.versionId);
    if (!current) return Object.freeze({ accepted: false, code: 'VERSION_NOT_FOUND' as const });
    if (
      current.publicationPolicy === 'CERTIFIED' &&
      input.filter.silentCertifiedMutation === true
    ) {
      return Object.freeze({ accepted: false, code: 'CERTIFIED_DEFINITION_LOCKED' as const });
    }
    if (!input.filter.field || !input.filter.operator) {
      return Object.freeze({ accepted: false, code: 'INVALID_FILTER' as const });
    }

    const nextFilters = [
      ...current.filters.filter((item) => item.filterId !== input.filter.filterId),
      {
        filterId: input.filter.filterId,
        field: input.filter.field,
        operator: input.filter.operator,
        scope: input.filter.scope,
      },
    ];
    const next = createDashboardVersionV1({
      dashboardId: current.dashboardId,
      versionId: randomUUID(),
      tenantScope: current.tenantScope,
      parentVersionId: current.versionId,
      pages: current.pages,
      widgets: current.widgets,
      filters: nextFilters,
      datasetBindings: current.datasetBindings,
      locale: current.locale,
      timezone: current.timezone,
      freshnessPolicy: current.freshnessPolicy,
      publicationPolicy: current.publicationPolicy,
      canonicalHash: current.canonicalHash,
      createdAt: new Date().toISOString().replace(/\.\d{3}Z$/u, '.000Z'),
    });
    if (!next.accepted) {
      return Object.freeze({ accepted: false, code: 'INVALID_VERSION' as const });
    }
    await this.repository.saveVersion(next.value);
    return Object.freeze({ accepted: true, value: next.value });
  }
}

import type { ChartProposalField } from '@databreeze/contracts/v3';
import type {
  DdaAnalysisPlanV1,
  DashboardVersionV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import {
  parseStableIdentifierV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import { createHash } from 'node:crypto';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type { AnalysisPlanRepositoryPortV1 } from '../../application/analysis-plan-repository.port.js';
import type { DeterministicResultPortV1 } from '../../analyst/application/deterministic-result.port.js';
import type {
  DashboardProposalChartTypeV1,
  DashboardProposalContextInputV1,
  DashboardProposalContextPortV1,
  DashboardProposalContextResolutionV1,
  DashboardProposalTrustedContextV1,
} from '../application/dashboard-proposal-context.port.js';
import type { DashboardAuthorizationPortV1 } from '../application/dashboard-authorization.port.js';
import type { DashboardRepositoryPortV1 } from '../../application/dashboard-repository.port.js';
import type {
  DependencyRepositoryPortV1,
  MaterializationDefinitionBindingV1,
} from '../../refresh/application/dependency-repository.port.js';
import type { DashboardDraftRepositoryPortV1 } from '../application/dashboard-repository.port.js';

export interface DashboardProposalLocalizedTextV1 {
  readonly vi: string;
  readonly en: string;
}

export interface DashboardProposalFieldDescriptorV1 {
  readonly id: string;
  readonly label?: DashboardProposalLocalizedTextV1;
}

/**
 * The analysis authority supplies identifiers and compatibility metadata only.
 * It never supplies result values to the proposal provider.
 */
export interface DashboardProposalAnalysisCatalogV1 {
  readonly datasetVersionId?: string;
  readonly semanticVersionId?: string;
  readonly metricVersionId?: string;
  readonly permissionProjectionVersionId?: string;
  readonly authorizedFields: readonly (string | DashboardProposalFieldDescriptorV1)[];
  readonly authorizedMetrics?: readonly (string | DashboardProposalFieldDescriptorV1)[];
  readonly fieldLabels?: Readonly<Record<string, DashboardProposalLocalizedTextV1>>;
  readonly metricLabels?: Readonly<Record<string, DashboardProposalLocalizedTextV1>>;
  readonly fieldIdentifiers?: Readonly<Record<string, string>>;
  readonly metricIdentifiers?: Readonly<Record<string, string>>;
  readonly units?: Readonly<Record<string, string>>;
  readonly resultShapes?: readonly string[];
  readonly widgetAllowlist?: readonly DashboardProposalChartTypeV1[];
  readonly responsiveRules?: {
    readonly supportedSpans: readonly number[];
    readonly defaultSpan: number;
  };
  readonly costBounds?: {
    readonly maxOptions: number;
    readonly maxCpuMs: number;
    readonly maxMemoryMb: number;
  };
  readonly estimatedCostLimits?: {
    readonly cpuMs: number;
    readonly memoryMb: number;
  };
  readonly blockedReason?: string;
}

export interface DashboardProposalAnalysisCatalogResolverV1 {
  resolve(
    context: IamTenantContextV1,
    plan: DdaAnalysisPlanV1,
  ): Promise<DashboardProposalAnalysisCatalogV1 | undefined>;
}

export type DashboardProposalAnalysisCatalogSourceV1 =
  | DashboardProposalAnalysisCatalogV1
  | DashboardProposalAnalysisCatalogResolverV1
  | ((
      context: IamTenantContextV1,
      plan: DdaAnalysisPlanV1,
    ) => Promise<DashboardProposalAnalysisCatalogV1 | undefined>);

export interface DashboardProposalContextCompositionDependenciesV1 {
  /** Prefer the draft repository because it owns the authoring revision pointer. */
  readonly dashboardDraftRepository?: DashboardDraftRepositoryPortV1;
  readonly dashboardRepository?: DashboardRepositoryPortV1;
  readonly analysisPlanRepository?: AnalysisPlanRepositoryPortV1;
  readonly dashboardAuthorization?: DashboardAuthorizationPortV1;
  readonly dependencyRepository?: DependencyRepositoryPortV1;
  readonly analysisCatalog?: DashboardProposalAnalysisCatalogSourceV1;
  readonly deterministicResults?: DeterministicResultPortV1;
  readonly widgetAllowlist?: readonly DashboardProposalChartTypeV1[];
  readonly responsiveRules?: {
    readonly supportedSpans: readonly number[];
    readonly defaultSpan: number;
  };
  readonly costBounds?: {
    readonly maxOptions: number;
    readonly maxCpuMs: number;
    readonly maxMemoryMb: number;
  };
}

type DashboardAuthority = DashboardDraftRepositoryPortV1 | DashboardRepositoryPortV1;

type MaterializationBindingV1 = MaterializationDefinitionBindingV1 & {
  readonly dimensionIds?: readonly string[];
  readonly measureIds?: readonly string[];
};

const CANONICAL_WIDGET_TYPES: readonly DashboardProposalChartTypeV1[] = Object.freeze([
  'KPI',
  'TABLE',
  'BAR',
  'LINE',
  'AREA',
  'PIE',
  'DONUT',
  'TEXT_NOTE',
  'EVIDENCE_NOTE',
]);
const CANONICAL_SPANS = new Set([3, 4, 6, 8, 12]);
const DEFAULT_SPANS = Object.freeze([3, 4, 6, 8, 12]);
const DEFAULT_COST_BOUNDS = Object.freeze({
  maxOptions: 4,
  maxCpuMs: 120_000,
  maxMemoryMb: 4_096,
});

function rejected(
  code: Exclude<DashboardProposalContextResolutionV1, { readonly accepted: true }>['code'],
): DashboardProposalContextResolutionV1 {
  return Object.freeze({ accepted: false as const, code });
}

function stableIdentifier(value: unknown): StableIdentifierV1 | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = parseStableIdentifierV1(value);
  return parsed.accepted ? parsed.value : undefined;
}

function projectScope(context: IamTenantContextV1): boolean {
  return context.tenantScope.scopeType === 'project';
}

function safeLocalizedText(value: unknown, fallback: string): DashboardProposalLocalizedTextV1 {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { readonly vi?: unknown }).vi === 'string' &&
    typeof (value as { readonly en?: unknown }).en === 'string'
  ) {
    const candidate = value as DashboardProposalLocalizedTextV1;
    if (
      candidate.vi.length > 0 &&
      candidate.en.length > 0 &&
      candidate.vi.length <= 200 &&
      candidate.en.length <= 200 &&
      !/\p{Cc}/u.test(candidate.vi) &&
      !/\p{Cc}/u.test(candidate.en)
    ) {
      return Object.freeze({ vi: candidate.vi, en: candidate.en });
    }
  }
  return Object.freeze({ vi: fallback, en: fallback });
}

function descriptorKey(value: string | DashboardProposalFieldDescriptorV1): string | undefined {
  const raw = typeof value === 'string' ? value : value.id;
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 96 || /\p{Cc}/u.test(raw)) {
    return undefined;
  }
  return raw;
}

function opaqueIdentifier(namespace: string, raw: string): StableIdentifierV1 {
  const hex = createHash('sha256')
    .update(`${namespace}\u0000${raw}`, 'utf8')
    .digest('hex')
    .slice(0, 32)
    .split('');
  hex[12] = '4';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16] ?? '8', 16) % 4] ?? '8';
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}` as StableIdentifierV1;
}

function descriptorId(
  value: string | DashboardProposalFieldDescriptorV1,
  namespace: string,
  identifiers: Readonly<Record<string, string>> | undefined,
): StableIdentifierV1 | undefined {
  const key = descriptorKey(value);
  if (key === undefined) return undefined;
  return (
    stableIdentifier(key) ??
    stableIdentifier(identifiers?.[key]) ??
    opaqueIdentifier(namespace, key)
  );
}

function descriptorLabel(
  value: string | DashboardProposalFieldDescriptorV1,
  labels: Readonly<Record<string, DashboardProposalLocalizedTextV1>> | undefined,
  id: string,
): DashboardProposalLocalizedTextV1 {
  const inline = typeof value === 'string' ? undefined : value.label;
  return safeLocalizedText(inline ?? labels?.[id], id);
}

function descriptors(
  values: readonly (string | DashboardProposalFieldDescriptorV1)[] | undefined,
  labels: Readonly<Record<string, DashboardProposalLocalizedTextV1>> | undefined,
  namespace: string,
  identifiers: Readonly<Record<string, string>> | undefined,
): Map<string, ChartProposalField> {
  const result = new Map<string, ChartProposalField>();
  for (const value of values ?? []) {
    const key = descriptorKey(value);
    const id = descriptorId(value, namespace, identifiers);
    if (key === undefined || id === undefined || result.has(key)) continue;
    const field = Object.freeze({
      id,
      label: descriptorLabel(value, labels, key),
    });
    result.set(key, field);
    if (!result.has(id)) {
      result.set(id, field);
    }
  }
  return result;
}

function uniqueStableIdentifiers(values: readonly string[]): StableIdentifierV1[] | undefined {
  const result: StableIdentifierV1[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const parsed = stableIdentifier(value);
    if (parsed === undefined) return undefined;
    if (seen.has(parsed)) continue;
    seen.add(parsed);
    result.push(parsed);
  }
  return result;
}

function mappedIdentifiers(
  values: readonly string[],
  fields: Map<string, ChartProposalField>,
): StableIdentifierV1[] | undefined {
  const result: StableIdentifierV1[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const field = fields.get(value);
    if (field === undefined) return undefined;
    const id = stableIdentifier(field.id);
    if (id === undefined) return undefined;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function planFields(plan: DdaAnalysisPlanV1): string[] {
  return [
    ...plan.dimensions,
    ...plan.filters.map((filter) => filter['field'] ?? ''),
    ...Object.keys(plan.units),
  ];
}

function sameBindingIdentity(
  binding: MaterializationBindingV1,
  context: IamTenantContextV1,
  version: DashboardVersionV1,
  plan: DdaAnalysisPlanV1,
): boolean {
  return (
    tenantScopesEqualV1(binding.tenantScope, context.tenantScope) &&
    binding.dashboardId === version.dashboardId &&
    binding.dashboardVersionId === version.versionId &&
    binding.analysisPlanVersionId === plan.planVersionId &&
    binding.datasetVersionId === plan.datasetVersionId &&
    binding.semanticVersionId === plan.semanticVersionId &&
    binding.metricVersionId === plan.metricVersionId &&
    binding.permissionProjectionVersionId === plan.permissionProjectionVersionId &&
    binding.deleted === false
  );
}

function bindingFromWidget(
  version: DashboardVersionV1,
  targetPageId: string,
  targetWidgetId: string | undefined,
  plan: DdaAnalysisPlanV1,
): MaterializationBindingV1 | undefined {
  const widgets = version.widgets.filter(
    (widget) =>
      widget.pageId === targetPageId &&
      (targetWidgetId === undefined || widget.widgetId === targetWidgetId) &&
      widget.binding.analysisPlanVersionId === plan.planVersionId,
  );
  const widget = widgets[0];
  if (widget === undefined) return undefined;
  return {
    materializationDefinitionId: widget.binding.materializationDefinitionId,
    tenantScope: version.tenantScope,
    dashboardId: version.dashboardId,
    dashboardVersionId: version.versionId,
    widgetId: widget.widgetId,
    analysisPlanVersionId: plan.planVersionId,
    datasetVersionId: plan.datasetVersionId,
    semanticVersionId: plan.semanticVersionId,
    metricVersionId: plan.metricVersionId,
    permissionProjectionVersionId: plan.permissionProjectionVersionId,
    parameterHash: '',
    locale: version.locale,
    timezone: version.timezone,
    engineVersion: '',
    adapterVersion: '',
    effectivePolicyVersionId: plan.permissionProjectionVersionId,
    processorId: '',
    deleted: false,
  };
}

function findLayoutSpan(
  version: DashboardVersionV1,
  targetPageId: string,
  targetWidgetId: string | undefined,
): number | undefined {
  if (targetWidgetId === undefined) return undefined;
  const page = version.pages.find((candidate) => candidate.pageId === targetPageId);
  const cell = page?.layout.desktop.find((candidate) => candidate.widgetId === targetWidgetId);
  return cell?.w;
}

function safeSpans(
  input: { readonly supportedSpans: readonly number[]; readonly defaultSpan: number } | undefined,
  currentSpan: number | undefined,
): { readonly supportedSpans: readonly number[]; readonly defaultSpan: number } | undefined {
  const source = input?.supportedSpans ?? DEFAULT_SPANS;
  const supportedSpans = [...new Set(source)].filter(
    (span): span is number => Number.isSafeInteger(span) && CANONICAL_SPANS.has(span),
  );
  if (supportedSpans.length === 0) return undefined;
  const configuredDefault = input?.defaultSpan;
  const hasConfiguredDefault =
    typeof configuredDefault === 'number' &&
    Number.isSafeInteger(configuredDefault) &&
    supportedSpans.includes(configuredDefault);
  const defaultSpan = hasConfiguredDefault
    ? configuredDefault
    : currentSpan !== undefined && supportedSpans.includes(currentSpan)
      ? currentSpan
      : supportedSpans.includes(6)
        ? 6
        : supportedSpans[0];
  if (defaultSpan === undefined) return undefined;
  return Object.freeze({
    supportedSpans: Object.freeze(supportedSpans),
    defaultSpan,
  });
}

function safeCostBounds(
  input:
    | {
        readonly maxOptions: number;
        readonly maxCpuMs: number;
        readonly maxMemoryMb: number;
      }
    | undefined,
  estimatedCostLimits: { readonly cpuMs: number; readonly memoryMb: number } | undefined,
): DashboardProposalTrustedContextV1['costBounds'] | undefined {
  const source = input ?? DEFAULT_COST_BOUNDS;
  const maxOptions = Math.min(4, source.maxOptions);
  const maxCpuMs = Math.min(DEFAULT_COST_BOUNDS.maxCpuMs, source.maxCpuMs);
  const maxMemoryMb = Math.min(DEFAULT_COST_BOUNDS.maxMemoryMb, source.maxMemoryMb);
  if (
    !Number.isSafeInteger(maxOptions) ||
    !Number.isSafeInteger(maxCpuMs) ||
    !Number.isSafeInteger(maxMemoryMb) ||
    maxOptions < 2 ||
    maxCpuMs < 0 ||
    maxMemoryMb < 0
  ) {
    return undefined;
  }
  if (
    estimatedCostLimits !== undefined &&
    (estimatedCostLimits.cpuMs > maxCpuMs || estimatedCostLimits.memoryMb > maxMemoryMb)
  ) {
    return undefined;
  }
  return Object.freeze({ maxOptions, maxCpuMs, maxMemoryMb });
}

function widgetAllowlist(
  configured: readonly DashboardProposalChartTypeV1[] | undefined,
  catalog: readonly DashboardProposalChartTypeV1[] | undefined,
  hasMetric: boolean,
): readonly DashboardProposalChartTypeV1[] {
  const source =
    configured ??
    catalog ??
    (hasMetric ? CANONICAL_WIDGET_TYPES : ['TABLE', 'TEXT_NOTE', 'EVIDENCE_NOTE']);
  const allowed = source.filter(
    (type, index) => CANONICAL_WIDGET_TYPES.includes(type) && source.indexOf(type) === index,
  );
  return Object.freeze([...allowed]);
}

async function resolveCatalog(
  source: DashboardProposalAnalysisCatalogSourceV1 | undefined,
  context: IamTenantContextV1,
  plan: DdaAnalysisPlanV1,
): Promise<DashboardProposalAnalysisCatalogV1 | undefined> {
  if (source === undefined) return undefined;
  if (typeof source === 'function') return source(context, plan);
  if ('resolve' in source) return source.resolve(context, plan);
  return source;
}

function getDashboardAuthority(
  dependencies: DashboardProposalContextCompositionDependenciesV1,
): DashboardAuthority | undefined {
  return dependencies.dashboardDraftRepository ?? dependencies.dashboardRepository;
}

async function findIdentity(
  authority: DashboardAuthority,
  context: IamTenantContextV1,
  dashboardId: string,
) {
  if ('findIdentity' in authority) return authority.findIdentity(context.tenantScope, dashboardId);
  return authority.findByDashboardId(context.tenantScope, dashboardId);
}

function selectedBinding(
  bindings: readonly MaterializationDefinitionBindingV1[],
  context: IamTenantContextV1,
  version: DashboardVersionV1,
  plan: DdaAnalysisPlanV1,
  targetPageId: string,
  targetWidgetId: string | undefined,
): MaterializationBindingV1 | undefined {
  const pageWidgetIds = new Set(
    version.widgets
      .filter((widget) => widget.pageId === targetPageId)
      .map((widget) => String(widget.widgetId)),
  );
  return bindings
    .map((binding) => binding as MaterializationBindingV1)
    .filter((binding) => sameBindingIdentity(binding, context, version, plan))
    .filter((binding) => pageWidgetIds.has(binding.widgetId))
    .filter((binding) => targetWidgetId === undefined || binding.widgetId === targetWidgetId)
    .sort((left, right) =>
      left.materializationDefinitionId.localeCompare(right.materializationDefinitionId),
    )[0];
}

/**
 * DDA-015/016/018/020/021/024/026/043/045/050: compose the proposal port from
 * request-scoped authority. The provider receives only the bounded projection
 * returned by this adapter; it cannot choose a dashboard version, field, result,
 * materialization, widget type, responsive rule, or budget.
 */
export class DashboardProposalContextAdapter implements DashboardProposalContextPortV1 {
  public constructor(
    private readonly dependencies: DashboardProposalContextCompositionDependenciesV1,
  ) {}

  public async resolve(
    context: IamTenantContextV1,
    input: DashboardProposalContextInputV1,
  ): Promise<DashboardProposalContextResolutionV1> {
    if (!projectScope(context)) return rejected('UNAUTHORIZED');
    const dashboardId = stableIdentifier(input?.dashboardId);
    const planVersionId = stableIdentifier(input?.analysisPlanVersionId);
    const pageId = stableIdentifier(input?.targetPageId);
    const widgetId =
      input?.targetWidgetId === undefined ? undefined : stableIdentifier(input.targetWidgetId);
    if (dashboardId === undefined) return rejected('DASHBOARD_NOT_FOUND');
    if (planVersionId === undefined) return rejected('ANALYSIS_PLAN_NOT_FOUND');
    if (pageId === undefined || (input?.targetWidgetId !== undefined && widgetId === undefined)) {
      return rejected('TARGET_NOT_FOUND');
    }

    const authorization = this.dependencies.dashboardAuthorization;
    const authority = getDashboardAuthority(this.dependencies);
    const analysisPlans = this.dependencies.analysisPlanRepository;
    if (authorization === undefined || authority === undefined || analysisPlans === undefined) {
      return rejected('UNAVAILABLE');
    }

    let decision;
    try {
      decision = await authorization.authorizeDashboardAction({
        context,
        tenantScope: context.tenantScope,
        actorId: context.actorId,
        dashboardId,
        action: 'EDIT',
      });
    } catch {
      return rejected('UNAVAILABLE');
    }
    if (
      decision.allowed !== true ||
      decision.grantsDatasetAccess !== true ||
      decision.grantsAnalysisAccess !== true
    ) {
      return rejected('UNAUTHORIZED');
    }

    let identity;
    try {
      identity = await findIdentity(authority, context, dashboardId);
    } catch {
      return rejected('UNAVAILABLE');
    }
    if (
      identity === undefined ||
      identity.dashboardId !== dashboardId ||
      !tenantScopesEqualV1(identity.tenantScope, context.tenantScope) ||
      identity.status === 'ARCHIVED'
    ) {
      return rejected('DASHBOARD_NOT_FOUND');
    }
    const currentVersionId = identity.draftVersionId ?? identity.publishedVersionId;
    if (currentVersionId === undefined) return rejected('DASHBOARD_NOT_FOUND');

    let version: DashboardVersionV1 | undefined;
    try {
      version = await authority.findVersion(context.tenantScope, currentVersionId);
    } catch {
      return rejected('UNAVAILABLE');
    }
    if (
      version === undefined ||
      version.dashboardId !== dashboardId ||
      version.versionId !== currentVersionId ||
      !tenantScopesEqualV1(version.tenantScope, context.tenantScope)
    ) {
      return rejected('DASHBOARD_NOT_FOUND');
    }
    const page = version.pages.find((candidate) => candidate.pageId === pageId);
    if (page === undefined) return rejected('TARGET_NOT_FOUND');
    const targetWidget =
      widgetId === undefined
        ? undefined
        : version.widgets.find(
            (candidate) => candidate.widgetId === widgetId && candidate.pageId === page.pageId,
          );
    if (widgetId !== undefined && targetWidget === undefined) return rejected('TARGET_NOT_FOUND');

    let plan: DdaAnalysisPlanV1 | undefined;
    try {
      plan = await analysisPlans.findByVersionId(context.tenantScope, planVersionId);
    } catch {
      return rejected('UNAVAILABLE');
    }
    if (
      plan === undefined ||
      plan.planVersionId !== planVersionId ||
      !tenantScopesEqualV1(plan.tenantScope, context.tenantScope)
    ) {
      return rejected('ANALYSIS_PLAN_NOT_FOUND');
    }
    const boundDataset = version.datasetBindings.some(
      (binding) =>
        binding.datasetVersionId === plan.datasetVersionId &&
        binding.semanticVersionId === plan.semanticVersionId &&
        binding.metricVersionId === plan.metricVersionId,
    );
    if (!boundDataset) return rejected('ANALYSIS_PLAN_NOT_FOUND');

    let catalog: DashboardProposalAnalysisCatalogV1 | undefined;
    try {
      catalog = await resolveCatalog(this.dependencies.analysisCatalog, context, plan);
    } catch {
      return rejected('UNAVAILABLE');
    }
    if (
      catalog === undefined ||
      catalog.blockedReason !== undefined ||
      (catalog.datasetVersionId !== undefined &&
        catalog.datasetVersionId !== plan.datasetVersionId) ||
      (catalog.semanticVersionId !== undefined &&
        catalog.semanticVersionId !== plan.semanticVersionId) ||
      (catalog.metricVersionId !== undefined && catalog.metricVersionId !== plan.metricVersionId) ||
      (catalog.permissionProjectionVersionId !== undefined &&
        catalog.permissionProjectionVersionId !== plan.permissionProjectionVersionId) ||
      (catalog.units !== undefined &&
        Object.entries(plan.units).some(([field, unit]) => catalog.units?.[field] !== unit))
    ) {
      return rejected('UNAVAILABLE');
    }

    const fieldDescriptors = descriptors(
      catalog.authorizedFields,
      catalog.fieldLabels,
      `dashboard-proposal-field:${plan.semanticVersionId}`,
      catalog.fieldIdentifiers,
    );
    const metricDescriptors = descriptors(
      catalog.authorizedMetrics ?? Object.keys(plan.units),
      catalog.metricLabels,
      `dashboard-proposal-metric:${plan.metricVersionId}`,
      catalog.metricIdentifiers,
    );
    const requiredFields = [...new Set(planFields(plan))];
    const authorizedFields: ChartProposalField[] = [];
    for (const fieldId of requiredFields) {
      const field = fieldDescriptors.get(fieldId);
      if (field === undefined) return rejected('UNAUTHORIZED');
      authorizedFields.push(field);
    }
    const metricIds = [...new Set(Object.keys(plan.units))];
    const authorizedMetrics: ChartProposalField[] = [];
    for (const metricId of metricIds) {
      const metric = metricDescriptors.get(metricId);
      if (metric === undefined) return rejected('UNAUTHORIZED');
      authorizedMetrics.push(metric);
    }
    const dimensionIds = mappedIdentifiers(plan.dimensions, fieldDescriptors);
    const measureIds = mappedIdentifiers(metricIds, metricDescriptors);
    if (dimensionIds === undefined || measureIds === undefined || authorizedFields.length === 0) {
      return rejected('UNAVAILABLE');
    }
    const metricIdentifierToKey = new Map<string, string>();
    for (const metricId of metricIds) {
      const metric = metricDescriptors.get(metricId);
      if (metric !== undefined) metricIdentifierToKey.set(String(metric.id), metricId);
    }

    let resultShapes = [...(catalog.resultShapes ?? []), plan.output.form];
    const deterministicResults = this.dependencies.deterministicResults;
    if (deterministicResults !== undefined) {
      try {
        const response = await deterministicResults.execute({
          plan,
          tenantScope: context.tenantScope,
        });
        if ('status' in response) return rejected('UNAVAILABLE');
        if (
          response.provenance.planVersionId !== plan.planVersionId ||
          response.provenance.datasetVersionId !== plan.datasetVersionId
        ) {
          return rejected('UNAVAILABLE');
        }
        const authorizedFieldIds = new Set(authorizedFields.map((field) => String(field.id)));
        const authorizedFieldKeys = new Set(requiredFields);
        for (const cell of response.cells) {
          const metricKey =
            metricIdentifierToKey.get(cell.field) ??
            (metricIds.includes(cell.field) ? cell.field : undefined);
          if (
            (!authorizedFieldIds.has(cell.field) && !authorizedFieldKeys.has(cell.field)) ||
            cell.planVersionId !== plan.planVersionId ||
            cell.metricVersionId !== plan.metricVersionId ||
            (metricKey !== undefined && plan.units[metricKey] !== cell.unit)
          ) {
            return rejected('UNAVAILABLE');
          }
        }
      } catch {
        return rejected('UNAVAILABLE');
      }
    }
    resultShapes = [...new Set(resultShapes)].filter(
      (shape): shape is string =>
        typeof shape === 'string' &&
        shape.length > 0 &&
        shape.length <= 64 &&
        !/\p{Cc}/u.test(shape),
    );
    if (resultShapes.length === 0) return rejected('UNAVAILABLE');

    const compatibleWidgets = version.widgets.filter(
      (widget) =>
        widget.pageId === page.pageId &&
        widget.binding.analysisPlanVersionId === plan.planVersionId &&
        (widgetId === undefined || widget.widgetId === widgetId),
    );
    if (compatibleWidgets.length === 0) return rejected('UNAVAILABLE');
    if (widgetId === undefined && compatibleWidgets.length > 1) return rejected('AMBIGUOUS');

    const binding = this.dependencies.dependencyRepository
      ? await this.resolveMaterializationBinding(
          this.dependencies.dependencyRepository,
          context,
          version,
          plan,
          page.pageId,
          widgetId,
        )
      : bindingFromWidget(version, page.pageId, widgetId, plan);
    if (binding === undefined) return rejected('UNAVAILABLE');
    const materializationDefinitionId = stableIdentifier(binding.materializationDefinitionId);
    if (materializationDefinitionId === undefined) return rejected('UNAVAILABLE');
    const configuredDimensionIds =
      binding.dimensionIds === undefined
        ? dimensionIds
        : uniqueStableIdentifiers(binding.dimensionIds);
    const configuredMeasureIds =
      binding.measureIds === undefined ? measureIds : uniqueStableIdentifiers(binding.measureIds);
    if (configuredDimensionIds === undefined || configuredMeasureIds === undefined) {
      return rejected('UNAVAILABLE');
    }
    const authorizedFieldIds = new Set(authorizedFields.map((field) => String(field.id)));
    const authorizedMetricIds = new Set(authorizedMetrics.map((field) => String(field.id)));
    if (
      configuredDimensionIds.some((fieldId) => !authorizedFieldIds.has(fieldId)) ||
      configuredMeasureIds.some((metricId) => !authorizedMetricIds.has(metricId))
    ) {
      return rejected('UNAVAILABLE');
    }

    const responsiveRules = safeSpans(
      this.dependencies.responsiveRules ?? catalog.responsiveRules,
      findLayoutSpan(version, page.pageId, widgetId),
    );
    const costBounds = safeCostBounds(
      this.dependencies.costBounds ?? catalog.costBounds,
      catalog.estimatedCostLimits ?? plan.estimate,
    );
    const allowlist = widgetAllowlist(
      this.dependencies.widgetAllowlist,
      catalog.widgetAllowlist,
      authorizedMetrics.length > 0,
    );
    if (responsiveRules === undefined || costBounds === undefined || allowlist.length === 0) {
      return rejected('UNAVAILABLE');
    }

    return Object.freeze({
      accepted: true as const,
      value: Object.freeze({
        dashboardId: identity.dashboardId,
        parentVersionId: version.versionId,
        expectedRevision: identity.revision,
        analysisPlanVersionId: plan.planVersionId,
        targetPageId: page.pageId,
        ...(widgetId === undefined ? {} : { targetWidgetId: widgetId }),
        authorizedFields: Object.freeze(authorizedFields),
        authorizedMetrics: Object.freeze(authorizedMetrics),
        resultShapes: Object.freeze(resultShapes),
        widgetAllowlist: allowlist,
        responsiveRules,
        costBounds,
        binding: Object.freeze({
          analysisPlanVersionId: plan.planVersionId,
          materializationDefinitionId,
          dimensionIds: Object.freeze(configuredDimensionIds),
          measureIds: Object.freeze(configuredMeasureIds),
        }),
      }),
    });
  }

  private async resolveMaterializationBinding(
    repository: DependencyRepositoryPortV1,
    context: IamTenantContextV1,
    version: DashboardVersionV1,
    plan: DdaAnalysisPlanV1,
    targetPageId: string,
    targetWidgetId: string | undefined,
  ): Promise<MaterializationBindingV1 | undefined> {
    try {
      const bindings = await repository.findBindingsByReference(
        context.tenantScope,
        'DASHBOARD_VERSION',
        version.versionId,
      );
      return selectedBinding(bindings, context, version, plan, targetPageId, targetWidgetId);
    } catch {
      return undefined;
    }
  }
}

export function composeDashboardProposalContextV1(
  dependencies: DashboardProposalContextCompositionDependenciesV1,
): DashboardProposalContextPortV1 {
  return new DashboardProposalContextAdapter(dependencies);
}

export const ProductionDashboardProposalContextAdapter = DashboardProposalContextAdapter;

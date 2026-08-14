import {
  parseV3Contract,
  type ChartProposalField,
  type ChartSpan,
  type DdaDashboardChartProposal,
} from '@databreeze/contracts/v3';
import {
  createDdaAiEgressPolicyV1,
  deterministicCapabilitiesWhenAiUnavailableV1,
  evaluateDdaAiEgressV1,
  type DdaAiEgressPolicyV1,
} from '@databreeze/domain/data-to-dashboard/policy-v1';
import {
  parseStableIdentifierV1,
  tenantScopesEqualV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';
import { randomUUID } from 'node:crypto';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type { DdaAudComposePortV1, DdaBuaPortV1 } from '../../application/foundation-ports.js';
import type {
  DashboardProposalContextInputV1,
  DashboardProposalContextPortV1,
  DashboardProposalContextResolutionV1,
  DashboardProposalChartTypeV1,
  DashboardProposalTrustedContextV1,
} from './dashboard-proposal-context.port.js';
import { UnavailableDashboardProposalContextAdapter } from './dashboard-proposal-context.port.js';
import type {
  DashboardProposalPortV1,
  DashboardProposalRequestV1,
  DashboardProposalV1,
  DashboardProposalWidgetV1,
} from './dashboard-proposal.port.js';
import type { DashboardProposalRepositoryPortV1 } from './dashboard-proposal-repository.port.js';
import type { DashboardAuthorizationPortV1 } from './dashboard-authorization.port.js';

export type DashboardProposalErrorCodeV1 =
  | 'INVALID_INPUT'
  | 'AI_EGRESS_DENIED'
  | 'PURPOSE_DENIED'
  | 'ADAPTER_DISABLED'
  | 'ADAPTER_UNAVAILABLE'
  | 'UNAUTHORIZED'
  | 'DASHBOARD_NOT_FOUND'
  | 'ANALYSIS_PLAN_NOT_FOUND'
  | 'TARGET_NOT_FOUND'
  | 'AMBIGUOUS'
  | 'UNAVAILABLE'
  | 'UNSUPPORTED_WIDGET'
  | 'INVALID_BINDING'
  | 'BUDGET_DENIED'
  | 'HOSTILE_CONTENT_REJECTED'
  | 'INVALID_PROPOSAL';

export type DashboardProposalPublicInputV1 = DashboardProposalContextInputV1 & {
  readonly question: string;
  readonly locale: 'vi' | 'en';
};

export type DashboardProposalResultV1 =
  | { readonly accepted: true; readonly value: DdaDashboardChartProposal }
  | { readonly accepted: false; readonly code: DashboardProposalErrorCodeV1 };

/** Compatibility result for the pre-Task-3 local provider tests. */
export type LegacyDashboardProposalResultV1 =
  | {
      readonly accepted: true;
      readonly value: {
        readonly proposalId: string;
        readonly proposal: DashboardProposalV1;
        readonly previewOnly: true;
        readonly publishes: false;
      };
    }
  | { readonly accepted: false; readonly code: DashboardProposalErrorCodeV1 };

export type DashboardProposalServiceResultV1 =
  | DashboardProposalResultV1
  | LegacyDashboardProposalResultV1;

export type DashboardProposalReadResultV1 =
  | {
      readonly accepted: true;
      readonly value: {
        readonly proposal: DdaDashboardChartProposal;
        readonly state: 'PROPOSED' | 'ACCEPTED' | 'EXPIRED' | 'REJECTED';
        readonly previewOnly: true;
        readonly publishes: false;
      };
    }
  | { readonly accepted: false; readonly code: DashboardProposalErrorCodeV1 };

export interface DashboardProposalPolicyStoreV1 {
  getPolicy(tenantScope: TenantScopeV1): DdaAiEgressPolicyV1 | undefined;
}

export interface DashboardProposalServiceOptionsV1 {
  readonly policyStore?: DashboardProposalPolicyStoreV1;
  readonly bua?: DdaBuaPortV1;
  readonly aud?: DdaAudComposePortV1;
  readonly killSwitchEnv?: () => string | undefined;
  readonly now?: () => string;
  readonly authorization?: DashboardAuthorizationPortV1;
}

const CANONICAL_TYPES = new Set<DashboardProposalChartTypeV1>([
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

const LEGACY_TYPE_MAP: Readonly<Record<string, DashboardProposalChartTypeV1>> = Object.freeze({
  LINE_AREA: 'LINE',
  PIE_DONUT: 'PIE',
  TEXT_EVIDENCE: 'EVIDENCE_NOTE',
});

const PUBLIC_INPUT_KEYS = new Set([
  'dashboardId',
  'question',
  'analysisPlanVersionId',
  'targetPageId',
  'targetWidgetId',
  'locale',
]);

function rejected(code: DashboardProposalErrorCodeV1): DashboardProposalResultV1 {
  return Object.freeze({ accepted: false as const, code });
}

function invalidInput(): { readonly accepted: false; readonly code: 'INVALID_INPUT' } {
  return Object.freeze({ accepted: false as const, code: 'INVALID_INPUT' as const });
}

function validText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    !/\p{Cc}/u.test(value)
  );
}

function hostile(value: string): boolean {
  return /<\/?(?:script|style|iframe)\b|https?:\/\/|javascript:/iu.test(value);
}

function stableId(value: unknown): value is string {
  return typeof value === 'string' && parseStableIdentifierV1(value).accepted;
}

function tenantScopeMatches(left: TenantScopeV1, right: TenantScopeV1): boolean {
  return tenantScopesEqualV1(left, right);
}

function typeFor(value: string): DashboardProposalChartTypeV1 | undefined {
  if (CANONICAL_TYPES.has(value as DashboardProposalChartTypeV1))
    return value as DashboardProposalChartTypeV1;
  return LEGACY_TYPE_MAP[value];
}

function localizedFallback(
  locale: 'vi' | 'en',
  value: string,
): { readonly vi: string; readonly en: string } {
  return locale === 'vi' ? { vi: value, en: value } : { vi: value, en: value };
}

function optionFields(fields: readonly ChartProposalField[]): readonly ChartProposalField[] {
  return Object.freeze(
    fields.map((field) => Object.freeze({ ...field, label: Object.freeze({ ...field.label }) })),
  );
}

function isChartSpan(value: number): value is ChartSpan {
  return value === 3 || value === 4 || value === 6 || value === 8 || value === 12;
}

function isContextPort(value: unknown): value is DashboardProposalContextPortV1 {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { resolve?: unknown }).resolve === 'function'
  );
}

/**
 * DDA-015/016/017/019/020/021/024/043/044/045/050: proposal admission is server-context-first,
 * preview-only, tenant scoped, and persisted only after canonical contract validation.
 */
export class DashboardProposalServiceV1 {
  readonly #adapter: DashboardProposalPortV1;
  readonly #context: DashboardProposalContextPortV1;
  readonly #repository: DashboardProposalRepositoryPortV1 | undefined;
  readonly #options: DashboardProposalServiceOptionsV1;

  public constructor(
    adapter: DashboardProposalPortV1,
    contextOrOptions?: DashboardProposalContextPortV1 | DashboardProposalServiceOptionsV1,
    repository?: DashboardProposalRepositoryPortV1,
    options: DashboardProposalServiceOptionsV1 = {},
  ) {
    this.#adapter = adapter;
    if (isContextPort(contextOrOptions)) {
      this.#context = contextOrOptions;
      this.#repository = repository;
      this.#options = options;
    } else {
      this.#context = new UnavailableDashboardProposalContextAdapter();
      this.#repository = undefined;
      this.#options = contextOrOptions ?? {};
    }
  }

  public fallbackCapabilities(): readonly string[] {
    return deterministicCapabilitiesWhenAiUnavailableV1();
  }

  /** DDA-024/DDA-026: proposal reads are scoped and freshly re-authorized. */
  public async read(
    context: IamTenantContextV1,
    input: { readonly dashboardId: string; readonly proposalId: string },
  ): Promise<DashboardProposalReadResultV1> {
    if (!stableId(input.dashboardId) || !stableId(input.proposalId)) {
      return Object.freeze({ accepted: false, code: 'INVALID_INPUT' as const });
    }
    if (this.#repository === undefined || this.#options.authorization === undefined) {
      return Object.freeze({ accepted: false, code: 'UNAVAILABLE' as const });
    }
    let record;
    try {
      record = await this.#repository.findById(context.tenantScope, input.proposalId);
    } catch {
      return Object.freeze({ accepted: false, code: 'UNAVAILABLE' as const });
    }
    if (
      record === undefined ||
      record.proposal.proposalId !== input.proposalId ||
      record.proposal.dashboardId !== input.dashboardId ||
      !tenantScopeMatches(record.tenantScope, context.tenantScope)
    ) {
      return Object.freeze({ accepted: false, code: 'DASHBOARD_NOT_FOUND' as const });
    }
    try {
      const decision = await this.#options.authorization.authorizeDashboardAction({
        context,
        tenantScope: context.tenantScope,
        actorId: context.actorId,
        dashboardId: input.dashboardId,
        action: 'VIEW',
      });
      if (!decision.allowed) {
        return Object.freeze({ accepted: false, code: 'DASHBOARD_NOT_FOUND' as const });
      }
    } catch {
      return Object.freeze({ accepted: false, code: 'UNAVAILABLE' as const });
    }
    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        proposal: record.proposal,
        state: record.state,
        previewOnly: true as const,
        publishes: false as const,
      }),
    });
  }

  public propose(
    context: IamTenantContextV1,
    input: DashboardProposalPublicInputV1,
  ): Promise<DashboardProposalResultV1>;
  public propose(request: DashboardProposalRequestV1): Promise<LegacyDashboardProposalResultV1>;
  public async propose(
    contextOrRequest: IamTenantContextV1 | DashboardProposalRequestV1,
    input?: DashboardProposalPublicInputV1,
  ): Promise<DashboardProposalServiceResultV1> {
    if (input === undefined)
      return this.#proposeLegacy(contextOrRequest as DashboardProposalRequestV1);
    return this.#proposeTrusted(contextOrRequest as IamTenantContextV1, input);
  }

  async #proposeTrusted(
    context: IamTenantContextV1,
    input: DashboardProposalPublicInputV1,
  ): Promise<DashboardProposalResultV1> {
    const validation = validatePublicInput(input);
    if (!validation.accepted) return validation;
    if (this.#repository === undefined) return rejected('UNAVAILABLE');

    const resolved = await this.#resolveContext(context, validation.value);
    if (!resolved.accepted) return rejected(resolved.code);
    const trusted = resolved.value;

    const admission = this.#admit(context, trusted, validation.value.question);
    if (!admission.accepted) return admission;
    if (!(await this.#adapter.isAvailable())) return rejected('ADAPTER_UNAVAILABLE');

    const reference = { id: trusted.analysisPlanVersionId, tenantScope: context.tenantScope };
    let reservationId: string | undefined;
    let outcome: 'SUCCEEDED' | 'FAILED' = 'FAILED';
    try {
      if (this.#options.bua) {
        try {
          const reservation = await this.#options.bua.reserveCapacity({
            reference,
            usageClass: 'DASHBOARD_PROPOSAL',
            requestUnits: 1,
            imageBytes: 0,
            textTokensEstimate: Math.ceil(validation.value.question.length / 4),
            retryBudget: 0,
            costUnitsEstimate: 1,
          });
          reservationId = reservation.reservationId;
        } catch {
          return rejected('BUDGET_DENIED');
        }
      }

      let providerOutput: DashboardProposalV1;
      try {
        providerOutput = await this.#adapter.proposeDashboard(
          toProviderRequest(validation.value, trusted),
        );
      } catch {
        return rejected('ADAPTER_UNAVAILABLE');
      }
      if (providerOutput.status !== 'PROPOSED') {
        return rejected(mapProviderFailure(providerOutput.code));
      }

      const proposal = normalizeProposal({
        context: trusted,
        locale: validation.value.locale,
        provider: providerOutput,
        now: this.#options.now ?? (() => new Date().toISOString()),
      });
      if (!proposal.accepted) return proposal;

      await this.#repository.save({
        tenantScope: context.tenantScope,
        actorId: context.actorId,
        proposal: proposal.value,
        state: 'PROPOSED',
        createdAt: proposal.value.createdAt,
        updatedAt: proposal.value.createdAt,
      });
      await this.#options.aud?.emitContentSafeSummary({
        tenantScope: context.tenantScope,
        action: 'DDA_DASHBOARD_PROPOSAL_CREATED',
        outcome: 'SUCCEEDED',
        correlationId: context.correlationId,
        references: [proposal.value.proposalId, trusted.dashboardId],
      });
      outcome = 'SUCCEEDED';
      return Object.freeze({ accepted: true as const, value: proposal.value });
    } finally {
      if (reservationId && this.#options.bua) {
        await this.#options.bua.finalizeReservation({ reservationId, reference, outcome });
      }
    }
  }

  async #resolveContext(
    context: IamTenantContextV1,
    input: DashboardProposalPublicInputV1,
  ): Promise<DashboardProposalContextResolutionV1> {
    try {
      return await this.#context.resolve(context, {
        dashboardId: input.dashboardId,
        analysisPlanVersionId: input.analysisPlanVersionId,
        targetPageId: input.targetPageId,
        ...(input.targetWidgetId === undefined ? {} : { targetWidgetId: input.targetWidgetId }),
      });
    } catch {
      return Object.freeze({ accepted: false as const, code: 'UNAVAILABLE' as const });
    }
  }

  #admit(
    context: IamTenantContextV1,
    trusted: DashboardProposalTrustedContextV1,
    question: string,
  ): DashboardProposalResultV1 {
    const kill = (
      this.#options.killSwitchEnv ?? (() => process.env['DATABREEZE_OPENAI_DASHBOARD_ENABLED'])
    )();
    if (kill === 'false') return rejected('ADAPTER_DISABLED');
    const policy =
      this.#options.policyStore?.getPolicy(context.tenantScope) ??
      defaultDeniedPolicy(context.tenantScope);
    if (!policy.purposeAllowlist.includes('PLAN_PROPOSAL')) return rejected('PURPOSE_DENIED');
    if (!policy.allowMetadata) return rejected('AI_EGRESS_DENIED');
    const payloadBytes = JSON.stringify({ question, trusted }).length;
    const evaluated = evaluateDdaAiEgressV1(policy, {
      adapter: 'openai-responses',
      purpose: 'PLAN_PROPOSAL',
      payloadBytes,
    });
    if (!evaluated.accepted) return rejected('AI_EGRESS_DENIED');
    return Object.freeze({ accepted: true as const, value: undefined as never });
  }

  async #proposeLegacy(
    request: DashboardProposalRequestV1,
  ): Promise<LegacyDashboardProposalResultV1> {
    const kill = (
      this.#options.killSwitchEnv ?? (() => process.env['DATABREEZE_OPENAI_DASHBOARD_ENABLED'])
    )();
    if (kill === 'false') return Object.freeze({ accepted: false, code: 'ADAPTER_DISABLED' });
    if (request.tenantScope === undefined)
      return Object.freeze({ accepted: false, code: 'INVALID_INPUT' });
    const policy =
      this.#options.policyStore?.getPolicy(request.tenantScope) ??
      defaultDeniedPolicy(request.tenantScope);
    if (!policy.purposeAllowlist.includes('PLAN_PROPOSAL'))
      return Object.freeze({ accepted: false, code: 'PURPOSE_DENIED' });
    const payloadBytes = JSON.stringify(request).length;
    if (!policy.allowMetadata) return Object.freeze({ accepted: false, code: 'AI_EGRESS_DENIED' });
    const evaluated = evaluateDdaAiEgressV1(policy, {
      adapter: 'openai-responses',
      purpose: 'PLAN_PROPOSAL',
      payloadBytes,
    });
    if (!evaluated.accepted) return Object.freeze({ accepted: false, code: 'AI_EGRESS_DENIED' });
    if (!(await this.#adapter.isAvailable()))
      return Object.freeze({ accepted: false, code: 'ADAPTER_UNAVAILABLE' });
    const output = await this.#adapter.proposeDashboard(request);
    if (output.status !== 'PROPOSED')
      return Object.freeze({ accepted: false, code: mapProviderFailure(output.code) });
    const allowlist = new Set(request.widgetAllowlist ?? []);
    for (const widget of output.widgets) {
      if (allowlist.size > 0 && !allowlist.has(widget.type))
        return Object.freeze({ accepted: false, code: 'UNSUPPORTED_WIDGET' });
      if (hostile(widget.title.vi) || hostile(widget.title.en))
        return Object.freeze({ accepted: false, code: 'HOSTILE_CONTENT_REJECTED' });
      if (
        widget.bindings.some(
          (binding) =>
            !(request.authorizedFields ?? []).includes(binding) &&
            !(request.authorizedMetrics ?? []).includes(binding),
        )
      ) {
        return Object.freeze({ accepted: false, code: 'INVALID_BINDING' });
      }
    }
    return Object.freeze({
      accepted: true as const,
      value: Object.freeze({
        proposalId: randomUUID(),
        proposal: output,
        previewOnly: true as const,
        publishes: false as const,
      }),
    });
  }
}

function validatePublicInput(
  input: DashboardProposalPublicInputV1,
):
  | { readonly accepted: true; readonly value: DashboardProposalPublicInputV1 }
  | { readonly accepted: false; readonly code: 'INVALID_INPUT' } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return invalidInput();
  if (Object.keys(input).some((key) => !PUBLIC_INPUT_KEYS.has(key))) return invalidInput();
  if (!validText(input.dashboardId, 128) || !stableId(input.dashboardId)) return invalidInput();
  if (!validText(input.question, 4000)) return invalidInput();
  if (!stableId(input.analysisPlanVersionId) || !stableId(input.targetPageId))
    return invalidInput();
  if (input.targetWidgetId !== undefined && !stableId(input.targetWidgetId)) return invalidInput();
  if (input.locale !== 'vi' && input.locale !== 'en') return invalidInput();
  return Object.freeze({ accepted: true as const, value: input });
}

function toProviderRequest(
  input: DashboardProposalPublicInputV1,
  trusted: DashboardProposalTrustedContextV1,
): DashboardProposalRequestV1 {
  return Object.freeze({
    question: input.question,
    locale: input.locale,
    dashboardId: trusted.dashboardId,
    parentVersionId: trusted.parentVersionId,
    expectedRevision: trusted.expectedRevision,
    analysisPlanVersionId: trusted.analysisPlanVersionId,
    targetPageId: trusted.targetPageId,
    ...(trusted.targetWidgetId === undefined ? {} : { targetWidgetId: trusted.targetWidgetId }),
    authorizedFields: Object.freeze(trusted.authorizedFields.map((field) => field.id)),
    authorizedMetrics: Object.freeze(trusted.authorizedMetrics.map((field) => field.id)),
    authorizedFieldLabels: trusted.authorizedFields,
    authorizedMetricLabels: trusted.authorizedMetrics,
    widgetAllowlist: trusted.widgetAllowlist,
    resultShapes: trusted.resultShapes,
    responsiveRules: trusted.responsiveRules,
    trustedBinding: trusted.binding,
  });
}

function normalizeProposal(input: {
  readonly context: DashboardProposalTrustedContextV1;
  readonly locale: 'vi' | 'en';
  readonly provider: DashboardProposalV1;
  readonly now: () => string;
}): DashboardProposalResultV1 {
  const providerWidgets = input.provider.widgets;
  if (providerWidgets.length < 2 || providerWidgets.length > 4) return rejected('BUDGET_DENIED');
  const allowedBindings = new Set([
    ...input.context.authorizedFields.map((field) => field.id),
    ...input.context.authorizedMetrics.map((field) => field.id),
  ]);
  const options: Array<DdaDashboardChartProposal['options'][number]> = [];
  for (const widget of providerWidgets) {
    if (!validProviderWidget(widget)) return rejected('INVALID_PROPOSAL');
    const type = typeFor(widget.type);
    if (type === undefined || !input.context.widgetAllowlist.includes(type))
      return rejected('UNSUPPORTED_WIDGET');
    if (widget.pageId !== input.context.targetPageId) return rejected('TARGET_NOT_FOUND');
    if (widget.bindings.some((binding) => !allowedBindings.has(binding)))
      return rejected('INVALID_BINDING');
    if (hostile(widget.title.vi) || hostile(widget.title.en))
      return rejected('HOSTILE_CONTENT_REJECTED');
    const estimate = widget.estimate ?? { cpuMs: 0, memoryMb: 0 };
    if (
      !Number.isSafeInteger(estimate.cpuMs) ||
      !Number.isSafeInteger(estimate.memoryMb) ||
      estimate.cpuMs < 0 ||
      estimate.memoryMb < 0 ||
      estimate.cpuMs > input.context.costBounds.maxCpuMs ||
      estimate.memoryMb > input.context.costBounds.maxMemoryMb
    )
      return rejected('BUDGET_DENIED');
    const rationale =
      input.provider.rationale ?? 'Compatible presentation based on the authorized analysis plan.';
    if (hostile(rationale) || (input.provider.assumptions ?? []).some(hostile))
      return rejected('HOSTILE_CONTENT_REJECTED');
    const supportedSpans: readonly ChartSpan[] =
      input.context.responsiveRules.supportedSpans.filter(isChartSpan);
    const defaultSpan = isChartSpan(input.context.responsiveRules.defaultSpan)
      ? input.context.responsiveRules.defaultSpan
      : supportedSpans[0];
    if (defaultSpan === undefined || supportedSpans.length === 0)
      return rejected('INVALID_PROPOSAL');
    const option = Object.freeze({
      optionId: randomUUID(),
      type,
      title: Object.freeze({ ...widget.title }),
      rationale: Object.freeze(localizedFallback(input.locale, rationale)),
      accessibilityDescription: Object.freeze(
        localizedFallback(input.locale, `Shows ${widget.title.en} using authorized fields only.`),
      ),
      binding: Object.freeze({
        analysisPlanVersionId: input.context.binding.analysisPlanVersionId,
        materializationDefinitionId: input.context.binding.materializationDefinitionId,
        dimensionIds: Object.freeze([...input.context.binding.dimensionIds]),
        measureIds: Object.freeze([...input.context.binding.measureIds]),
      }),
      dimensions: optionFields(input.context.authorizedFields),
      measures: optionFields(input.context.authorizedMetrics),
      supportedSpans: Object.freeze([...supportedSpans]),
      defaultSpan,
      assumptions: Object.freeze([...(input.provider.assumptions ?? [])]),
      estimate: Object.freeze(estimate),
      evidenceBehavior: widget.evidenceBehavior ?? 'OPTIONAL',
    });
    options.push(option);
  }
  const createdAt = input.now();
  if (!validUtc(createdAt)) return rejected('INVALID_PROPOSAL');
  const summaryText =
    input.provider.summary?.[input.locale] ??
    input.provider.rationale ??
    'Compatible dashboard alternatives.';
  if (!validText(summaryText, 500) || hostile(summaryText))
    return rejected('HOSTILE_CONTENT_REJECTED');
  const proposal = Object.freeze({
    schemaVersion: 3 as const,
    proposalId: randomUUID(),
    dashboardId: input.context.dashboardId,
    parentVersionId: input.context.parentVersionId,
    expectedRevision: input.context.expectedRevision,
    analysisPlanVersionId: input.context.analysisPlanVersionId,
    ...(input.context.targetWidgetId === undefined
      ? { target: Object.freeze({ pageId: input.context.targetPageId }) }
      : {
          target: Object.freeze({
            pageId: input.context.targetPageId,
            widgetId: input.context.targetWidgetId,
          }),
        }),
    options: Object.freeze(options),
    summary: Object.freeze({ vi: summaryText, en: summaryText }),
    previewOnly: true as const,
    publishes: false as const,
    createdAt,
  });
  const parsed = parseV3Contract(
    'https://schemas.databreeze.dev/contracts/v3/dda-dashboard-chart-proposal',
    proposal,
  );
  if (!parsed.accepted) return rejected('INVALID_PROPOSAL');
  return Object.freeze({
    accepted: true as const,
    value: parsed.value as DdaDashboardChartProposal,
  });
}

function validProviderWidget(widget: DashboardProposalWidgetV1): boolean {
  return (
    stableId(widget.widgetId) &&
    stableId(widget.pageId) &&
    typeof widget.type === 'string' &&
    validText(widget.title.vi, 200) &&
    validText(widget.title.en, 200) &&
    Array.isArray(widget.bindings) &&
    widget.bindings.every((binding) => stableId(binding))
  );
}

function validUtc(value: string): boolean {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && /Z$/u.test(value);
}

function mapProviderFailure(code: string | undefined): DashboardProposalErrorCodeV1 {
  if (code === 'ADAPTER_DISABLED') return 'ADAPTER_DISABLED';
  if (code === 'HOSTILE_CONTENT_REJECTED') return 'HOSTILE_CONTENT_REJECTED';
  return 'ADAPTER_UNAVAILABLE';
}

function defaultDeniedPolicy(tenantScope: TenantScopeV1): DdaAiEgressPolicyV1 {
  const created = createDdaAiEgressPolicyV1({
    policyId: '00000000-0000-4000-8000-0000000000aa',
    tenantScope,
    enabled: false,
    locality: 'DENIED',
    purposeAllowlist: ['DISABLED'],
    adapterAllowlist: [],
    maximumPayloadBytes: 0,
  });
  if (!created.accepted) throw new Error(`INVALID_DEFAULT_DASHBOARD_POLICY:${created.code}`);
  return created.value;
}

export type {
  DashboardProposalContextPortV1,
  DashboardProposalTrustedContextV1,
} from './dashboard-proposal-context.port.js';

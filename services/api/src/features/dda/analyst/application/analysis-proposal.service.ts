import {
  createDdaAnalysisPlanV1,
  type DdaAnalysisPlanV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import { createHash, randomUUID } from 'node:crypto';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type { AnalysisAdapterPortV1 } from './analysis-adapter.port.js';
import { asAnalysisCatalogResolverV1 } from './analysis-catalog-resolver.service.js';
import type {
  AnalysisCatalogAuthorityPortV1,
  AnalysisCatalogResolverV1,
  AnalysisCatalogV1,
  AnalysisNonAnswerReasonV1,
} from './analysis-catalog.port.js';

export type { AnalysisCatalogV1, AnalysisNonAnswerReasonV1 } from './analysis-catalog.port.js';

export interface AnalysisRecommendationV1 {
  readonly question: string;
  readonly impliesExecutedResult: false;
}

export type AnalysisProposalResultV1 =
  | {
      readonly accepted: true;
      readonly value: {
        readonly plan: DdaAnalysisPlanV1;
        readonly adapterUsed: boolean;
        readonly rationale?: string;
        readonly recommendations: readonly AnalysisRecommendationV1[];
        readonly preview: {
          readonly datasets: readonly string[];
          readonly semanticVersionId: string;
          readonly metricVersionId: string;
          readonly dimensions: readonly string[];
          readonly filters: readonly Readonly<Record<string, string>>[];
          readonly timeRange: DdaAnalysisPlanV1['timeRange'];
          readonly timeGrain: string;
          readonly joins: readonly Readonly<Record<string, string>>[];
          readonly units: Readonly<Record<string, string>>;
          readonly assumptions: readonly string[];
          readonly output: DdaAnalysisPlanV1['output'];
          readonly estimate: DdaAnalysisPlanV1['estimate'];
        };
      };
    }
  | {
      readonly accepted: false;
      readonly code: AnalysisNonAnswerReasonV1;
      readonly alternatives?: readonly { readonly name: string; readonly description: string }[];
    };

function planHash(parts: Readonly<Record<string, unknown>>): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function hasHostileExecutablePayload(input: Record<string, unknown>): boolean {
  return (
    'generatedSql' in input ||
    'generatedCode' in input ||
    'numericValues' in input ||
    'resultCells' in input
  );
}

/** DDA-015..019, DDA-044, DDA-050: typed analyst proposals without authoritative AI numbers. */
export class AnalysisProposalServiceV1 {
  private readonly catalogResolver: AnalysisCatalogResolverV1;

  public constructor(
    private readonly adapter: AnalysisAdapterPortV1,
    catalogSource: AnalysisCatalogResolverV1 | AnalysisCatalogAuthorityPortV1 | AnalysisCatalogV1,
  ) {
    this.catalogResolver = asAnalysisCatalogResolverV1(catalogSource);
  }

  public async propose(
    context: IamTenantContextV1,
    input: Record<string, unknown>,
  ): Promise<AnalysisProposalResultV1> {
    const catalogResult = await this.catalogResolver.resolve(context, {
      datasetVersionId: input['datasetVersionId'],
      semanticVersionId: input['semanticVersionId'],
      metricVersionId: input['metricVersionId'],
      permissionProjectionVersionId: input['permissionProjectionVersionId'],
      ...(input['memberId'] === undefined ? {} : { memberId: input['memberId'] }),
    });
    if (!catalogResult.accepted) {
      return Object.freeze({ accepted: false, code: catalogResult.code });
    }
    const catalog = catalogResult.value;
    if (catalog.blockedReason) {
      return Object.freeze({ accepted: false, code: catalog.blockedReason });
    }
    if (hasHostileExecutablePayload(input)) {
      return Object.freeze({ accepted: false, code: 'UNSUPPORTED_PLAN' as const });
    }

    const ambiguous = input['ambiguousInterpretations'];
    if (Array.isArray(ambiguous) && ambiguous.length > 1) {
      return Object.freeze({
        accepted: false,
        code: 'AMBIGUOUS_REQUEST' as const,
        alternatives: Object.freeze(
          ambiguous.map((item) => {
            const record = item as Record<string, unknown>;
            return Object.freeze({
              name: typeof record['name'] === 'string' ? record['name'] : '',
              description: typeof record['description'] === 'string' ? record['description'] : '',
            });
          }),
        ),
      });
    }

    if (
      typeof input['semanticVersionId'] !== 'string' ||
      typeof input['metricVersionId'] !== 'string' ||
      typeof input['datasetVersionId'] !== 'string' ||
      typeof input['timeGrain'] !== 'string'
    ) {
      return Object.freeze({ accepted: false, code: 'INSUFFICIENT_DATA' as const });
    }

    const units = input['units'];
    if (
      !units ||
      typeof units !== 'object' ||
      Array.isArray(units) ||
      Object.keys(units).length === 0
    ) {
      return Object.freeze({ accepted: false, code: 'INSUFFICIENT_DATA' as const });
    }

    const authorized = new Set(catalog.authorizedFields);
    const catalogUnits = catalog.units;
    if (
      Object.entries(units as Record<string, unknown>).some(
        ([field, unit]) =>
          !authorized.has(field) || typeof unit !== 'string' || catalogUnits[field] !== unit,
      )
    ) {
      return Object.freeze({ accepted: false, code: 'UNAUTHORIZED_DATA' as const });
    }
    if (!catalog.grains.includes(input['timeGrain'])) {
      return Object.freeze({ accepted: false, code: 'UNAUTHORIZED_DATA' as const });
    }

    const output = input['output'] as { form?: string; maxRows?: number } | undefined;
    if (!output || typeof output.maxRows !== 'number' || output.maxRows > 10_000) {
      return Object.freeze({ accepted: false, code: 'UNSUPPORTED_PLAN' as const });
    }

    const dimensions = Array.isArray(input['dimensions']) ? (input['dimensions'] as string[]) : [];
    if (dimensions.some((field) => !authorized.has(field))) {
      return Object.freeze({ accepted: false, code: 'UNAUTHORIZED_DATA' as const });
    }
    const filters = Array.isArray(input['filters'])
      ? (input['filters'] as Record<string, string>[])
      : [];
    if (filters.some((filter) => !authorized.has(String(filter['field'] ?? '')))) {
      return Object.freeze({ accepted: false, code: 'UNAUTHORIZED_DATA' as const });
    }
    const joins = Array.isArray(input['joins']) ? (input['joins'] as Record<string, string>[]) : [];
    if (joins.length > 0) {
      return Object.freeze({ accepted: false, code: 'UNAUTHORIZED_DATA' as const });
    }

    let adapterUsed = false;
    let rationale: string | undefined;
    let planPatch: Readonly<Record<string, unknown>> | undefined;
    const manual = input['manualTypedPlan'] === true;
    const available = await this.adapter.isAvailable();
    if (!manual && available) {
      const proposal = await this.adapter.proposeTypedPlan({
        question: typeof input['question'] === 'string' ? input['question'] : '',
        tenantScope: context.tenantScope,
        catalog: {
          datasetVersionId: catalog.datasetVersionId,
          semanticVersionId: catalog.semanticVersionId,
          metricVersionId: catalog.metricVersionId,
          permissionProjectionVersionId: catalog.permissionProjectionVersionId,
          authorizedFields: catalog.authorizedFields,
          authorizedJoins: catalog.authorizedJoins,
          allowedMetrics: catalog.authorizedFields,
          allowedDimensions: catalog.authorizedFields,
          units: catalog.units,
          grains: catalog.grains,
          timeBounds: {
            start:
              typeof (input['timeRange'] as { start?: unknown } | undefined)?.start === 'string'
                ? (input['timeRange'] as { start: string }).start
                : '1970-01-01T00:00:00.000Z',
            end:
              typeof (input['timeRange'] as { end?: unknown } | undefined)?.end === 'string'
                ? (input['timeRange'] as { end: string }).end
                : '2100-01-01T00:00:00.000Z',
          },
          locale: typeof input['locale'] === 'string' && input['locale'] === 'en' ? 'en' : 'vi',
          outputBounds: {
            form: typeof output?.form === 'string' ? output.form : 'TABLE',
            maxRows: typeof output?.maxRows === 'number' ? output.maxRows : 100,
          },
          estimatedCostLimits: { cpuMs: 5_000, memoryMb: 512 },
        },
      });
      if (proposal.status === 'PROPOSED') {
        adapterUsed = true;
        rationale = proposal.rationale;
        planPatch = proposal.planPatch;
        if (planPatch && hasHostileExecutablePayload(planPatch as Record<string, unknown>)) {
          return Object.freeze({ accepted: false, code: 'UNSUPPORTED_PLAN' as const });
        }
      }
    }

    const mergedDimensions =
      planPatch && Array.isArray(planPatch['dimensions'])
        ? (planPatch['dimensions'] as string[])
        : dimensions;
    if (mergedDimensions.some((field) => !authorized.has(field))) {
      return Object.freeze({ accepted: false, code: 'UNAUTHORIZED_DATA' as const });
    }
    const mergedFilters =
      planPatch && Array.isArray(planPatch['filters'])
        ? (planPatch['filters'] as Record<string, string>[])
        : filters;
    if (mergedFilters.some((filter) => !authorized.has(String(filter['field'] ?? '')))) {
      return Object.freeze({ accepted: false, code: 'UNAUTHORIZED_DATA' as const });
    }
    const mergedJoins =
      planPatch && Array.isArray(planPatch['joins'])
        ? (planPatch['joins'] as Record<string, string>[])
        : joins;
    if (mergedJoins.length > 0) {
      const allowedJoins = new Set(catalog.authorizedJoins);
      if (
        mergedJoins.some((join) => !allowedJoins.has(String(join['joinId'] ?? join['id'] ?? '')))
      ) {
        return Object.freeze({ accepted: false, code: 'UNAUTHORIZED_DATA' as const });
      }
    }
    const mergedGrain =
      planPatch && typeof planPatch['timeGrain'] === 'string'
        ? planPatch['timeGrain']
        : input['timeGrain'];
    if (typeof mergedGrain !== 'string' || !catalog.grains.includes(mergedGrain)) {
      return Object.freeze({ accepted: false, code: 'UNAUTHORIZED_DATA' as const });
    }
    const mergedOutput =
      planPatch && planPatch['output'] && typeof planPatch['output'] === 'object'
        ? (planPatch['output'] as { form?: string; maxRows?: number })
        : output;
    const mergedAssumptions =
      planPatch && Array.isArray(planPatch['assumptions'])
        ? (planPatch['assumptions'] as string[])
        : ((input['assumptions'] as string[]) ?? []);

    const createdAt = new Date().toISOString().replace(/\.\d{3}Z$/u, '.000Z');
    const planId = randomUUID();
    const planVersionId = randomUUID();
    const hash = planHash({
      datasetVersionId: catalog.datasetVersionId,
      semanticVersionId: catalog.semanticVersionId,
      metricVersionId: catalog.metricVersionId,
      dimensions: mergedDimensions,
      filters: mergedFilters,
      timeGrain: mergedGrain,
      output: mergedOutput,
    });

    const created = createDdaAnalysisPlanV1({
      planId,
      planVersionId,
      tenantScope: context.tenantScope,
      datasetVersionId: catalog.datasetVersionId,
      semanticVersionId: catalog.semanticVersionId,
      metricVersionId: catalog.metricVersionId,
      dimensions: mergedDimensions,
      filters: mergedFilters,
      timeRange: input['timeRange'],
      timeGrain: mergedGrain,
      joins: mergedJoins,
      units,
      parameters: (input['parameters'] as Record<string, string | number | boolean>) ?? {},
      output: mergedOutput,
      assumptions: mergedAssumptions,
      estimate: input['estimate'],
      permissionProjectionVersionId: catalog.permissionProjectionVersionId,
      planHash: hash,
      createdAt,
    });
    if (!created.accepted) {
      return Object.freeze({ accepted: false, code: 'UNSUPPORTED_PLAN' as const });
    }

    const value = {
      plan: created.value,
      adapterUsed,
      ...(rationale === undefined ? {} : { rationale }),
      recommendations: [
        {
          question: 'So sanh doanh so theo thang truoc?',
          impliesExecutedResult: false as const,
        },
        {
          question: 'Ty trong theo vung?',
          impliesExecutedResult: false as const,
        },
      ] as const,
      preview: {
        datasets: [created.value.datasetVersionId] as const,
        semanticVersionId: created.value.semanticVersionId,
        metricVersionId: created.value.metricVersionId,
        dimensions: created.value.dimensions,
        filters: created.value.filters,
        timeRange: created.value.timeRange,
        timeGrain: created.value.timeGrain,
        joins: created.value.joins,
        units: created.value.units,
        assumptions: created.value.assumptions,
        output: created.value.output,
        estimate: created.value.estimate,
      },
    };
    return { accepted: true as const, value };
  }
}

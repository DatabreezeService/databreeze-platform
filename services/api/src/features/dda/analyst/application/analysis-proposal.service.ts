import {
  createDdaAnalysisPlanV1,
  type DdaAnalysisPlanV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import { createHash, randomUUID } from 'node:crypto';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type { AnalysisAdapterPortV1 } from './analysis-adapter.port.js';

/** Stable non-answer reasons from DDA-018 / plan 083. */
export type AnalysisNonAnswerReasonV1 =
  | 'AMBIGUOUS_REQUEST'
  | 'INSUFFICIENT_DATA'
  | 'UNAUTHORIZED_DATA'
  | 'STALE_INPUT'
  | 'QUALITY_BLOCKED'
  | 'SOURCE_UNAVAILABLE'
  | 'UNSUPPORTED_PLAN'
  | 'BUDGET_DENIED'
  | 'ADAPTER_UNAVAILABLE';

export interface AnalysisCatalogV1 {
  readonly datasetVersionId: string;
  readonly semanticVersionId: string;
  readonly metricVersionId: string;
  readonly permissionProjectionVersionId: string;
  readonly authorizedFields: readonly string[];
  readonly authorizedJoins: readonly string[];
  readonly units: Readonly<Record<string, string>>;
  readonly grains: readonly string[];
  readonly blockedReason?: AnalysisNonAnswerReasonV1;
}

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
  public constructor(
    private readonly adapter: AnalysisAdapterPortV1,
    private readonly catalog: AnalysisCatalogV1,
  ) {}

  public async propose(
    context: IamTenantContextV1,
    input: Record<string, unknown>,
  ): Promise<AnalysisProposalResultV1> {
    if (this.catalog.blockedReason) {
      return Object.freeze({ accepted: false, code: this.catalog.blockedReason });
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
              name: String(record['name'] ?? ''),
              description: String(record['description'] ?? ''),
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
    if (!units || typeof units !== 'object' || Array.isArray(units) || Object.keys(units).length === 0) {
      return Object.freeze({ accepted: false, code: 'INSUFFICIENT_DATA' as const });
    }

    const output = input['output'] as { form?: string; maxRows?: number } | undefined;
    if (!output || typeof output.maxRows !== 'number' || output.maxRows > 10_000) {
      return Object.freeze({ accepted: false, code: 'UNSUPPORTED_PLAN' as const });
    }

    const dimensions = Array.isArray(input['dimensions'])
      ? (input['dimensions'] as string[])
      : [];
    const authorized = new Set(this.catalog.authorizedFields);
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
    const manual = input['manualTypedPlan'] === true;
    const available = await this.adapter.isAvailable();
    if (!manual && available) {
      const proposal = await this.adapter.proposeTypedPlan({
        question: String(input['question'] ?? ''),
        tenantScope: context.tenantScope,
      });
      if (proposal.status === 'PROPOSED') {
        adapterUsed = true;
        rationale = proposal.rationale;
      }
    }

    const createdAt = new Date().toISOString().replace(/\.\d{3}Z$/u, '.000Z');
    const planId = randomUUID();
    const planVersionId = randomUUID();
    const hash = planHash({
      datasetVersionId: input['datasetVersionId'],
      semanticVersionId: input['semanticVersionId'],
      metricVersionId: input['metricVersionId'],
      dimensions,
      filters,
      timeGrain: input['timeGrain'],
      output,
    });

    const created = createDdaAnalysisPlanV1({
      planId,
      planVersionId,
      tenantScope: context.tenantScope,
      datasetVersionId: input['datasetVersionId'],
      semanticVersionId: input['semanticVersionId'],
      metricVersionId: input['metricVersionId'],
      dimensions,
      filters,
      timeRange: input['timeRange'],
      timeGrain: input['timeGrain'],
      joins,
      units,
      parameters: (input['parameters'] as Record<string, string | number | boolean>) ?? {},
      output,
      assumptions: (input['assumptions'] as string[]) ?? [],
      estimate: input['estimate'],
      permissionProjectionVersionId: input['permissionProjectionVersionId'],
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

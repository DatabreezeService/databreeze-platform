import { QualityDimensions, type QualityDimensionViewV1 } from './quality-dimensions.tsx';
import { RejectsTable, type RejectRowV1 } from './rejects-table.tsx';

export interface EtlReviewPageProps {
  readonly locale?: 'vi' | 'en';
  readonly sourceSchema: readonly string[];
  readonly inferredSchema: readonly string[];
  readonly targetSchema: readonly string[];
  readonly orderedSteps: readonly string[];
  readonly assumptions: readonly string[];
  readonly beforeSample: readonly Readonly<Record<string, unknown>>[];
  readonly afterSample: readonly Readonly<Record<string, unknown>>[];
  readonly counts: {
    readonly changed: number;
    readonly unchanged: number;
    readonly rejected: number;
  };
  readonly exclusions: readonly RejectRowV1[];
  readonly unsupportedScopes: readonly RejectRowV1[];
  readonly qualityEffects: readonly QualityDimensionViewV1[];
  readonly evidenceStatus: string;
  readonly estimatedCost: { readonly cpuMs: number; readonly memoryMb: number };
  readonly overallSummary?: {
    readonly formula: string;
    readonly coverage: number;
    readonly provesFactualCorrectness: false;
  };
  readonly state: string;
}

/** DDA-006 leaf review page for plan 083 composition. */
export function EtlReviewPage({
  locale = 'vi',
  sourceSchema,
  inferredSchema,
  targetSchema,
  orderedSteps,
  assumptions,
  beforeSample,
  afterSample,
  counts,
  exclusions,
  unsupportedScopes,
  qualityEffects,
  evidenceStatus,
  estimatedCost,
  overallSummary,
  state,
}: EtlReviewPageProps) {
  const title = locale === 'en' ? 'ETL review' : 'Xem xét ETL';
  return (
    <article className="etl-review-card" aria-label={title}>
      <h2>{title}</h2>
      <p>
        {locale === 'en' ? 'State' : 'Trạng thái'}: {state}
      </p>
      <section className="etl-review-card__schemas" aria-label="schemas">
        <p>source: {sourceSchema.join(', ')}</p>
        <p>inferred: {inferredSchema.join(', ')}</p>
        <p>target: {targetSchema.join(', ')}</p>
      </section>
      <section className="etl-review-card__steps" aria-label="steps">
        <ol>
          {orderedSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      <section className="etl-review-card__assumptions" aria-label="assumptions">
        <ul>
          {assumptions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section className="etl-review-card__samples" aria-label="samples">
        <p>before: {JSON.stringify(beforeSample)}</p>
        <p>after: {JSON.stringify(afterSample)}</p>
      </section>
      <p>
        changed={counts.changed} unchanged={counts.unchanged} rejected={counts.rejected}
      </p>
      <RejectsTable rejects={[...exclusions, ...unsupportedScopes]} locale={locale} />
      <QualityDimensions
        dimensions={qualityEffects}
        locale={locale}
        {...(overallSummary === undefined ? {} : { overallSummary })}
      />
      <p>
        evidence={evidenceStatus} cost={estimatedCost.cpuMs}ms/{estimatedCost.memoryMb}MB
      </p>
    </article>
  );
}

/** Bounded AI adapter for typed plan proposals only — never authoritative numbers. */
export interface AnalysisAdapterProposalV1 {
  readonly status: 'PROPOSED' | 'FAILED';
  readonly rationale?: string;
  readonly planPatch?: Readonly<Record<string, unknown>>;
  readonly code?: string;
}

export interface AnalysisAdapterCatalogInputV1 {
  readonly question: string;
  readonly tenantScope: unknown;
  /** Opaque authorized catalog — no raw rows by default (DDA-015/043). */
  readonly catalog: {
    readonly datasetVersionId: string;
    readonly semanticVersionId: string;
    readonly metricVersionId: string;
    readonly permissionProjectionVersionId: string;
    readonly authorizedFields: readonly string[];
    readonly authorizedJoins: readonly string[];
    readonly allowedMetrics: readonly string[];
    readonly allowedDimensions: readonly string[];
    readonly units: Readonly<Record<string, string>>;
    readonly grains: readonly string[];
    readonly timeBounds: { readonly start: string; readonly end: string };
    readonly locale: 'vi' | 'en';
    readonly outputBounds: { readonly form: string; readonly maxRows: number };
    readonly estimatedCostLimits: { readonly cpuMs: number; readonly memoryMb: number };
  };
}

export interface AnalysisAdapterPortV1 {
  isAvailable(): Promise<boolean>;
  proposeTypedPlan(input: AnalysisAdapterCatalogInputV1): Promise<AnalysisAdapterProposalV1>;
}

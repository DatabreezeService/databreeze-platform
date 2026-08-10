/** Bounded AI adapter for typed plan proposals only — never authoritative numbers. */
export interface AnalysisAdapterProposalV1 {
  readonly status: 'PROPOSED' | 'FAILED';
  readonly rationale?: string;
  readonly planPatch?: Readonly<Record<string, unknown>>;
}

export interface AnalysisAdapterPortV1 {
  isAvailable(): Promise<boolean>;
  proposeTypedPlan(input: {
    readonly question: string;
    readonly tenantScope: unknown;
  }): Promise<AnalysisAdapterProposalV1>;
}

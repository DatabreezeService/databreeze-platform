/** Narrative adapter — claims must cite exact deterministic result-cell IDs (DDA-018/019). */
export interface NarrativeClaimV1 {
  readonly text: string;
  readonly resultCellIds: readonly string[];
}

export interface NarrativeProposalV1 {
  readonly status: 'PROPOSED' | 'FAILED';
  readonly locale: 'vi' | 'en';
  readonly claims: readonly NarrativeClaimV1[];
  readonly rationale?: string;
  readonly code?: string;
}

export interface NarrativeAdapterRequestV1 {
  readonly tenantScope: unknown;
  readonly locale: 'vi' | 'en';
  readonly resultPackage: {
    readonly resultManifestId: string;
    readonly cells: readonly {
      readonly cellId: string;
      readonly label: string;
      readonly value: string;
    }[];
    readonly provenanceIds: readonly string[];
  };
}

export interface NarrativeAdapterPortV1 {
  isAvailable(): Promise<boolean>;
  proposeNarrative(input: NarrativeAdapterRequestV1): Promise<NarrativeProposalV1>;
}

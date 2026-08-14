import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

/** Provider-neutral mapping assistance port (DDA-005/006/008/010/011). */
export interface MappingAssistanceSuggestionV1 {
  readonly label: string;
  readonly summary: string;
  readonly sourceField: string;
  readonly targetField: string;
  readonly transformKind: string;
  readonly alternatives: readonly string[];
  readonly rationale: string;
  readonly uncertainty: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly authoritative: false;
}

export interface MappingAssistanceRequestV1 {
  readonly tenantScope: TenantScopeV1;
  readonly schemaVersionId: string;
  readonly profileVersionId: string;
  readonly headers: readonly string[];
  readonly typeProfiles: Readonly<Record<string, string>>;
  readonly targetFields: readonly string[];
  readonly locale: 'vi' | 'en';
  readonly boundedSamples: readonly Readonly<Record<string, string>>[];
  readonly samplePermissionGranted: boolean;
  readonly payloadBytes: number;
}

export type MappingAssistanceErrorCodeV1 =
  | 'AI_EGRESS_DENIED'
  | 'PURPOSE_DENIED'
  | 'SAMPLE_PERMISSION_DENIED'
  | 'PAYLOAD_TOO_LARGE'
  | 'BUDGET_DENIED'
  | 'ADAPTER_DISABLED'
  | 'ADAPTER_UNAVAILABLE'
  | 'INVALID_SUGGESTION'
  | 'HOSTILE_CONTENT_REJECTED';

export type MappingAssistanceResultV1 =
  | {
      readonly accepted: true;
      readonly value: {
        readonly suggestions: readonly MappingAssistanceSuggestionV1[];
        readonly adapterUsed: boolean;
      };
    }
  | { readonly accepted: false; readonly code: MappingAssistanceErrorCodeV1 };

export interface MappingAssistancePortV1 {
  isAvailable(): Promise<boolean>;
  suggestMappings(request: MappingAssistanceRequestV1): Promise<
    | {
        readonly status: 'PROPOSED';
        readonly suggestions: readonly MappingAssistanceSuggestionV1[];
      }
    | { readonly status: 'FAILED'; readonly code: MappingAssistanceErrorCodeV1 }
  >;
}

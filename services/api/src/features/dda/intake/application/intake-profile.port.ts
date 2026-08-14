import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import type {
  IaeLocalWebIntakePortV1,
  LocalWebIntakeResultV1,
  LocalWebIntakeUploadValueV1,
} from '../../../iae/application/local-web-intake.port.js';

export const INTAKE_IAE_FINALIZATION_PORT = Symbol('INTAKE_IAE_FINALIZATION_PORT');
export const INTAKE_IAE_UPLOAD_PORT = Symbol('INTAKE_IAE_UPLOAD_PORT');

export interface DdaWebIntakeProfileV1 {
  readonly profileId: 'dda.web.tabular.v1';
  readonly csv: {
    readonly encodings: readonly string[];
    readonly dialects: readonly string[];
  };
  readonly xlsx: {
    readonly macrosAllowed: false;
    readonly externalLinksAllowed: false;
  };
  readonly limits: {
    readonly maxBytes: number;
    readonly maxRows: number;
    readonly maxColumns: number;
    readonly maxSheets: number;
    readonly maxFormulas: number;
    readonly maxZipEntries: number;
    readonly maxZipEntryBytes: number;
    readonly maxZipUncompressedBytes: number;
    readonly maxZipRatio: number;
    readonly maxXmlNodes: number;
    readonly maxCells: number;
    readonly maxXmlRows: number;
    readonly maxXmlColumns: number;
  };
}

export type DdaIntakeProblemCodeV1 =
  | 'DDA_INTAKE_RENAMED_EXECUTABLE'
  | 'DDA_INTAKE_MALFORMED_ENCODING'
  | 'DDA_INTAKE_ZIP_BOMB'
  | 'DDA_INTAKE_MACRO_ENABLED'
  | 'DDA_INTAKE_EXTERNAL_LINK'
  | 'DDA_INTAKE_LIMIT_ROWS'
  | 'DDA_INTAKE_LIMIT_COLUMNS'
  | 'DDA_INTAKE_LIMIT_SHEETS'
  | 'DDA_INTAKE_LIMIT_SIZE'
  | 'DDA_INTAKE_FORMULA_LIMIT'
  | 'DDA_INTAKE_UNSUPPORTED_ENCODING'
  | 'DDA_INTAKE_CHECKSUM_MISMATCH'
  | 'DDA_INTAKE_DUPLICATE_FINALIZATION'
  | 'DDA_INTAKE_UNSUPPORTED_PROFILE'
  | 'DDA_INTAKE_LOCAL_PERMISSION_DENIED'
  | 'DDA_INTAKE_LOCAL_POLICY_UNAVAILABLE'
  | 'DDA_INTAKE_LOCAL_DATA_MODE_DENIED'
  | 'DDA_INTAKE_LOCAL_IDEMPOTENCY_CONFLICT'
  | 'DDA_INTAKE_LOCAL_UNAVAILABLE';

export interface IntakeIaeFinalizationPortV1 {
  finalizeSession(input: {
    readonly tenantScope: TenantScopeV1;
    readonly sessionId: string;
    readonly expectedSha256: string;
    readonly byteSize: number;
    readonly mediaType: string;
  }): Promise<
    | {
        readonly accepted: true;
        readonly value: {
          readonly sessionId: string;
          readonly artifactVersionId: string;
          readonly status: 'FINALIZED';
        };
      }
    | { readonly accepted: false; readonly code: DdaIntakeProblemCodeV1 }
  >;
}

export type IntakeIaeUploadResultV1 = LocalWebIntakeResultV1<LocalWebIntakeUploadValueV1>;

export type IntakeIaeUploadPortV1 = IaeLocalWebIntakePortV1;

export const DDA_WEB_INTAKE_PROFILE_V1: DdaWebIntakeProfileV1 = Object.freeze({
  profileId: 'dda.web.tabular.v1',
  csv: Object.freeze({
    encodings: Object.freeze(['utf-8', 'utf-8-sig', 'windows-1258']),
    dialects: Object.freeze(['excel', 'excel-tab', 'unix']),
  }),
  xlsx: Object.freeze({
    macrosAllowed: false,
    externalLinksAllowed: false,
  }),
  limits: Object.freeze({
    maxBytes: 512_000,
    maxRows: 20_000,
    maxColumns: 256,
    maxSheets: 8,
    maxFormulas: 500,
    maxZipEntries: 64,
    maxZipEntryBytes: 1_000_000,
    maxZipUncompressedBytes: 4_000_000,
    maxZipRatio: 40,
    maxXmlNodes: 100_000,
    maxCells: 100_000,
    maxXmlRows: 20_000,
    maxXmlColumns: 256,
  }),
});

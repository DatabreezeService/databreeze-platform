import type { DdaAuditPortV1 } from '../application/dda-audit.port.js';
import type {
  DdaAudComposePortV1,
  DdaAuthorityReferenceV1,
  DdaBuaPortV1,
  DdaDsmPortV1,
  DdaDsoPortV1,
  DdaIaePortV1,
  DdaJraPortV1,
} from '../application/foundation-ports.js';

export class DdaFoundationUnavailableError extends Error {
  public constructor(code = 'DDA_FOUNDATION_UNAVAILABLE') {
    super(code);
    this.name = 'DdaFoundationUnavailableError';
  }
}

export class DdaAuthorityMissingError extends Error {
  public constructor(code = 'DDA_AUTHORITY_MISSING') {
    super(code);
    this.name = 'DdaAuthorityMissingError';
  }
}

function unavailable(): never {
  throw new DdaFoundationUnavailableError();
}

export function createFailClosedDdaFoundationPortsV1(): {
  readonly iae: DdaIaePortV1;
  readonly dsm: DdaDsmPortV1;
  readonly jra: DdaJraPortV1;
  readonly dso: DdaDsoPortV1;
  readonly bua: DdaBuaPortV1;
  readonly aud: DdaAudComposePortV1;
} {
  return Object.freeze({
    iae: {
      async requireArtifactVersion() {
        unavailable();
      },
      async requireEvidenceReference() {
        unavailable();
      },
      async addRetentionConstraint() {
        unavailable();
      },
    },
    dsm: {
      async requireDatasetVersion() {
        unavailable();
      },
      async requireSemanticVersion() {
        unavailable();
      },
      async requireMetricVersion() {
        unavailable();
      },
    },
    jra: {
      async requireJob() {
        unavailable();
      },
      async requireResultManifest() {
        unavailable();
      },
    },
    dso: {
      async requireCapabilityGrant() {
        unavailable();
      },
      async requireProjection() {
        unavailable();
      },
    },
    bua: {
      async requireAdmission() {
        unavailable();
      },
    },
    aud: {
      async emitContentSafeSummary() {
        unavailable();
      },
    },
  });
}

export interface DdaIaeLookupPortV1 {
  findArtifactVersion(reference: DdaAuthorityReferenceV1): Promise<boolean>;
  findEvidenceReference(reference: DdaAuthorityReferenceV1): Promise<boolean>;
  addRetentionConstraint(reference: DdaAuthorityReferenceV1, holdReason: string): Promise<void>;
}

export interface DdaDsmLookupPortV1 {
  findDatasetVersion(reference: DdaAuthorityReferenceV1): Promise<boolean>;
  findSemanticVersion(reference: DdaAuthorityReferenceV1): Promise<boolean>;
  findMetricVersion(reference: DdaAuthorityReferenceV1): Promise<boolean>;
}

export interface DdaJraLookupPortV1 {
  findJob(reference: DdaAuthorityReferenceV1): Promise<boolean>;
  findResultManifest(reference: DdaAuthorityReferenceV1): Promise<boolean>;
}

export interface DdaDsoLookupPortV1 {
  findCapabilityGrant(reference: DdaAuthorityReferenceV1): Promise<boolean>;
  findProjection(reference: DdaAuthorityReferenceV1): Promise<boolean>;
}

export interface DdaBuaLookupPortV1 {
  admit(reference: DdaAuthorityReferenceV1, usageClass: string): Promise<boolean>;
}

export interface DdaAudLookupPortV1 {
  emitContentSafeSummary(input: {
    readonly tenantScope: DdaAuthorityReferenceV1['tenantScope'];
    readonly action: string;
    readonly outcome: string;
    readonly correlationId: string;
    readonly references: readonly string[];
  }): Promise<void>;
}

async function requirePresent(found: Promise<boolean>): Promise<void> {
  if (!(await found)) throw new DdaAuthorityMissingError();
}

export function createLookupBackedDdaIaePortV1(lookup: DdaIaeLookupPortV1): DdaIaePortV1 {
  return {
    requireArtifactVersion: (reference) => requirePresent(lookup.findArtifactVersion(reference)),
    requireEvidenceReference: (reference) => requirePresent(lookup.findEvidenceReference(reference)),
    addRetentionConstraint: (reference, holdReason) =>
      lookup.addRetentionConstraint(reference, holdReason),
  };
}

export function createLookupBackedDdaDsmPortV1(lookup: DdaDsmLookupPortV1): DdaDsmPortV1 {
  return {
    requireDatasetVersion: (reference) => requirePresent(lookup.findDatasetVersion(reference)),
    requireSemanticVersion: (reference) => requirePresent(lookup.findSemanticVersion(reference)),
    requireMetricVersion: (reference) => requirePresent(lookup.findMetricVersion(reference)),
  };
}

export function createLookupBackedDdaJraPortV1(lookup: DdaJraLookupPortV1): DdaJraPortV1 {
  return {
    requireJob: (reference) => requirePresent(lookup.findJob(reference)),
    requireResultManifest: (reference) => requirePresent(lookup.findResultManifest(reference)),
  };
}

export function createLookupBackedDdaDsoPortV1(lookup: DdaDsoLookupPortV1): DdaDsoPortV1 {
  return {
    requireCapabilityGrant: (reference) => requirePresent(lookup.findCapabilityGrant(reference)),
    requireProjection: (reference) => requirePresent(lookup.findProjection(reference)),
  };
}

export function createLookupBackedDdaBuaPortV1(lookup: DdaBuaLookupPortV1): DdaBuaPortV1 {
  return {
    requireAdmission: (reference, usageClass) =>
      requirePresent(lookup.admit(reference, usageClass)),
  };
}

export function createLookupBackedDdaAudPortV1(lookup: DdaAudLookupPortV1): DdaAudComposePortV1 {
  return {
    emitContentSafeSummary: (input) => lookup.emitContentSafeSummary(input),
  };
}

export function createFailClosedDdaAuditPortV1(): DdaAuditPortV1 {
  return {
    async emitContentSafeSummary() {
      unavailable();
    },
  };
}

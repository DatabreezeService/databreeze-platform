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
      requireArtifactVersion() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
      requireEvidenceReference() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
      addRetentionConstraint() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
      openProcessingContent() {
        return Promise.resolve(
          Object.freeze({
            accepted: false as const,
            code: 'PROCESSING_CONTENT_UNAVAILABLE' as const,
          }),
        );
      },
    },
    dsm: {
      requireDatasetVersion() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
      requireSemanticVersion() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
      requireMetricVersion() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
    },
    jra: {
      requireJob() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
      requireResultManifest() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
    },
    dso: {
      requireCapabilityGrant() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
      requireProjection() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
    },
    bua: {
      requireAdmission() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
      reserveCapacity() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
      finalizeReservation() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
    },
    aud: {
      emitContentSafeSummary() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
    },
  });
}

export interface DdaIaeLookupPortV1 {
  findArtifactVersion(reference: DdaAuthorityReferenceV1): Promise<boolean>;
  findEvidenceReference(reference: DdaAuthorityReferenceV1): Promise<boolean>;
  addRetentionConstraint(reference: DdaAuthorityReferenceV1, holdReason: string): Promise<void>;
  openProcessingContent?: DdaIaePortV1['openProcessingContent'];
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
  reserveCapacity?: DdaBuaPortV1['reserveCapacity'];
  finalizeReservation?: DdaBuaPortV1['finalizeReservation'];
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
    requireEvidenceReference: (reference) =>
      requirePresent(lookup.findEvidenceReference(reference)),
    addRetentionConstraint: (reference, holdReason) =>
      lookup.addRetentionConstraint(reference, holdReason),
    openProcessingContent: (input) =>
      lookup.openProcessingContent
        ? lookup.openProcessingContent(input)
        : Promise.resolve(
            Object.freeze({
              accepted: false as const,
              code: 'PROCESSING_CONTENT_UNAVAILABLE' as const,
            }),
          ),
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
    reserveCapacity: async (input) => {
      if (lookup.reserveCapacity) return lookup.reserveCapacity(input);
      await requirePresent(lookup.admit(input.reference, input.usageClass));
      return Object.freeze({
        reservationId: input.reference.id,
        usageClass: input.usageClass,
      });
    },
    finalizeReservation: async (input) => {
      if (lookup.finalizeReservation) {
        await lookup.finalizeReservation(input);
        return;
      }
    },
  };
}

export function createLookupBackedDdaAudPortV1(lookup: DdaAudLookupPortV1): DdaAudComposePortV1 {
  return {
    emitContentSafeSummary: (input) => lookup.emitContentSafeSummary(input),
  };
}

export function createFailClosedDdaAuditPortV1(): DdaAuditPortV1 {
  return {
    emitContentSafeSummary() {
      return Promise.reject(new DdaFoundationUnavailableError());
    },
  };
}

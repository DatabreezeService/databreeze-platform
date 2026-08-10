import type {
  EtlAudPortV1,
  EtlBuaPortV1,
  EtlDsmPortV1,
  EtlIaePortV1,
  EtlJraPortV1,
  EtlPolicyPortV1,
} from '../etl/application/etl-foundation-ports.js';
import type { IntakeIaeFinalizationPortV1 } from '../intake/application/intake-profile.port.js';
import type { DashboardAuthorizationPortV1 } from '../dashboard/application/dashboard-authorization.port.js';
import type { AnalysisCatalogV1 } from '../analyst/application/analysis-proposal.service.js';
import type { AnalysisAdapterPortV1 } from '../analyst/application/analysis-adapter.port.js';
import type { DeterministicResultPortV1 } from '../analyst/application/deterministic-result.port.js';
import type { ReceiptGovernedRecordPort } from '../receipt/application/receipt-acceptance.service.js';
import type { RefreshUsagePortV1 } from '../refresh/application/refresh-usage.port.js';
import { DdaFoundationUnavailableError } from './fail-closed-foundation.adapters.js';

export function createFailClosedEtlPortsV1(): {
  readonly iae: EtlIaePortV1;
  readonly dsm: EtlDsmPortV1;
  readonly jra: EtlJraPortV1;
  readonly bua: EtlBuaPortV1;
  readonly aud: EtlAudPortV1;
  readonly policy: EtlPolicyPortV1;
} {
  return Object.freeze({
    iae: {
      registerDerivative() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
    },
    dsm: {
      registerDatasetVersion() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
    },
    jra: {
      createTypedJob() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
      awaitResultManifest() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
    },
    bua: {
      admit() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
    },
    aud: {
      emit() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
    },
    policy: {
      currentPolicyVersionId() {
        return Promise.reject(new DdaFoundationUnavailableError());
      },
    },
  });
}

export function createFailClosedIntakeIaeV1(): IntakeIaeFinalizationPortV1 {
  return {
    finalizeSession() {
      // No fabricated artifact IDs when IAE is not composed.
      return Promise.resolve(
        Object.freeze({
          accepted: false as const,
          code: 'DDA_INTAKE_UNSUPPORTED_PROFILE' as const,
        }),
      );
    },
  };
}

export function createFailClosedDashboardAuthorizationV1(): DashboardAuthorizationPortV1 {
  return {
    authorizeDashboardAction() {
      return Promise.resolve(
        Object.freeze({
          allowed: false,
          grantsDatasetAccess: false,
          grantsEvidenceAccess: false,
        }),
      );
    },
    projectVisibleFields() {
      return Promise.resolve(Object.freeze([]));
    },
  };
}

export function createFailClosedAnalysisCatalogV1(): AnalysisCatalogV1 {
  return Object.freeze({
    datasetVersionId: '00000000-0000-4000-8000-000000000000',
    semanticVersionId: '00000000-0000-4000-8000-000000000000',
    metricVersionId: '00000000-0000-4000-8000-000000000000',
    permissionProjectionVersionId: '00000000-0000-4000-8000-000000000000',
    authorizedFields: Object.freeze([]),
    authorizedJoins: Object.freeze([]),
    units: Object.freeze({}),
    grains: Object.freeze([]),
  });
}

export function createFailClosedAnalysisAdapterV1(): AnalysisAdapterPortV1 {
  return {
    isAvailable() {
      return Promise.resolve(false);
    },
    proposeTypedPlan() {
      return Promise.resolve(
        Object.freeze({
          status: 'FAILED' as const,
          rationale: 'DDA_FOUNDATION_UNAVAILABLE',
        }),
      );
    },
  };
}

export function createFailClosedDeterministicResultsV1(): DeterministicResultPortV1 {
  return {
    execute() {
      return Promise.reject(new DdaFoundationUnavailableError());
    },
  };
}

export function createFailClosedReceiptRecordsV1(): ReceiptGovernedRecordPort {
  return {
    appendGovernedRecord() {
      return Promise.reject(new DdaFoundationUnavailableError());
    },
  };
}

export function createFailClosedRefreshUsageV1(): RefreshUsagePortV1 {
  return {
    evaluate() {
      return Promise.resolve(
        Object.freeze({ admitted: false, reasonCode: 'DDA_FOUNDATION_UNAVAILABLE' }),
      );
    },
    reserve() {
      return Promise.reject(new DdaFoundationUnavailableError());
    },
    finalize() {
      return Promise.reject(new DdaFoundationUnavailableError());
    },
    release() {
      return Promise.reject(new DdaFoundationUnavailableError());
    },
    emitContentSafeOutcome() {
      return Promise.reject(new DdaFoundationUnavailableError());
    },
  };
}

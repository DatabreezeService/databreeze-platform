import { type DynamicModule, Module } from '@nestjs/common';

import { IamModule, type IamModuleOptions } from './features/iam/iam.module.js';
import { SystemModule, type SystemModuleOptions } from './features/system/system.module.js';
import { IaeModule, type IaeModuleOptions } from './features/iae/iae.module.js';
import { PrismaArtifactRepositoryAdapter } from './features/iae/adapter/prisma-artifact-repository.adapter.js';
import { PrismaArtifactIntakeRepositoryAdapter } from './features/iae/adapter/prisma-artifact-intake-repository.adapter.js';
import { DsmModule, type DsmModuleOptions } from './features/dsm/dsm.module.js';
import { PrismaDatasetVersionRepositoryAdapter } from './features/dsm/adapter/prisma-dataset-version-repository.adapter.js';
import { DsoModule, type DsoModuleOptions } from './features/dso/dso.module.js';
import { AudModule, type AudModuleOptions } from './features/aud/aud.module.js';
import { AuditLedgerService } from './features/aud/application/audit-ledger.service.js';
import { PrismaAuditRepositoryAdapter } from './features/aud/adapter/prisma-audit-repository.adapter.js';
import { Sha256AuditDigestAdapter } from './features/aud/adapter/sha256-audit-digest.adapter.js';
import { BuaModule, type BuaModuleOptions } from './features/bua/bua.module.js';
import { EntitlementAdmissionService } from './features/bua/application/entitlement-admission.service.js';
import { PrismaEntitlementRepositoryAdapter } from './features/bua/adapter/prisma-entitlement-repository.adapter.js';
import { SaModule, type SaModuleOptions } from './features/sa/sa.module.js';
import { FaModule, type FaModuleOptions } from './features/fa/fa.module.js';
import { DqgModule, type DqgModuleOptions } from './features/dqg/dqg.module.js';
import { QiModule, type QiModuleOptions } from './features/qi/qi.module.js';
import { IldModule, type IldModuleOptions } from './features/ild/ild.module.js';
import { DdaModule, type DdaModuleOptions } from './features/dda/dda.module.js';
import { JraModule, type JraModuleOptions } from './features/jra/jra.module.js';
import { PrismaApprovalRepositoryAdapter } from './features/jra/adapter/prisma-approval-repository.adapter.js';
import { ApprovalService } from './features/jra/application/approval.service.js';
import { JraDashboardPublicationApprovalAdapter } from './features/dda/dashboard/adapter/jra-dashboard-publication-approval.adapter.js';
import {
  SessionRequestTenantContextAdapter,
  UnavailableWorkspaceAuthorizationEpochResolverAdapter,
} from './platform/http/session-tenant-context.adapter.js';
import { PrismaSessionLifecycleAdapter } from './features/iam/adapter/prisma-session-lifecycle.adapter.js';
import { PrismaIamRepositoryAdapter } from './features/iam/adapter/prisma-iam-repository.adapter.js';
import { PrismaAgentGrantRepositoryAdapter } from './features/iam/adapter/prisma-agent-grant-repository.adapter.js';
import { InMemoryAgentGrantRepositoryAdapter } from './features/iam/adapter/in-memory-agent-grant-repository.adapter.js';
import { PrismaServiceAccountRepositoryAdapter } from './features/iam/adapter/prisma-service-account-repository.adapter.js';
import { AccessPresetService } from './features/iam/application/access-preset.service.js';
import { AgentGrantService } from './features/iam/application/agent-grant.service.js';
import { IamAgentGrantDatasetTargetValidationAdapter } from './features/dsm/adapter/iam-agent-grant-dataset-target-validation.adapter.js';
import { PrismaGovernedDatasetRepositoryAdapter } from './features/dsm/adapter/prisma-governed-dataset-repository.adapter.js';
import { IamAgentAuthorityAdapter } from './features/dda/agent/adapter/iam-agent-authority.adapter.js';
import {
  IamActionAuthorizationAdapter,
  type IamActionAuthorizationSourceV1,
} from './features/dda/agent/adapter/iam-action-authorization.adapter.js';
import { IamDdaMutationAuthorizationSourceAdapter } from './features/dda/adapter/iam-dda-mutation-authorization.adapter.js';
import { IamEtlAcceptanceAuthorizationAdapter } from './features/dda/etl/adapter/iam-etl-acceptance-authorization.adapter.js';
import { IamEtlProposalAuthorityAdapter } from './features/dda/etl/adapter/iam-etl-proposal-authority.adapter.js';
import { IamReceiptMutationAuthorizationAdapter } from './features/dda/receipt/adapter/iam-receipt-mutation-authorization.adapter.js';
import { IamGovernedDatasetAuthorizationAdapter } from './features/dsm/adapter/iam-governed-dataset-authorization.adapter.js';
import { IamSourceCatalogAuthorizationAdapter } from './features/dda/source-catalog/adapter/iam-source-catalog-authorization.adapter.js';
import { roleHasPermissionV1 } from '@databreeze/domain/permissions/v1';
import {
  tenantScopeContainsV1,
  tenantScopesEqualV1,
} from '@databreeze/domain/tenant-scope/v1';
import {
  JraWorkerModule,
  type JraWorkerModuleOptions,
} from './features/jra/worker/worker.module.js';
import {
  PrismaJraWorkerAdapter,
  type WorkerResultFinalizationEffectsPortV1,
} from './features/jra/worker/prisma-worker-adapter.js';
import { ServiceAccountWorkerAuthenticator } from './features/jra/worker/service-account-worker-authenticator.js';
import { UnavailableWorkerObjectGrantAuthority } from './features/jra/worker/unavailable-worker-object-grant-authority.js';
import { IaeWorkerObjectGrantAuthorityAdapter } from './features/jra/worker/iae-worker-object-grant-authority.adapter.js';
import {
  IamBackedIaeAuthorizationAdapter,
  UnavailableIaeAuthorizationAdapter,
} from './features/iae/application/iae-authorization.port.js';
import { IaeOriginalViewService } from './features/iae/application/original-view.service.js';
import { UnavailableCloudOriginalSignerAdapter } from './features/iae/adapter/cloud-original-signer.adapter.js';
import { HmacWorkerCapabilitySignerAdapter } from './features/iae/adapter/hmac-worker-capability-signer.adapter.js';
import { PrismaWorkerObjectCapabilityRepositoryAdapter } from './features/iae/adapter/prisma-worker-object-capability-repository.adapter.js';
import { IaeWorkerResultWriteCapabilityService } from './features/iae/application/worker-result-write-capability.service.js';
import { IaeWorkerResultCapabilityAuthorityBridge } from './platform/iae-worker-result-capability.composition.js';
import { composeIaeWorkerObjectCapability } from './platform/iae-production.composition.js';
import type { IaeWorkerObjectCapabilityPortV1 } from './features/iae/application/worker-object-capability.service.js';
import type { WorkerCredentialLookupPortV1 } from './features/iam/application/worker-credential-lookup.port.js';
import type { WorkerSecurityEpochPortV1 } from './features/jra/worker/worker-ports.js';
import { PrismaWorkerResultFinalizationAdapter } from './features/iae/adapter/prisma-worker-result-finalization.adapter.js';
import { IaeWorkerResultFinalizationService } from './features/iae/application/worker-result-finalization.service.js';
import {
  composeAgentAuditPortFromLedger,
  DsmConversationContextVersionAuthorityAdapter,
} from './platform/agent-production.composition.js';
import {
  composeDdaBuaPortFromAdmissionService,
  composeDdaDsmPortFromDatasetVersionRepository,
  composeDdaIaePortFromArtifactRepository,
  composeDdaJraPortFromRepositories,
} from './platform/dda-foundation.composition.js';
import { ObjectStorageArtifactProcessingContentAdapter } from './features/iae/adapter/object-storage-artifact-processing-content.adapter.js';
import { RootArtifactUploadAdmissionAdapter } from './platform/iae-artifact-upload-admission.composition.js';
import { PrismaLocalWebIntakeAdapter } from './features/iae/adapter/local-web-intake.adapter.js';
import { ARTIFACT_UPLOAD_MAX_OBJECT_BYTES_V1 } from './features/iae/application/artifact-upload-admission.port.js';
import {
  PrismaDataModePolicyVersionLookupAdapter,
  PrismaWorkspaceDataModePolicyAuthorityAdapter,
  type WorkspaceDataModePolicyAuthorityDatabaseClientV1,
} from './features/dso/adapter/prisma-workspace-data-mode-policy-authority.adapter.js';
import {
  PrismaWorkspaceExecutionPolicyReferenceAuthorityAdapter,
  type WorkspaceExecutionPolicyReferenceDatabaseClientV1,
} from './features/iam/adapter/prisma-workspace-execution-policy-reference.adapter.js';
import { DsoWorkspacePolicyAuthorityAdapter } from './platform/dso-workspace-policy.composition.js';
import { PrismaWorkerResultFinalizationEffects } from './platform/jra-worker-result-effects.composition.js';

export type AppModuleOptions = SystemModuleOptions &
  IamModuleOptions &
  IaeModuleOptions &
  DsmModuleOptions &
  DsoModuleOptions &
  AudModuleOptions &
  BuaModuleOptions &
  SaModuleOptions &
  FaModuleOptions &
  DqgModuleOptions &
  QiModuleOptions &
  IldModuleOptions &
  DdaModuleOptions &
  JraModuleOptions &
  JraWorkerModuleOptions & {
    /** AUD/BUA participant that writes through the exact JRA serializable transaction. */
    readonly workerResultFinalizationEffects?: WorkerResultFinalizationEffectsPortV1;
  };

@Module({})
export class AppModule {
  static register(options: AppModuleOptions = {}): DynamicModule {
    const sessions =
      options.sessions ??
      (options.sessionDatabase === undefined
        ? undefined
        : new PrismaSessionLifecycleAdapter(options.sessionDatabase));
    const artifactRepository =
      options.artifactRepository ??
      (options.artifactDatabase === undefined
        ? undefined
        : new PrismaArtifactRepositoryAdapter(options.artifactDatabase));
    const artifactIntakeRepository =
      options.artifactIntakeRepository ??
      (options.artifactIntakeDatabase === undefined
        ? undefined
        : new PrismaArtifactIntakeRepositoryAdapter(options.artifactIntakeDatabase));
    const datasetVersionRepository =
      options.datasetVersionRepository ??
      (options.datasetVersionDatabase === undefined
        ? undefined
        : new PrismaDatasetVersionRepositoryAdapter(options.datasetVersionDatabase));
    const entitlementRepository =
      options.entitlementRepository ??
      (options.entitlementDatabase === undefined
        ? undefined
        : new PrismaEntitlementRepositoryAdapter(options.entitlementDatabase));
    const entitlementAdmissionService =
      options.entitlementAdmissionService ??
      (entitlementRepository === undefined
        ? undefined
        : new EntitlementAdmissionService(entitlementRepository));
    const auditRepository =
      options.auditRepository ??
      (options.auditDatabase === undefined
        ? undefined
        : new PrismaAuditRepositoryAdapter(options.auditDatabase, new Sha256AuditDigestAdapter()));
    const auditLedgerService =
      options.auditLedgerService ??
      (auditRepository === undefined
        ? undefined
        : new AuditLedgerService(auditRepository, new Sha256AuditDigestAdapter()));
    // Compose cross-module authorities once at the root. Feature modules consume only
    // their narrow application ports and never import each other's persistence.
    const iamRepository =
      options.iamRepository ??
      (options.iamDatabase === undefined
        ? undefined
        : new PrismaIamRepositoryAdapter(options.iamDatabase));
    const iaeAuthorization =
      options.iaeAuthorization ??
      (iamRepository === undefined
        ? undefined
        : new IamBackedIaeAuthorizationAdapter(iamRepository));
    const iaeOriginalViewPort =
      options.iaeOriginalViewPort ??
      (artifactRepository === undefined
        ? undefined
        : new IaeOriginalViewService(
            artifactRepository,
            iaeAuthorization ?? new UnavailableIaeAuthorizationAdapter(),
            options.cloudOriginalSigner ?? new UnavailableCloudOriginalSignerAdapter(),
          ));
    const accessPresetService = options.accessPresetService ?? new AccessPresetService();
    const agentGrantRepository =
      options.agentGrantRepository ??
      (options.agentGrantDatabase === undefined
        ? undefined
        : new PrismaAgentGrantRepositoryAdapter(options.agentGrantDatabase));
    const governedDatasetRepository =
      options.governedDatasetRepository ??
      (options.governedDatasetDatabase === undefined
        ? undefined
        : new PrismaGovernedDatasetRepositoryAdapter(options.governedDatasetDatabase));
    const datasetTargetValidation =
      governedDatasetRepository === undefined
        ? undefined
        : new IamAgentGrantDatasetTargetValidationAdapter(governedDatasetRepository);
    const agentGrantService =
      options.agentGrantService ??
      (iamRepository === undefined || agentGrantRepository === undefined
        ? undefined
        : new AgentGrantService(
            agentGrantRepository,
            iamRepository,
            accessPresetService,
            undefined,
            undefined,
            datasetTargetValidation,
          ));
    const workspaceEpochResolver =
      agentGrantRepository ??
      (options.runtimeMode === 'production'
        ? new UnavailableWorkspaceAuthorizationEpochResolverAdapter()
        : new InMemoryAgentGrantRepositoryAdapter());
    const workspacePolicyDatabase = options.dataModePolicyDatabase as
      | (WorkspaceDataModePolicyAuthorityDatabaseClientV1 &
          WorkspaceExecutionPolicyReferenceDatabaseClientV1)
      | undefined;
    const executionRouteWorkspacePolicyAuthority =
      options.executionRouteWorkspacePolicyAuthority ??
      (workspacePolicyDatabase === undefined
        ? undefined
        : new DsoWorkspacePolicyAuthorityAdapter(
            new PrismaWorkspaceDataModePolicyAuthorityAdapter(workspacePolicyDatabase),
            new PrismaDataModePolicyVersionLookupAdapter(workspacePolicyDatabase),
            new PrismaWorkspaceExecutionPolicyReferenceAuthorityAdapter(workspacePolicyDatabase),
          ));
    // DSO-018/026/027: activation is never inferred from a database handle. Root callers
    // must supply the fully guarded Admin/MFA/transition/audit/outbox use case explicitly.
    const workspaceDataModePolicyActivation = options.workspaceDataModePolicyActivation;
    const artifactUploadAdmission =
      options.artifactUploadAdmission ??
      (iaeAuthorization === undefined ||
      artifactIntakeRepository === undefined ||
      artifactRepository === undefined ||
      executionRouteWorkspacePolicyAuthority === undefined
        ? undefined
        : new RootArtifactUploadAdmissionAdapter({
            authorization: iaeAuthorization,
            intakes: artifactIntakeRepository,
            artifacts: artifactRepository,
            policies: executionRouteWorkspacePolicyAuthority,
            maxWorkspaceUploadBytes: ARTIFACT_UPLOAD_MAX_OBJECT_BYTES_V1,
          }));
    const requestTenantContext =
      options.requestTenantContext ??
      (typeof sessions?.findPrincipalByAccessToken === 'function'
        ? new SessionRequestTenantContextAdapter(
            {
              findPrincipalByAccessToken: sessions.findPrincipalByAccessToken.bind(sessions),
            },
            workspaceEpochResolver,
          )
        : undefined);
    const agentAuthority =
      options.agentAuthority ??
      (agentGrantService === undefined
        ? undefined
        : new IamAgentAuthorityAdapter(agentGrantService));
    const governedDatasetAuthorization =
      options.governedDatasetAuthorization ??
      (iamRepository === undefined || agentGrantRepository === undefined
        ? undefined
        : new IamGovernedDatasetAuthorizationAdapter(
            iamRepository,
            accessPresetService,
            agentGrantRepository,
          ));
    const conversationContextVersionAuthority =
      options.conversationContextVersionAuthority ??
      (governedDatasetAuthorization === undefined || datasetVersionRepository === undefined
        ? undefined
        : new DsmConversationContextVersionAuthorityAdapter(
            governedDatasetAuthorization,
            datasetVersionRepository,
          ));
    const iaePort =
      options.iaePort ??
      (artifactRepository === undefined
        ? undefined
        : composeDdaIaePortFromArtifactRepository(
            artifactRepository,
            options.artifactProcessingContent ??
              new ObjectStorageArtifactProcessingContentAdapter(),
          ));
    const dsmPort =
      options.dsmPort ??
      (datasetVersionRepository === undefined
        ? undefined
        : composeDdaDsmPortFromDatasetVersionRepository(datasetVersionRepository));
    const buaPort =
      options.buaPort ??
      (entitlementAdmissionService === undefined
        ? undefined
        : composeDdaBuaPortFromAdmissionService(entitlementAdmissionService));
    const audPort =
      options.audPort ??
      (auditLedgerService === undefined
        ? undefined
        : composeAgentAuditPortFromLedger(auditLedgerService));
    const jraPort =
      options.jraPort ??
      (options.jobRepository !== undefined && options.resultManifestRepository !== undefined
        ? composeDdaJraPortFromRepositories({
            jobs: options.jobRepository,
            manifests: options.resultManifestRepository,
          })
        : undefined);
    const sourceCatalogAuthorization =
      options.sourceCatalogAuthorization ??
      (governedDatasetAuthorization === undefined
        ? undefined
        : new IamSourceCatalogAuthorizationAdapter(governedDatasetAuthorization));
    const iamActionSource: IamActionAuthorizationSourceV1 | undefined =
      iamRepository === undefined
        ? undefined
        : {
            authorize: async ({ context, action }) => {
              const membership = await iamRepository.findMembership(context, context.actorId);
              return {
                allowed:
                  membership?.status === 'ACTIVE' &&
                  tenantScopesEqualV1(membership.scope, context.tenantScope) &&
                  roleHasPermissionV1(membership.roleId, action),
              };
            },
          };
    const billingAuthorization =
      options.billingAuthorization ??
      (iamActionSource === undefined
        ? undefined
        : {
            // Billing is organization-owned. A workspace session is therefore
            // authorized by an active organization/workspace ancestor membership,
            // while unrelated tenants still fail closed.
            authorize: async ({ context, permission }: { readonly context: import('./features/iam/application/tenant-context.js').IamTenantContextV1; readonly permission: import('@databreeze/domain/permissions/v1').PermissionV1 }) =>
              iamRepository === undefined
                ? { allowed: false }
                : {
                    allowed: await (async () => {
                      const membership = await iamRepository.findMembership(context, context.actorId);
                      return membership?.status === 'ACTIVE' &&
                        tenantScopeContainsV1(membership.scope, context.tenantScope) &&
                        roleHasPermissionV1(membership.roleId, permission);
                    })(),
                  },
          });
    const agentIamActionAuthorization =
      options.agentIamActionAuthorization ??
      (iamActionSource === undefined
        ? undefined
        : new IamActionAuthorizationAdapter(iamActionSource));
    const ddaMutationAuthorizationSource =
      iamActionSource === undefined
        ? undefined
        : new IamDdaMutationAuthorizationSourceAdapter(iamActionSource, iaePort);
    const receiptMutationAuthorization =
      options.receiptMutationAuthorization ??
      (ddaMutationAuthorizationSource === undefined
        ? undefined
        : new IamReceiptMutationAuthorizationAdapter(ddaMutationAuthorizationSource));
    const etlAcceptanceAuthorization =
      options.etlAcceptanceAuthorization ??
      (ddaMutationAuthorizationSource === undefined
        ? undefined
        : new IamEtlAcceptanceAuthorizationAdapter(ddaMutationAuthorizationSource));
    const etlProposalAuthority =
      options.etlProposalAuthority ??
      (ddaMutationAuthorizationSource === undefined ||
      options.etlProposalResourceResolver === undefined
        ? undefined
        : new IamEtlProposalAuthorityAdapter(
            ddaMutationAuthorizationSource,
            options.etlProposalResourceResolver,
          ));
    const approvalRepository =
      options.approvalRepository ??
      (options.approvalDatabase === undefined
        ? undefined
        : new PrismaApprovalRepositoryAdapter(options.approvalDatabase));
    const approvalAuthority =
      options.approvalAuthority ??
      (approvalRepository === undefined ? undefined : new ApprovalService(approvalRepository));
    const dashboardPublicationApprovalInvalidationExecutor =
      options.dashboardPublicationApprovalInvalidationExecutor ??
      (approvalAuthority === undefined
        ? undefined
        : new JraDashboardPublicationApprovalAdapter(approvalAuthority));
    const serviceAccountRepository =
      options.serviceAccountRepository ??
      (options.serviceAccountDatabase === undefined
        ? undefined
        : new PrismaServiceAccountRepositoryAdapter(options.serviceAccountDatabase));
    const repositoryWorkerLookup = serviceAccountRepository as
      | (WorkerCredentialLookupPortV1 & { readonly findCurrentWorkerCredentialById: unknown })
      | undefined;
    const workerCredentialLookup: WorkerCredentialLookupPortV1 | undefined =
      options.workerCredentialLookup ??
      (repositoryWorkerLookup !== undefined &&
      typeof repositoryWorkerLookup.findCurrentWorkerCredentialByDigest === 'function' &&
      typeof repositoryWorkerLookup.findCurrentWorkerCredentialById === 'function'
        ? repositoryWorkerLookup
        : undefined);
    const workerAuthenticator =
      options.workerAuthenticator ??
      (workerCredentialLookup === undefined
        ? undefined
        : new ServiceAccountWorkerAuthenticator(workerCredentialLookup));
    const workerSecurityEpoch: WorkerSecurityEpochPortV1 | undefined =
      options.workerSecurityEpoch ??
      (workerAuthenticator instanceof ServiceAccountWorkerAuthenticator
        ? workerAuthenticator
        : undefined);
    const workerCapabilitySigner =
      options.workerCapabilitySigner ??
      (options.workerCapabilitySigningSecret === undefined
        ? undefined
        : new HmacWorkerCapabilitySignerAdapter(options.workerCapabilitySigningSecret));
    const workerCapabilityRepository =
      options.workerCapabilityRepository ??
      (options.workerCapabilityDatabase === undefined
        ? undefined
        : new PrismaWorkerObjectCapabilityRepositoryAdapter(options.workerCapabilityDatabase));
    const iaeWorkerObjectCapability: IaeWorkerObjectCapabilityPortV1 | undefined =
      options.iaeWorkerObjectCapability ??
      composeIaeWorkerObjectCapability({
        repository: workerCapabilityRepository,
        inputResolver: options.workerInputObjectResolver,
        outputResolver: options.workerOutputObjectResolver,
        signer: workerCapabilitySigner,
        workerSecurityEpoch,
      });
    const intakeUpload =
      options.intakeUpload ??
      (options.localWebIntakeDatabase !== undefined &&
      options.localWebIntakeObjectStore !== undefined &&
      iaeAuthorization !== undefined &&
      executionRouteWorkspacePolicyAuthority !== undefined
        ? new PrismaLocalWebIntakeAdapter({
            database: options.localWebIntakeDatabase,
            authorization: iaeAuthorization,
            policies: executionRouteWorkspacePolicyAuthority,
            objectStore: options.localWebIntakeObjectStore,
          })
        : undefined);
    const workerCapabilityVerifier =
      options.workerCapabilityVerifier ??
      (workerCapabilitySigner instanceof HmacWorkerCapabilitySignerAdapter
        ? workerCapabilitySigner
        : undefined);
    const workerCapabilityReferenceResolver =
      options.workerCapabilityReferenceResolver ??
      (workerCapabilitySigner instanceof HmacWorkerCapabilitySignerAdapter
        ? workerCapabilitySigner
        : undefined);
    const iaeWorkerResultWriteCapabilityIssuer =
      options.workerResultWriteCapabilityIssuer ??
      (workerCapabilityRepository === undefined ||
      workerCapabilitySigner === undefined ||
      workerSecurityEpoch === undefined
        ? undefined
        : new IaeWorkerResultWriteCapabilityService(
            workerCapabilityRepository,
            workerCapabilitySigner,
            workerSecurityEpoch,
          ));
    const workerResultWriteCapabilities =
      options.workerResultWriteCapabilities ??
      (iaeWorkerResultWriteCapabilityIssuer === undefined
        ? undefined
        : new IaeWorkerResultCapabilityAuthorityBridge(iaeWorkerResultWriteCapabilityIssuer));
    const workerResultFinalizationRepository =
      options.workerResultFinalizationDatabase === undefined
        ? undefined
        : new PrismaWorkerResultFinalizationAdapter(options.workerResultFinalizationDatabase);
    const workerResultAttestations =
      options.workerResultAttestations ?? workerResultFinalizationRepository;
    const iaeWorkerResultFinalization =
      options.iaeWorkerResultFinalization ??
      (workerResultFinalizationRepository === undefined ||
      workerCapabilityVerifier === undefined ||
      workerSecurityEpoch === undefined
        ? undefined
        : new IaeWorkerResultFinalizationService(
            workerResultFinalizationRepository,
            workerCapabilityVerifier,
            workerSecurityEpoch,
          ));
    const workerObjectGrantAuthority =
      options.workerObjectGrantAuthority ??
      (iaeWorkerObjectCapability === undefined
        ? options.jraWorkerDatabase === undefined
          ? undefined
          : new UnavailableWorkerObjectGrantAuthority()
        : new IaeWorkerObjectGrantAuthorityAdapter(iaeWorkerObjectCapability));
    const sameEffectsDatabase =
      options.jraWorkerDatabase !== undefined &&
      options.auditDatabase !== undefined &&
      options.entitlementDatabase !== undefined &&
      options.resultUsageSettlementBindingDatabase !== undefined &&
      (options.jraWorkerDatabase as unknown) === (options.auditDatabase as unknown) &&
      (options.jraWorkerDatabase as unknown) === (options.entitlementDatabase as unknown) &&
      (options.jraWorkerDatabase as unknown) ===
        (options.resultUsageSettlementBindingDatabase as unknown);
    const workerResultFinalizationEffects =
      options.workerResultFinalizationEffects ??
      (sameEffectsDatabase ? new PrismaWorkerResultFinalizationEffects() : undefined);
    const jraWorkerAdapter =
      options.jraWorkerDatabase !== undefined &&
      workerSecurityEpoch !== undefined &&
      workerObjectGrantAuthority !== undefined
        ? new PrismaJraWorkerAdapter(
            options.jraWorkerDatabase,
            workerSecurityEpoch,
            workerObjectGrantAuthority,
            workerResultFinalizationEffects,
          )
        : undefined;
    const runtimeMode =
      options.runtimeMode ??
      (process.env['NODE_ENV'] === 'production' ? 'production' : 'development');
    const composedOptions = {
      ...options,
      ...(sessions === undefined ? {} : { sessions }),
      ...(artifactRepository === undefined ? {} : { artifactRepository }),
      ...(artifactIntakeRepository === undefined ? {} : { artifactIntakeRepository }),
      ...(artifactUploadAdmission === undefined ? {} : { artifactUploadAdmission }),
      ...(intakeUpload === undefined ? {} : { intakeUpload }),
      ...(datasetVersionRepository === undefined ? {} : { datasetVersionRepository }),
      ...(entitlementRepository === undefined ? {} : { entitlementRepository }),
      ...(entitlementAdmissionService === undefined ? {} : { entitlementAdmissionService }),
      ...(auditRepository === undefined ? {} : { auditRepository }),
      ...(auditLedgerService === undefined ? {} : { auditLedgerService }),
      ...(requestTenantContext === undefined ? {} : { requestTenantContext }),
      ...(iamRepository === undefined ? {} : { iamRepository }),
      ...(iaeAuthorization === undefined ? {} : { iaeAuthorization }),
      ...(iaeOriginalViewPort === undefined ? {} : { iaeOriginalViewPort }),
      accessPresetService,
      ...(billingAuthorization === undefined ? {} : { billingAuthorization }),
      ...(agentGrantRepository === undefined ? {} : { agentGrantRepository }),
      ...(executionRouteWorkspacePolicyAuthority === undefined
        ? {}
        : { executionRouteWorkspacePolicyAuthority }),
      ...(workspaceDataModePolicyActivation === undefined
        ? {}
        : { workspaceDataModePolicyActivation }),
      ...(governedDatasetRepository === undefined ? {} : { governedDatasetRepository }),
      ...(agentGrantService === undefined ? {} : { agentGrantService }),
      ...(agentAuthority === undefined ? {} : { agentAuthority }),
      ...(agentIamActionAuthorization === undefined ? {} : { agentIamActionAuthorization }),
      ...(receiptMutationAuthorization === undefined ? {} : { receiptMutationAuthorization }),
      ...(etlAcceptanceAuthorization === undefined ? {} : { etlAcceptanceAuthorization }),
      ...(etlProposalAuthority === undefined ? {} : { etlProposalAuthority }),
      ...(approvalRepository === undefined ? {} : { approvalRepository }),
      ...(approvalAuthority === undefined ? {} : { approvalAuthority }),
      ...(dashboardPublicationApprovalInvalidationExecutor === undefined
        ? {}
        : { dashboardPublicationApprovalInvalidationExecutor }),
      ...(governedDatasetAuthorization === undefined ? {} : { governedDatasetAuthorization }),
      ...(conversationContextVersionAuthority === undefined
        ? {}
        : { conversationContextVersionAuthority }),
      ...(iaePort === undefined ? {} : { iaePort }),
      ...(dsmPort === undefined ? {} : { dsmPort }),
      ...(buaPort === undefined ? {} : { buaPort }),
      ...(audPort === undefined ? {} : { audPort }),
      ...(jraPort === undefined ? {} : { jraPort }),
      ...(entitlementAdmissionService === undefined
        ? {}
        : { agentUsageAdmissionService: entitlementAdmissionService }),
      ...(sourceCatalogAuthorization === undefined ? {} : { sourceCatalogAuthorization }),
      ...(serviceAccountRepository === undefined ? {} : { serviceAccountRepository }),
      ...(workerCredentialLookup === undefined ? {} : { workerCredentialLookup }),
      ...(workerAuthenticator === undefined ? {} : { workerAuthenticator }),
      ...(workerAuthenticator === undefined
        ? {}
        : { workerRequestAuthenticator: workerAuthenticator }),
      ...(workerSecurityEpoch === undefined ? {} : { workerSecurityEpoch }),
      ...(workerCapabilityRepository === undefined ? {} : { workerCapabilityRepository }),
      ...(iaeWorkerObjectCapability === undefined ? {} : { iaeWorkerObjectCapability }),
      ...(workerCapabilitySigner === undefined ? {} : { workerCapabilitySigner }),
      ...(workerCapabilityVerifier === undefined ? {} : { workerCapabilityVerifier }),
      ...(workerCapabilityReferenceResolver === undefined
        ? {}
        : { workerCapabilityReferenceResolver }),
      ...(iaeWorkerResultWriteCapabilityIssuer === undefined
        ? {}
        : { workerResultWriteCapabilityIssuer: iaeWorkerResultWriteCapabilityIssuer }),
      ...(workerResultWriteCapabilities === undefined ? {} : { workerResultWriteCapabilities }),
      ...(iaeWorkerResultFinalization === undefined ? {} : { iaeWorkerResultFinalization }),
      ...(workerResultAttestations === undefined ? {} : { workerResultAttestations }),
      ...(workerObjectGrantAuthority === undefined ? {} : { workerObjectGrantAuthority }),
      ...(workerResultFinalizationEffects === undefined ? {} : { workerResultFinalizationEffects }),
      ...(jraWorkerAdapter === undefined
        ? {}
        : {
            workerAttempts: jraWorkerAdapter,
            workerAttemptAuthority: jraWorkerAdapter,
            workerCompletionTransaction: jraWorkerAdapter,
            workerResultPreparation: jraWorkerAdapter,
            workerVerifiedResultManifests: jraWorkerAdapter,
            ...(workerResultFinalizationEffects === undefined
              ? {}
              : { workerResultFinalization: jraWorkerAdapter }),
          }),
    };
    return {
      module: AppModule,
      imports: [
        SystemModule.register(composedOptions),
        IamModule.register(composedOptions),
        IaeModule.register(composedOptions),
        DsmModule.register(composedOptions),
        DsoModule.register(composedOptions),
        AudModule.register(composedOptions),
        BuaModule.register(composedOptions),
        SaModule.register(composedOptions),
        FaModule.register(composedOptions),
        DqgModule.register(composedOptions),
        QiModule.register(composedOptions),
        IldModule.register(composedOptions),
        DdaModule.register(composedOptions),
        JraModule.register({
          ...composedOptions,
          runtimeMode,
          allowInMemoryAdapters: options.allowInMemoryAdapters ?? runtimeMode !== 'production',
        }),
        JraWorkerModule.register(composedOptions as JraWorkerModuleOptions),
      ],
    };
  }
}

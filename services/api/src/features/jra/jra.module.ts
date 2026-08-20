import { type DynamicModule, Module } from '@nestjs/common';

import { ApprovalController } from './api/approval.controller.js';
import { JobHistoryController } from './api/job-history.controller.js';

import {
  PrismaApprovalRepositoryAdapter,
  type JraApprovalDatabaseClientV1,
} from './adapter/prisma-approval-repository.adapter.js';
import { InMemoryApprovalRepositoryAdapter } from './adapter/in-memory-approval-repository.adapter.js';
import {
  JRA_APPROVAL_AUTHORITY_PORT,
  type JraApprovalAuthorityPortV1,
} from './application/approval-authority.port.js';
import { ApprovalService } from './application/approval.service.js';
import { IAM_REPOSITORY_PORT } from '../iam/application/iam-repository.port.js';
import type { IamRepositoryPortV1 } from '../iam/application/iam-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';
import {
  APPROVAL_REPOSITORY_PORT,
  type ApprovalRepositoryPortV1,
} from './application/approval-repository.port.js';
import {
  RESULT_MANIFEST_REPOSITORY_PORT,
  type ResultManifestRepositoryPortV1,
} from './application/result-manifest-repository.port.js';
import {
  JOB_REPOSITORY_PORT,
  type JobRepositoryPortV1,
} from './application/job-repository.port.js';
import {
  JOB_HISTORY_READ_PORT,
  type JobHistoryReadPortV1,
  UnavailableJobHistoryReadAdapter,
} from './application/job-history-read.port.js';
import {
  PrismaJobHistoryReadAdapter,
  type JobHistoryDatabaseClientV1,
} from './adapter/prisma-job-history-read.adapter.js';
import {
  JRA_ADMISSION_REPOSITORY_PORT,
  type JraAdmissionRepositoryPortV1,
  type JraAdmissionEntitlementParticipantV1,
} from './application/admission-repository.port.js';
import { PrismaJraAdmissionRepositoryAdapter } from './adapter/prisma-admission-repository.adapter.js';
import { JraAdmissionService } from './application/admission.service.js';
import {
  UnavailableExecutionRequestDescriptorVerifier,
  type ExecutionRequestDescriptorVerifierPortV1,
} from './application/execution-request-descriptor.js';
import {
  READY_JOB_QUEUE_REPOSITORY_PORT,
  type ReadyJobQueueRepositoryPortV1,
} from './application/ready-job-queue.port.js';
import { ReadyJobQueueService } from './application/ready-job-queue.service.js';

export interface JraModuleOptions {
  readonly runtimeMode?: 'production' | 'test' | 'development';
  readonly allowInMemoryAdapters?: boolean;
  readonly approvalDatabase?: JraApprovalDatabaseClientV1;
  readonly approvalRepository?: ApprovalRepositoryPortV1;
  /** Root-composed durable authority; used when DDA needs a narrow post-commit command port. */
  readonly approvalAuthority?: JraApprovalAuthorityPortV1;
  /** Root-composed immutable execution repositories consumed through public ports. */
  readonly jobRepository?: JobRepositoryPortV1;
  readonly jobHistoryRead?: JobHistoryReadPortV1;
  readonly jobHistoryDatabase?: JobHistoryDatabaseClientV1;
  readonly resultManifestRepository?: ResultManifestRepositoryPortV1;
  /** Typed job admission is composed only with an explicit descriptor verifier. */
  readonly admissionRepository?: JraAdmissionRepositoryPortV1;
  readonly admissionEntitlementParticipant?: JraAdmissionEntitlementParticipantV1;
  readonly admissionDatabase?: import('./adapter/prisma-admission-repository.adapter.js').PrismaAdmissionDatabaseClientV1;
  readonly admissionDescriptorVerifier?: ExecutionRequestDescriptorVerifierPortV1;
  readonly admissionService?: JraAdmissionService;
  /** Root-composed PostgreSQL ready scanner; absent means no dispatch promotion. */
  readonly readyJobQueueRepository?: ReadyJobQueueRepositoryPortV1;
  readonly readyJobQueueService?: ReadyJobQueueService;
  readonly iamRepository?: IamRepositoryPortV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
}

@Module({})
export class JraModule {
  public static register(options: JraModuleOptions = {}): DynamicModule {
    const runtimeMode =
      options.runtimeMode ??
      (process.env['NODE_ENV'] === 'production' ? 'production' : 'development');
    if (
      options.approvalDatabase === undefined &&
      options.approvalRepository === undefined &&
      options.approvalAuthority === undefined &&
      options.allowInMemoryAdapters !== true
    ) {
      throw new Error('JRA_APPROVAL_DATABASE_REQUIRED');
    }
    if (
      runtimeMode === 'production' &&
      options.approvalDatabase === undefined &&
      options.approvalAuthority === undefined
    ) {
      throw new Error('JRA_APPROVAL_DATABASE_REQUIRED');
    }
    const repository =
      options.approvalRepository ??
      (options.approvalDatabase === undefined
        ? new InMemoryApprovalRepositoryAdapter()
        : new PrismaApprovalRepositoryAdapter(options.approvalDatabase));
    const service = options.approvalAuthority ?? new ApprovalService(repository);
    const admissionRepository =
      options.admissionRepository ??
      (options.admissionDatabase === undefined
        ? undefined
        : new PrismaJraAdmissionRepositoryAdapter(
            options.admissionDatabase,
            options.admissionEntitlementParticipant,
          ));
    const admissionService =
      options.admissionService ??
      (admissionRepository === undefined
        ? undefined
        : new JraAdmissionService(
            admissionRepository,
            options.admissionDescriptorVerifier ??
              new UnavailableExecutionRequestDescriptorVerifier(),
          ));
    const readyJobQueueService =
      options.readyJobQueueService ??
      (options.readyJobQueueRepository === undefined
        ? undefined
        : new ReadyJobQueueService(options.readyJobQueueRepository));
    return {
      module: JraModule,
      controllers: [ApprovalController, JobHistoryController],
      providers: [
        { provide: APPROVAL_REPOSITORY_PORT, useValue: repository },
        ...(admissionRepository === undefined
          ? []
          : [
              {
                provide: JRA_ADMISSION_REPOSITORY_PORT,
                useValue: admissionRepository,
              },
            ]),
        ...(admissionService === undefined
          ? []
          : [{ provide: JraAdmissionService, useValue: admissionService }]),
        ...(options.readyJobQueueRepository === undefined
          ? []
          : [
              {
                provide: READY_JOB_QUEUE_REPOSITORY_PORT,
                useValue: options.readyJobQueueRepository,
              },
            ]),
        ...(readyJobQueueService === undefined
          ? []
          : [{ provide: ReadyJobQueueService, useValue: readyJobQueueService }]),
        ...(options.iamRepository === undefined
          ? []
          : [{ provide: IAM_REPOSITORY_PORT, useValue: options.iamRepository }]),
        {
          provide: REQUEST_TENANT_CONTEXT,
          useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter(),
        },
        { provide: JRA_APPROVAL_AUTHORITY_PORT, useValue: service },
        { provide: ApprovalService, useValue: service },
        ...(options.jobRepository === undefined
          ? []
          : [{ provide: JOB_REPOSITORY_PORT, useValue: options.jobRepository }]),
        ...(options.resultManifestRepository === undefined
          ? []
          : [
              {
                provide: RESULT_MANIFEST_REPOSITORY_PORT,
                useValue: options.resultManifestRepository,
              },
            ]),
        {
          provide: JOB_HISTORY_READ_PORT,
          useValue:
            options.jobHistoryRead ??
            (options.jobHistoryDatabase === undefined
              ? new UnavailableJobHistoryReadAdapter()
              : new PrismaJobHistoryReadAdapter(options.jobHistoryDatabase)),
        },
      ],
      exports: [
        APPROVAL_REPOSITORY_PORT,
        ...(admissionRepository === undefined ? [] : [JRA_ADMISSION_REPOSITORY_PORT]),
        ...(admissionService === undefined ? [] : [JraAdmissionService]),
        ...(options.readyJobQueueRepository === undefined ? [] : [READY_JOB_QUEUE_REPOSITORY_PORT]),
        ...(readyJobQueueService === undefined ? [] : [ReadyJobQueueService]),
        JRA_APPROVAL_AUTHORITY_PORT,
        ApprovalService,
        ...(options.jobRepository === undefined ? [] : [JOB_REPOSITORY_PORT]),
        ...(options.resultManifestRepository === undefined
          ? []
          : [RESULT_MANIFEST_REPOSITORY_PORT]),
        JOB_HISTORY_READ_PORT,
      ],
    };
  }
}

import { type DynamicModule, Module } from '@nestjs/common';

import { ApprovalController } from './api/approval.controller.js';

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
import { REQUEST_TENANT_CONTEXT, type RequestTenantContextPortV1, UnavailableRequestTenantContextAdapter } from '../../platform/http/request-tenant-context.port.js';
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

export interface JraModuleOptions {
  readonly runtimeMode?: 'production' | 'test' | 'development';
  readonly allowInMemoryAdapters?: boolean;
  readonly approvalDatabase?: JraApprovalDatabaseClientV1;
  readonly approvalRepository?: ApprovalRepositoryPortV1;
  /** Root-composed durable authority; used when DDA needs a narrow post-commit command port. */
  readonly approvalAuthority?: JraApprovalAuthorityPortV1;
  /** Root-composed immutable execution repositories consumed through public ports. */
  readonly jobRepository?: JobRepositoryPortV1;
  readonly resultManifestRepository?: ResultManifestRepositoryPortV1;
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
    return {
      module: JraModule,
      controllers: [ApprovalController],
      providers: [
        { provide: APPROVAL_REPOSITORY_PORT, useValue: repository },
        ...(options.iamRepository === undefined ? [] : [{ provide: IAM_REPOSITORY_PORT, useValue: options.iamRepository }]),
        { provide: REQUEST_TENANT_CONTEXT, useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter() },
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
      ],
      exports: [
        APPROVAL_REPOSITORY_PORT,
        JRA_APPROVAL_AUTHORITY_PORT,
        ApprovalService,
        ...(options.jobRepository === undefined ? [] : [JOB_REPOSITORY_PORT]),
        ...(options.resultManifestRepository === undefined
          ? []
          : [RESULT_MANIFEST_REPOSITORY_PORT]),
      ],
    };
  }
}

import { type DynamicModule, Module } from '@nestjs/common';

import { CrfReportController } from './api/report.controller.js';
import { InMemoryCrfReportRepositoryAdapter } from './adapter/in-memory-report-repository.adapter.js';
import {
  PrismaCrfReportRepositoryAdapter,
  type CrfReportDatabaseClientV1,
} from './adapter/prisma-report-repository.adapter.js';
import {
  CRF_DATASET_VERSION_REPOSITORY_PORT,
  CRF_GOVERNED_DATASET_REPOSITORY_PORT,
} from './application/report.module-ports.js';
import {
  CRF_REPORT_REPOSITORY_PORT,
  UnavailableCrfReportRepositoryAdapter,
  type CrfReportRepositoryPortV1,
} from './application/report-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../platform/http/request-tenant-context.port.js';
import {
  IAM_REPOSITORY_PORT,
  type IamRepositoryPortV1,
} from '../iam/application/iam-repository.port.js';
import {
  IAM_HIERARCHY_REPOSITORY,
  type IamHierarchyRepositoryPortV1,
} from '../iam/application/hierarchy-repository.port.js';
import type { GovernedDatasetRepositoryPortV1 } from '../dsm/application/governed-dataset-repository.port.js';
import type { DatasetVersionRepositoryPortV1 } from '../dsm/application/dataset-version-repository.port.js';

export interface CrfModuleOptions {
  readonly runtimeMode?: 'production' | 'test' | 'development';
  readonly allowInMemoryAdapters?: boolean;
  readonly reportRepository?: CrfReportRepositoryPortV1;
  readonly reportDatabase?: CrfReportDatabaseClientV1;
  readonly governedDatasetRepository?: GovernedDatasetRepositoryPortV1;
  readonly datasetVersionRepository?: DatasetVersionRepositoryPortV1;
  readonly hierarchyRepository?: IamHierarchyRepositoryPortV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
  readonly iamRepository?: IamRepositoryPortV1;
}

@Module({})
export class CrfModule {
  public static register(options: CrfModuleOptions = {}): DynamicModule {
    const runtimeMode =
      options.runtimeMode ??
      (process.env['NODE_ENV'] === 'production' ? 'production' : 'development');
    const repository =
      options.reportRepository ??
      (options.reportDatabase === undefined
        ? runtimeMode === 'production' || options.allowInMemoryAdapters !== true
          ? new UnavailableCrfReportRepositoryAdapter()
          : new InMemoryCrfReportRepositoryAdapter()
        : new PrismaCrfReportRepositoryAdapter(options.reportDatabase));
    const governed = options.governedDatasetRepository;
    const versions = options.datasetVersionRepository;
    // A missing DSM authority must make Reports return a bounded 503, not stop
    // the entire API from booting. Production composition supplies these ports
    // when DSM is available; partial roots and maintenance processes can still
    // start safely while the CRF surface remains fail-closed.
    return {
      module: CrfModule,
      controllers: [CrfReportController],
      providers: [
        { provide: CRF_REPORT_REPOSITORY_PORT, useValue: repository },
        {
          provide: CRF_GOVERNED_DATASET_REPOSITORY_PORT,
          useValue: governed ?? new UnavailableCrfDatasetRepositoryAdapter(),
        },
        {
          provide: CRF_DATASET_VERSION_REPOSITORY_PORT,
          useValue: versions ?? new UnavailableCrfDatasetVersionRepositoryAdapter(),
        },
        {
          provide: REQUEST_TENANT_CONTEXT,
          useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter(),
        },
        ...(options.iamRepository === undefined
          ? []
          : [{ provide: IAM_REPOSITORY_PORT, useValue: options.iamRepository }]),
        ...(options.hierarchyRepository === undefined
          ? []
          : [{ provide: IAM_HIERARCHY_REPOSITORY, useValue: options.hierarchyRepository }]),
      ],
      exports: [CRF_REPORT_REPOSITORY_PORT],
    };
  }
}

class UnavailableCrfDatasetRepositoryAdapter {
  public find(): Promise<never> {
    return Promise.reject(new Error('CRF_DATASET_AUTHORITY_UNAVAILABLE'));
  }
}

class UnavailableCrfDatasetVersionRepositoryAdapter {
  public find(): Promise<never> {
    return Promise.reject(new Error('CRF_DATASET_AUTHORITY_UNAVAILABLE'));
  }
}

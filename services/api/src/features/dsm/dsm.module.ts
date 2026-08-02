import { type DynamicModule, Module } from '@nestjs/common';

import { GovernedDatasetController } from './api/governed-dataset.controller.js';
import { MappingController } from './api/mapping.controller.js';
import { ReferenceEntityController } from './api/reference-entity.controller.js';
import { RuleSetController } from './api/rule-set.controller.js';
import { DatasetVersionController } from './api/dataset-version.controller.js';
import { DatasetQualityController } from './api/dataset-quality.controller.js';
import { InMemoryGovernedDatasetRepositoryAdapter } from './adapter/in-memory-governed-dataset-repository.adapter.js';
import {
  PrismaGovernedDatasetRepositoryAdapter,
  type GovernedDatasetDatabaseClientV1,
} from './adapter/prisma-governed-dataset-repository.adapter.js';
import { InMemoryMappingRepositoryAdapter } from './adapter/in-memory-mapping-repository.adapter.js';
import {
  PrismaMappingRepositoryAdapter,
  type MappingDatabaseClientV1,
} from './adapter/prisma-mapping-repository.adapter.js';
import { InMemoryReferenceEntityRepositoryAdapter } from './adapter/in-memory-reference-entity-repository.adapter.js';
import {
  PrismaReferenceEntityRepositoryAdapter,
  type ReferenceEntityDatabaseClientV1,
} from './adapter/prisma-reference-entity-repository.adapter.js';
import { InMemoryRuleSetRepositoryAdapter } from './adapter/in-memory-rule-set-repository.adapter.js';
import { InMemoryDatasetVersionRepositoryAdapter } from './adapter/in-memory-dataset-version-repository.adapter.js';
import {
  PrismaDatasetVersionRepositoryAdapter,
  type DatasetVersionDatabaseClientV1,
} from './adapter/prisma-dataset-version-repository.adapter.js';
import { InMemoryDatasetQualityRepositoryAdapter } from './adapter/in-memory-dataset-quality-repository.adapter.js';
import {
  PrismaDatasetQualityRepositoryAdapter,
  type DatasetQualityDatabaseClientV1,
} from './adapter/prisma-dataset-quality-repository.adapter.js';
import {
  PrismaRuleSetRepositoryAdapter,
  type RuleSetDatabaseClientV1,
} from './adapter/prisma-rule-set-repository.adapter.js';
import {
  GOVERNED_DATASET_REPOSITORY_PORT,
  type GovernedDatasetRepositoryPortV1,
} from './application/governed-dataset-repository.port.js';
import {
  MAPPING_REPOSITORY_PORT,
  type MappingRepositoryPortV1,
} from './application/mapping-repository.port.js';
import {
  REFERENCE_ENTITY_REPOSITORY_PORT,
  type ReferenceEntityRepositoryPortV1,
} from './application/reference-entity-repository.port.js';
import {
  RULE_SET_REPOSITORY_PORT,
  type RuleSetRepositoryPortV1,
} from './application/rule-set-repository.port.js';
import {
  DATASET_VERSION_REPOSITORY_PORT,
  type DatasetVersionRepositoryPortV1,
} from './application/dataset-version-repository.port.js';
import {
  DATASET_QUALITY_REPOSITORY_PORT,
  type DatasetQualityRepositoryPortV1,
} from './application/dataset-quality-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';

export interface DsmModuleOptions {
  readonly governedDatasetRepository?: GovernedDatasetRepositoryPortV1;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly governedDatasetDatabase?: GovernedDatasetDatabaseClientV1;
  readonly mappingRepository?: MappingRepositoryPortV1;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly mappingDatabase?: MappingDatabaseClientV1;
  readonly ruleSetRepository?: RuleSetRepositoryPortV1;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly ruleSetDatabase?: RuleSetDatabaseClientV1;
  readonly referenceEntityRepository?: ReferenceEntityRepositoryPortV1;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly referenceEntityDatabase?: ReferenceEntityDatabaseClientV1;
  readonly datasetVersionRepository?: DatasetVersionRepositoryPortV1;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly datasetVersionDatabase?: DatasetVersionDatabaseClientV1;
  readonly datasetQualityRepository?: DatasetQualityRepositoryPortV1;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly datasetQualityDatabase?: DatasetQualityDatabaseClientV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
}

@Module({})
export class DsmModule {
  public static register(options: DsmModuleOptions = {}): DynamicModule {
    return {
      module: DsmModule,
      controllers: [
        GovernedDatasetController,
        MappingController,
        RuleSetController,
        ReferenceEntityController,
        DatasetVersionController,
        DatasetQualityController,
      ],
      providers: [
        {
          provide: GOVERNED_DATASET_REPOSITORY_PORT,
          useValue:
            options.governedDatasetRepository ??
            (options.governedDatasetDatabase === undefined
              ? new InMemoryGovernedDatasetRepositoryAdapter()
              : new PrismaGovernedDatasetRepositoryAdapter(options.governedDatasetDatabase)),
        },
        {
          provide: MAPPING_REPOSITORY_PORT,
          useValue:
            options.mappingRepository ??
            (options.mappingDatabase === undefined
              ? new InMemoryMappingRepositoryAdapter()
              : new PrismaMappingRepositoryAdapter(options.mappingDatabase)),
        },
        {
          provide: RULE_SET_REPOSITORY_PORT,
          useValue:
            options.ruleSetRepository ??
            (options.ruleSetDatabase === undefined
              ? new InMemoryRuleSetRepositoryAdapter()
              : new PrismaRuleSetRepositoryAdapter(options.ruleSetDatabase)),
        },
        {
          provide: REFERENCE_ENTITY_REPOSITORY_PORT,
          useValue:
            options.referenceEntityRepository ??
            (options.referenceEntityDatabase === undefined
              ? new InMemoryReferenceEntityRepositoryAdapter()
              : new PrismaReferenceEntityRepositoryAdapter(options.referenceEntityDatabase)),
        },
        {
          provide: DATASET_VERSION_REPOSITORY_PORT,
          useValue:
            options.datasetVersionRepository ??
            (options.datasetVersionDatabase === undefined
              ? new InMemoryDatasetVersionRepositoryAdapter()
              : new PrismaDatasetVersionRepositoryAdapter(options.datasetVersionDatabase)),
        },
        {
          provide: DATASET_QUALITY_REPOSITORY_PORT,
          useValue:
            options.datasetQualityRepository ??
            (options.datasetQualityDatabase === undefined
              ? new InMemoryDatasetQualityRepositoryAdapter()
              : new PrismaDatasetQualityRepositoryAdapter(options.datasetQualityDatabase)),
        },
        {
          provide: REQUEST_TENANT_CONTEXT,
          useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter(),
        },
      ],
    };
  }
}

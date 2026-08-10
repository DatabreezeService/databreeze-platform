import { type DynamicModule, Module } from '@nestjs/common';

import { InMemoryAnalysisPlanRepositoryAdapter } from './adapter/in-memory-analysis-plan-repository.adapter.js';
import { InMemoryDashboardRepositoryAdapter } from './adapter/in-memory-dashboard-repository.adapter.js';
import { InMemoryRefreshRepositoryAdapter } from './adapter/in-memory-refresh-repository.adapter.js';
import {
  ANALYSIS_PLAN_REPOSITORY_PORT,
  type AnalysisPlanRepositoryPortV1,
} from './application/analysis-plan-repository.port.js';
import {
  DASHBOARD_REPOSITORY_PORT,
  type DashboardRepositoryPortV1,
} from './application/dashboard-repository.port.js';
import { DDA_AUDIT_PORT, type DdaAuditPortV1 } from './application/dda-audit.port.js';
import { DdaContentAuthorityV1 } from './application/dda-content-authority.js';
import { DdaPolicyServiceV1 } from './application/dda-policy.service.js';
import {
  DDA_AUD_PORT,
  DDA_BUA_PORT,
  DDA_DSM_PORT,
  DDA_DSO_PORT,
  DDA_IAE_PORT,
  DDA_JRA_PORT,
  type DdaAudComposePortV1,
  type DdaBuaPortV1,
  type DdaDsmPortV1,
  type DdaDsoPortV1,
  type DdaIaePortV1,
  type DdaJraPortV1,
} from './application/foundation-ports.js';
import {
  REFRESH_REPOSITORY_PORT,
  type RefreshRepositoryPortV1,
} from './application/refresh-repository.port.js';

export interface DdaModuleOptions {
  readonly dashboardRepository?: DashboardRepositoryPortV1;
  readonly analysisPlanRepository?: AnalysisPlanRepositoryPortV1;
  readonly refreshRepository?: RefreshRepositoryPortV1;
  readonly iaePort?: DdaIaePortV1;
  readonly dsmPort?: DdaDsmPortV1;
  readonly jraPort?: DdaJraPortV1;
  readonly dsoPort?: DdaDsoPortV1;
  readonly buaPort?: DdaBuaPortV1;
  readonly audPort?: DdaAudComposePortV1;
  readonly auditPort?: DdaAuditPortV1;
}

const unavailable = (name: string) => ({
  async requireArtifactVersion() {
    throw new Error(`${name}_UNAVAILABLE`);
  },
  async requireEvidenceReference() {
    throw new Error(`${name}_UNAVAILABLE`);
  },
  async addRetentionConstraint() {
    throw new Error(`${name}_UNAVAILABLE`);
  },
  async requireDatasetVersion() {
    throw new Error(`${name}_UNAVAILABLE`);
  },
  async requireSemanticVersion() {
    throw new Error(`${name}_UNAVAILABLE`);
  },
  async requireMetricVersion() {
    throw new Error(`${name}_UNAVAILABLE`);
  },
  async requireJob() {
    throw new Error(`${name}_UNAVAILABLE`);
  },
  async requireResultManifest() {
    throw new Error(`${name}_UNAVAILABLE`);
  },
  async requireCapabilityGrant() {
    throw new Error(`${name}_UNAVAILABLE`);
  },
  async requireProjection() {
    throw new Error(`${name}_UNAVAILABLE`);
  },
  async requireAdmission() {
    throw new Error(`${name}_UNAVAILABLE`);
  },
  async emitContentSafeSummary() {
    throw new Error(`${name}_UNAVAILABLE`);
  },
});

@Module({})
export class DdaModule {
  public static register(options: DdaModuleOptions = {}): DynamicModule {
    return {
      module: DdaModule,
      providers: [
        {
          provide: DASHBOARD_REPOSITORY_PORT,
          useValue: options.dashboardRepository ?? new InMemoryDashboardRepositoryAdapter(),
        },
        {
          provide: ANALYSIS_PLAN_REPOSITORY_PORT,
          useValue: options.analysisPlanRepository ?? new InMemoryAnalysisPlanRepositoryAdapter(),
        },
        {
          provide: REFRESH_REPOSITORY_PORT,
          useValue: options.refreshRepository ?? new InMemoryRefreshRepositoryAdapter(),
        },
        { provide: DDA_IAE_PORT, useValue: options.iaePort ?? unavailable('IAE') },
        { provide: DDA_DSM_PORT, useValue: options.dsmPort ?? unavailable('DSM') },
        { provide: DDA_JRA_PORT, useValue: options.jraPort ?? unavailable('JRA') },
        { provide: DDA_DSO_PORT, useValue: options.dsoPort ?? unavailable('DSO') },
        { provide: DDA_BUA_PORT, useValue: options.buaPort ?? unavailable('BUA') },
        { provide: DDA_AUD_PORT, useValue: options.audPort ?? unavailable('AUD') },
        {
          provide: DDA_AUDIT_PORT,
          useValue:
            options.auditPort ??
            ({
              async emitContentSafeSummary() {
                throw new Error('AUD_UNAVAILABLE');
              },
            } satisfies DdaAuditPortV1),
        },
        {
          provide: DdaContentAuthorityV1,
          useFactory: () => new DdaContentAuthorityV1(),
        },
        {
          provide: DdaPolicyServiceV1,
          useFactory: (audit: DdaAuditPortV1, iae: DdaIaePortV1) =>
            new DdaPolicyServiceV1(audit, iae),
          inject: [DDA_AUDIT_PORT, DDA_IAE_PORT],
        },
      ],
      exports: [
        DASHBOARD_REPOSITORY_PORT,
        ANALYSIS_PLAN_REPOSITORY_PORT,
        REFRESH_REPOSITORY_PORT,
        DDA_IAE_PORT,
        DDA_DSM_PORT,
        DDA_JRA_PORT,
        DDA_DSO_PORT,
        DDA_BUA_PORT,
        DDA_AUD_PORT,
        DDA_AUDIT_PORT,
        DdaContentAuthorityV1,
        DdaPolicyServiceV1,
      ],
    };
  }
}

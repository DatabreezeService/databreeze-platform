/* eslint-disable @typescript-eslint/require-await -- composition fakes mirror async authority ports. */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createDatasetVersionManifestV1 } from '@databreeze/domain/dataset-governance/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import { AppModule } from '../../src/app.module.js';
import { BuaAgentUsageAdapter } from '../../src/features/dda/agent/adapter/bua-agent-usage.adapter.js';
import type {
  AgentAuthorityPortV1,
  AgentToolExecutorPortV1,
} from '../../src/features/dda/agent/application/agent-runtime.port.js';
import { PrismaAgentConsequentialCommandAdapter } from '../../src/features/dda/agent/adapter/prisma-agent-consequential-command.adapter.js';
import {
  AGENT_AUTHORITY_PORT,
  AGENT_TOOL_EXECUTOR_PORT,
  AGENT_USAGE_PORT,
  type AgentUsageAdmissionInputV1,
} from '../../src/features/dda/agent/application/agent-runtime.port.js';
import { AgentToolRegistryV1 } from '../../src/features/dda/agent/application/agent-tool-registry.js';
import type { AgentDatasetReaderPortV1 } from '../../src/features/dda/agent/application/typed-agent-tool-executor-dependencies.port.js';
import type { DdaAudComposePortV1 } from '../../src/features/dda/application/foundation-ports.js';
import { AGENT_CONSEQUENTIAL_COMMAND_PORT } from '../../src/features/dda/agent/application/agent-consequential-command.port.js';
import {
  DisabledAgentProviderAdapter,
  AGENT_PROVIDER_PORT as AGENT_PROVIDER_TOKEN,
} from '../../src/features/dda/agent/application/agent-provider.port.js';
import { DdaModule } from '../../src/features/dda/dda.module.js';
import {
  CONVERSATION_CONTEXT_VERSION_AUTHORITY_PORT,
  type ConversationContextVersionAuthorityPortV1,
} from '../../src/features/dda/conversation/api/conversation.controller.js';
import { DASHBOARD_AUTHORIZATION_PORT } from '../../src/features/dda/dashboard/application/dashboard-http-ports.js';
import { ENTITLEMENT_ADMISSION_SERVICE } from '../../src/features/bua/bua.module.js';
import { BuaModule } from '../../src/features/bua/bua.module.js';
import { InMemoryEntitlementRepositoryAdapter } from '../../src/features/bua/adapter/in-memory-entitlement-repository.adapter.js';
import { InMemoryDatasetVersionRepositoryAdapter } from '../../src/features/dsm/adapter/in-memory-dataset-version-repository.adapter.js';
import type { GovernedDatasetAuthorizationPortV1 } from '../../src/features/dsm/application/governed-dataset-authorization.port.js';
import { InMemoryAgentGrantRepositoryAdapter } from '../../src/features/iam/adapter/in-memory-agent-grant-repository.adapter.js';
import { InMemoryIamRepositoryAdapter } from '../../src/features/iam/adapter/in-memory-iam-repository.adapter.js';
import type { IamMembershipRecordV1 } from '../../src/features/iam/application/iam-repository.port.js';
import type {
  WorkspaceAgentGrantRecordV1,
  WorkspaceDatasetRestrictionRecordV1,
} from '../../src/features/iam/application/agent-grant-repository.port.js';
import { AccessPresetService } from '../../src/features/iam/application/access-preset.service.js';
import type { IamTenantContextV1 } from '../../src/features/iam/application/tenant-context.js';
import type { DynamicModule } from '@nestjs/common';
import type { DdaDatabaseClientV1 } from '../../src/features/dda/adapter/dda-database.client.js';
import { DsmConversationContextVersionAuthorityAdapter } from '../../src/platform/agent-production.composition.js';

const ids = Object.freeze({
  organization: '00000000-0000-4000-8000-000000000001',
  workspace: '00000000-0000-4000-8000-000000000002',
  actor: '00000000-0000-4000-8000-000000000003',
  correlation: '00000000-0000-4000-8000-000000000004',
  dataset: '00000000-0000-4000-8000-000000000005',
  version: '00000000-0000-4000-8000-000000000006',
  membership: '00000000-0000-4000-8000-000000000007',
  grant: '00000000-0000-4000-8000-000000000008',
});

function stable(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid agent production composition fixture');
  return parsed.value;
}

function workspaceScope(): TenantScopeV1 & { readonly scopeType: 'workspace' } {
  return {
    scopeType: 'workspace',
    organizationId: stable(ids.organization),
    workspaceId: stable(ids.workspace),
  };
}

function timestamp() {
  const parsed = parseStrictUtcTimestampV1('2026-08-13T00:00:00.000Z');
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid agent production composition timestamp');
  return parsed.value;
}

function context(): IamTenantContextV1 {
  return {
    tenantScope: workspaceScope(),
    actorId: ids.actor,
    correlationId: ids.correlation,
    idempotencyKey: 'agent-production-composition',
    authorizationEpoch: 1,
    mfaReenrollmentRequired: false,
  } as IamTenantContextV1;
}

function providerValue(module: DynamicModule, token: unknown): unknown {
  const providers = (module.providers ?? []) as readonly {
    readonly provide?: unknown;
    readonly useValue?: unknown;
  }[];
  return providers.find((provider) => provider.provide === token)?.useValue;
}

function imported(root: DynamicModule, moduleType: unknown): DynamicModule {
  const match = (root.imports ?? []).find(
    (candidate): candidate is DynamicModule =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'module' in candidate &&
      candidate.module === moduleType,
  );
  assert.ok(match);
  return match;
}

function datasetVersion() {
  const result = createDatasetVersionManifestV1({
    datasetId: ids.dataset,
    versionId: ids.version,
    tenantScope: context().tenantScope,
    inputArtifactVersionIds: [],
    schemaVersionId: '00000000-0000-4000-8000-000000000007',
    mappingVersionId: '00000000-0000-4000-8000-000000000008',
    ruleSetVersionId: '00000000-0000-4000-8000-000000000009',
    engineBuild: 'engine@1',
    contentFingerprint: 'a'.repeat(64),
    rowCount: 1,
    qualityState: 'PASS',
    lineageManifestHash: 'b'.repeat(64),
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid dataset version fixture');
  return result.value;
}

function withEnvironment<TValue>(
  values: Readonly<Record<string, string | undefined>>,
  work: () => TValue,
): TValue {
  const keys = Object.keys(values);
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return work();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

void test('[DDA-060] production provider is disabled without validated server owner configuration', () => {
  withEnvironment(
    {
      DATABREEZE_OPENAI_AGENT_ENABLED: undefined,
      OPENAI_API_KEY: undefined,
    },
    () => {
      const module = DdaModule.register({
        runtimeMode: 'production',
        ddaDatabase: {} as DdaDatabaseClientV1,
      });
      const provider = providerValue(module, AGENT_PROVIDER_TOKEN);
      assert.ok(provider instanceof DisabledAgentProviderAdapter);
    },
  );
});

void test('[DDA-060] production provider uses validated server configuration without reflecting the secret', () => {
  const secret = 'sk-production-agent-secret-1234';
  withEnvironment(
    {
      DATABREEZE_OPENAI_AGENT_ENABLED: 'true',
      OPENAI_API_KEY: secret,
      DATABREEZE_OPENAI_AGENT_MODEL: undefined,
      DATABREEZE_OPENAI_AGENT_TIMEOUT_MS: undefined,
      DATABREEZE_OPENAI_AGENT_MAX_OUTPUT_TOKENS: undefined,
    },
    () => {
      const module = DdaModule.register({
        runtimeMode: 'production',
        ddaDatabase: {} as DdaDatabaseClientV1,
      });
      const provider = providerValue(module, AGENT_PROVIDER_TOKEN);
      assert.equal(provider instanceof DisabledAgentProviderAdapter, false);
      assert.equal(JSON.stringify(provider).includes(secret), false);
    },
  );
});

void test('[BUA-005][BUA-008][DDA-060] root shares the canonical BUA admission service with agent usage', () => {
  const admissionRepository = new InMemoryEntitlementRepositoryAdapter();
  const resolver = {
    async resolve() {
      return undefined;
    },
  } satisfies { resolve(input: AgentUsageAdmissionInputV1): Promise<undefined> };
  const root = AppModule.register({
    runtimeMode: 'test',
    allowInMemoryAdapters: true,
    entitlementRepository: admissionRepository,
    agentUsageAdmissionResolver: resolver,
  });
  const dda = imported(root, DdaModule);
  const bua = imported(root, BuaModule);
  const usage = providerValue(dda, AGENT_USAGE_PORT);
  assert.ok(usage instanceof BuaAgentUsageAdapter);
  assert.equal(
    (usage as unknown as { readonly admission: unknown }).admission,
    providerValue(bua, ENTITLEMENT_ADMISSION_SERVICE),
  );
});

void test('[DDA-060] durable production command boundary is bound when DDA has a database', () => {
  const module = DdaModule.register({
    runtimeMode: 'production',
    ddaDatabase: {} as DdaDatabaseClientV1,
  });
  assert.ok(
    providerValue(module, AGENT_CONSEQUENTIAL_COMMAND_PORT) instanceof
      PrismaAgentConsequentialCommandAdapter,
  );
});

void test('[DSM-014][DSM-018][DDA-056] conversation context is authorized against exact DSM version and current restriction', async () => {
  const versions = new InMemoryDatasetVersionRepositoryAdapter();
  await versions.save(context(), datasetVersion());
  let restricted = false;
  const governed: GovernedDatasetAuthorizationPortV1 = {
    async authorize() {
      return restricted
        ? { accepted: false as const, code: 'DATASET_RESTRICTED' as const }
        : { accepted: true as const, value: true as const };
    },
  };
  const dashboard = {
    authorizeDashboardAction: async () => ({
      allowed: true,
      grantsDatasetAccess: true,
    }),
    projectVisibleFields: async () => [],
  };
  const root = AppModule.register({
    runtimeMode: 'test',
    allowInMemoryAdapters: true,
    governedDatasetAuthorization: governed,
    datasetVersionRepository: versions,
    dashboardAuthorization: dashboard,
  });
  const dda = imported(root, DdaModule);
  const authority = providerValue(
    dda,
    CONVERSATION_CONTEXT_VERSION_AUTHORITY_PORT,
  ) as ConversationContextVersionAuthorityPortV1;
  assert.ok(authority instanceof DsmConversationContextVersionAuthorityAdapter);
  assert.deepEqual(
    await authority.authorizeDatasetVersion({
      context: context(),
      datasetId: ids.dataset,
      datasetVersionId: ids.version,
    }),
    { allowed: true },
  );
  assert.deepEqual(
    await authority.authorizeDatasetVersion({
      context: context(),
      datasetId: ids.dataset,
      datasetVersionId: ids.actor,
    }),
    { allowed: false, code: 'NOT_FOUND' },
  );
  restricted = true;
  assert.deepEqual(
    await authority.authorizeDatasetVersion({
      context: context(),
      datasetId: ids.dataset,
      datasetVersionId: ids.version,
    }),
    { allowed: false, code: 'DATASET_RESTRICTED' },
  );
  assert.equal(providerValue(dda, DASHBOARD_AUTHORIZATION_PORT), dashboard);
});

void test('[IAM-024][IAM-025][DDA-060] root tool composition rechecks current grant, restriction, and action membership', async () => {
  const iamRepository = new InMemoryIamRepositoryAdapter();
  const agentGrantRepository = new InMemoryAgentGrantRepositoryAdapter();
  const scope = workspaceScope();
  const membership: IamMembershipRecordV1 = {
    id: stable(ids.membership),
    principalId: stable(ids.actor),
    scope,
    roleId: 'analyst',
    status: 'ACTIVE',
    revision: 1,
  };
  iamRepository.seed([membership]);
  const grant: WorkspaceAgentGrantRecordV1 = {
    id: stable(ids.grant),
    tenantScope: scope,
    memberId: membership.id,
    level: 'ANALYZE',
    revision: 1,
    updatedAt: timestamp(),
  };
  await agentGrantRepository.saveGrant(context(), grant, undefined);

  const dataset: AgentDatasetReaderPortV1 = {
    async describe(input) {
      return {
        accepted: true as const,
        value: {
          datasetId: input.datasetId,
          schema: [{ field: 'amount', type: 'number' }],
          evidenceRefs: [],
        },
      };
    },
    async sample() {
      return { accepted: false as const, code: 'UNAVAILABLE' as const };
    },
  };
  const audit: DdaAudComposePortV1 = {
    async emitContentSafeSummary() {},
  };
  const root = AppModule.register({
    runtimeMode: 'test',
    allowInMemoryAdapters: true,
    iamRepository,
    agentGrantRepository,
    accessPresetService: new AccessPresetService(),
    agentToolDependencies: { dataset, audit },
  });
  const dda = imported(root, DdaModule);
  const authority = providerValue(dda, AGENT_AUTHORITY_PORT) as AgentAuthorityPortV1;
  const executor = providerValue(dda, AGENT_TOOL_EXECUTOR_PORT) as AgentToolExecutorPortV1;
  const resolved = new AgentToolRegistryV1().resolve('dataset.describe');
  assert.equal(resolved.accepted, true);
  if (!resolved.accepted) throw new Error('dataset.describe descriptor missing');
  const toolInput = { datasetId: ids.dataset };
  const callerAuthority = await authority.authorize({
    context: context(),
    descriptor: resolved.value,
    datasetIds: [ids.dataset],
    input: toolInput,
  });
  assert.equal(callerAuthority.allowed, true);
  if (!callerAuthority.allowed) throw new Error('expected current grant to allow dataset.describe');

  assert.deepEqual(
    await executor.execute({
      context: context(),
      descriptor: resolved.value,
      input: toolInput,
      authority: callerAuthority,
      correlationId: ids.correlation,
    }),
    {
      accepted: true,
      value: {
        datasetId: ids.dataset,
        schema: [{ field: 'amount', type: 'number' }],
        evidenceRefs: [],
      },
    },
  );

  const restriction: WorkspaceDatasetRestrictionRecordV1 = {
    memberId: membership.id,
    deniedDatasetIds: [stable(ids.dataset)],
    revision: 1,
    updatedAt: timestamp(),
  };
  await agentGrantRepository.saveDatasetRestrictions(context(), restriction, undefined);
  assert.deepEqual(
    await authority.authorize({
      context: context(),
      descriptor: resolved.value,
      datasetIds: [ids.dataset],
      input: toolInput,
    }),
    { allowed: false, code: 'DATASET_RESTRICTED' },
  );
  assert.deepEqual(
    await executor.execute({
      context: context(),
      descriptor: resolved.value,
      input: toolInput,
      authority: callerAuthority,
      correlationId: ids.correlation,
    }),
    { accepted: false, code: 'DATASET_RESTRICTED' },
  );

  iamRepository.seed([{ ...membership, status: 'SUSPENDED', revision: 2 }]);
  assert.deepEqual(
    await executor.execute({
      context: context(),
      descriptor: resolved.value,
      input: toolInput,
      authority: callerAuthority,
      correlationId: ids.correlation,
    }),
    { accepted: false, code: 'UNAUTHORIZED' },
  );
});

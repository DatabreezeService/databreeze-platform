import assert from 'node:assert/strict';
import test from 'node:test';

import type { DynamicModule } from '@nestjs/common';

import { AppModule } from '../../src/app.module.js';
import { DdaModule } from '../../src/features/dda/dda.module.js';
import { DsmModule } from '../../src/features/dsm/dsm.module.js';
import { IamModule } from '../../src/features/iam/iam.module.js';
import { InMemoryIamRepositoryAdapter } from '../../src/features/iam/adapter/in-memory-iam-repository.adapter.js';
import { InMemoryAgentGrantRepositoryAdapter } from '../../src/features/iam/adapter/in-memory-agent-grant-repository.adapter.js';
import { AccessPresetService } from '../../src/features/iam/application/access-preset.service.js';
import { IAM_REPOSITORY_PORT } from '../../src/features/iam/application/iam-repository.port.js';
import { IAM_AGENT_GRANT_SERVICE } from '../../src/features/iam/application/agent-grant.service.js';
import {
  AGENT_AUTHORITY_PORT,
  AGENT_TOOL_EXECUTOR_PORT,
} from '../../src/features/dda/agent/application/agent-runtime.port.js';
import { IamAgentAuthorityAdapter } from '../../src/features/dda/agent/adapter/iam-agent-authority.adapter.js';
import { TypedAgentToolExecutorAdapter } from '../../src/features/dda/agent/adapter/typed-agent-tool-executor.adapter.js';
import { GOVERNED_DATASET_AUTHORIZATION_PORT } from '../../src/features/dsm/application/governed-dataset-authorization.port.js';
import { IamGovernedDatasetAuthorizationAdapter } from '../../src/features/dsm/adapter/iam-governed-dataset-authorization.adapter.js';

function imported(root: DynamicModule, moduleType: unknown): DynamicModule {
  const imports = (root.imports ?? []) as readonly unknown[];
  const match = imports.find(
    (candidate): candidate is DynamicModule =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'module' in candidate &&
      candidate.module === moduleType,
  );
  if (match === undefined) throw new Error('expected composed module');
  return match;
}

function provider(module: DynamicModule, token: unknown): unknown {
  const providers = (module.providers ?? []) as readonly unknown[];
  return providers
    .filter(
      (candidate): candidate is { readonly provide: unknown; readonly useValue: unknown } =>
        typeof candidate === 'object' &&
        candidate !== null &&
        'provide' in candidate &&
        'useValue' in candidate,
    )
    .find((candidate) => candidate.provide === token)?.useValue;
}

void test('[IAM-002][IAM-024][DSM-018][DDA-060] root composition shares canonical IAM authority without feature-module cycles', () => {
  const iamRepository = new InMemoryIamRepositoryAdapter();
  const agentGrantRepository = new InMemoryAgentGrantRepositoryAdapter();
  const accessPresetService = new AccessPresetService();

  const root = AppModule.register({
    runtimeMode: 'test',
    allowInMemoryAdapters: true,
    iamRepository,
    agentGrantRepository,
    accessPresetService,
  });
  const iam = imported(root, IamModule);
  const dsm = imported(root, DsmModule);
  const dda = imported(root, DdaModule);

  assert.equal(provider(iam, IAM_REPOSITORY_PORT), iamRepository);
  assert.ok(provider(iam, IAM_AGENT_GRANT_SERVICE));
  assert.ok(
    provider(dsm, GOVERNED_DATASET_AUTHORIZATION_PORT) instanceof
      IamGovernedDatasetAuthorizationAdapter,
  );
  assert.ok(provider(dda, AGENT_AUTHORITY_PORT) instanceof IamAgentAuthorityAdapter);
  assert.ok(provider(dda, AGENT_TOOL_EXECUTOR_PORT) instanceof TypedAgentToolExecutorAdapter);
});

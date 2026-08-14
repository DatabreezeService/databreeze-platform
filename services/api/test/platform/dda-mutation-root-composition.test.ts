import assert from 'node:assert/strict';
import test from 'node:test';

import type { DynamicModule } from '@nestjs/common';

import { AppModule } from '../../src/app.module.js';
import type { DdaDatabaseClientV1 } from '../../src/features/dda/adapter/dda-database.client.js';
import { IamEtlAcceptanceAuthorizationAdapter } from '../../src/features/dda/etl/adapter/iam-etl-acceptance-authorization.adapter.js';
import { ETL_ACCEPTANCE_AUTHORIZATION_PORT } from '../../src/features/dda/etl/application/etl-acceptance-authorization.port.js';
import { IamEtlProposalAuthorityAdapter } from '../../src/features/dda/etl/adapter/iam-etl-proposal-authority.adapter.js';
import {
  ETL_PROPOSAL_AUTHORITY_PORT,
  type EtlProposalResourceResolverPortV1,
} from '../../src/features/dda/etl/application/etl-proposal-authority.port.js';
import { DdaModule } from '../../src/features/dda/dda.module.js';
import { IamReceiptMutationAuthorizationAdapter } from '../../src/features/dda/receipt/adapter/iam-receipt-mutation-authorization.adapter.js';
import {
  RECEIPT_MUTATION_AUTHORIZATION_PORT,
  type ReceiptMutationAuthorizationPortV1,
} from '../../src/features/dda/receipt/application/receipt-mutation-authorization.port.js';
import { InMemoryIamRepositoryAdapter } from '../../src/features/iam/adapter/in-memory-iam-repository.adapter.js';
import type { IamMembershipRecordV1 } from '../../src/features/iam/application/iam-repository.port.js';
import { createIamTenantContextV1 } from '../../src/features/iam/application/tenant-context.js';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import { UnavailableReceiptMutationAuthorizationAdapter } from '../../src/features/dda/receipt/application/receipt-mutation-authorization.port.js';
import { UnavailableEtlAcceptanceAuthorizationAdapter } from '../../src/features/dda/etl/application/etl-acceptance-authorization.port.js';
import type { DdaIaePortV1 } from '../../src/features/dda/application/foundation-ports.js';

const ids = Object.freeze({
  organization: '00000000-0000-4000-8000-000000000601',
  workspace: '00000000-0000-4000-8000-000000000602',
  actor: '00000000-0000-4000-8000-000000000603',
  membership: '00000000-0000-4000-8000-000000000604',
  artifact: '00000000-0000-4000-8000-000000000605',
  proposal: '00000000-0000-4000-8000-000000000606',
  correlation: '00000000-0000-4000-8000-000000000607',
});

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid composition fixture identifier');
  return parsed.value;
}

const tenantScope = {
  scopeType: 'workspace' as const,
  organizationId: stable(ids.organization),
  workspaceId: stable(ids.workspace),
};

const contextResult = createIamTenantContextV1({
  tenantScope,
  actorId: stable(ids.actor),
  correlationId: stable(ids.correlation),
  idempotencyKey: 'root-dda-mutation',
  authorizationEpoch: 3,
  workspaceAuthorizationEpoch: 8,
  mfaReenrollmentRequired: false,
});
assert.equal(contextResult.accepted, true);
const context = contextResult.accepted ? contextResult.value : (null as never);

function membership(): IamMembershipRecordV1 {
  return {
    id: stable(ids.membership),
    principalId: stable(ids.actor),
    scope: tenantScope,
    roleId: 'analyst',
    status: 'ACTIVE',
    revision: 1,
  };
}

function imported(root: DynamicModule, moduleType: unknown): DynamicModule {
  const match = (root.imports ?? []).find(
    (candidate): candidate is DynamicModule =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'module' in candidate &&
      candidate.module === moduleType,
  );
  if (!match) throw new Error('expected composed module');
  return match;
}

function provider(module: DynamicModule, token: unknown): unknown {
  const match = (module.providers ?? []).find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === token,
  );
  return match && typeof match === 'object' && 'useValue' in match ? match.useValue : undefined;
}

function iae(calls: Array<Record<string, unknown>>): DdaIaePortV1 {
  return {
    requireArtifactVersion: (reference: Record<string, unknown>) => {
      calls.push({ ...reference });
      return Promise.resolve();
    },
  } as unknown as DdaIaePortV1;
}

void test('[IAM-DDA][DDA-041][DDA-004] root composes IAM-backed receipt and ETL mutation adapters with exact resources', async () => {
  const iamRepository = new InMemoryIamRepositoryAdapter();
  iamRepository.seed([membership()]);
  const iaeCalls: Array<Record<string, unknown>> = [];
  const root = AppModule.register({
    runtimeMode: 'test',
    allowInMemoryAdapters: true,
    iamRepository,
    iaePort: iae(iaeCalls),
  });
  const dda = imported(root, DdaModule);
  const receipt = provider(dda, RECEIPT_MUTATION_AUTHORIZATION_PORT);
  const etl = provider(dda, ETL_ACCEPTANCE_AUTHORIZATION_PORT);

  assert.ok(receipt instanceof IamReceiptMutationAuthorizationAdapter);
  assert.ok(etl instanceof IamEtlAcceptanceAuthorizationAdapter);
  assert.deepEqual(
    await (receipt as ReceiptMutationAuthorizationPortV1).authorize({
      context,
      action: 'RECEIPT_EXTRACT',
      artifactVersionId: ids.artifact,
    }),
    { accepted: true },
  );
  assert.deepEqual(
    await etl.authorize({
      context,
      action: 'ETL_ACCEPT',
      proposalId: ids.proposal,
    }),
    { accepted: true },
  );
  assert.deepEqual(iaeCalls, [{ id: ids.artifact, tenantScope }]);
});

void test('[IAM-DDA] missing IAM/IAE composition remains fail closed in test and development roots', async () => {
  const iamRepository = new InMemoryIamRepositoryAdapter();
  iamRepository.seed([membership()]);
  const rootWithoutIae = AppModule.register({
    runtimeMode: 'test',
    allowInMemoryAdapters: true,
    iamRepository,
  });
  const rootWithoutIam = AppModule.register({
    runtimeMode: 'development',
    allowInMemoryAdapters: true,
  });

  const receiptWithoutIae = provider(
    imported(rootWithoutIae, DdaModule),
    RECEIPT_MUTATION_AUTHORIZATION_PORT,
  );
  const etlWithoutIam = provider(
    imported(rootWithoutIam, DdaModule),
    ETL_ACCEPTANCE_AUTHORIZATION_PORT,
  );
  assert.ok(receiptWithoutIae instanceof IamReceiptMutationAuthorizationAdapter);
  assert.deepEqual(
    await (receiptWithoutIae as ReceiptMutationAuthorizationPortV1).authorize({
      context,
      action: 'RECEIPT_EXTRACT',
      artifactVersionId: ids.artifact,
    }),
    { accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' },
  );
  assert.ok(etlWithoutIam instanceof UnavailableEtlAcceptanceAuthorizationAdapter);
  assert.ok(
    provider(imported(rootWithoutIam, DdaModule), RECEIPT_MUTATION_AUTHORIZATION_PORT) instanceof
      UnavailableReceiptMutationAuthorizationAdapter,
  );
});

void test('[IAM-DDA] production root composes durable DDA mutation authorities only with exact foundation resolution', () => {
  const iamRepository = new InMemoryIamRepositoryAdapter();
  iamRepository.seed([membership()]);
  const resolver: EtlProposalResourceResolverPortV1 = {
    resolve: () => Promise.resolve({ accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' }),
    reauthorize: () => Promise.resolve({ accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' }),
  };
  const root = AppModule.register({
    runtimeMode: 'production',
    iamRepository,
    iaePort: iae([]),
    etlProposalResourceResolver: resolver,
    ddaDatabase: {} as DdaDatabaseClientV1,
    approvalDatabase: {} as never,
  });
  const dda = imported(root, DdaModule);

  assert.ok(provider(dda, ETL_PROPOSAL_AUTHORITY_PORT) instanceof IamEtlProposalAuthorityAdapter);
  assert.ok(
    provider(dda, ETL_ACCEPTANCE_AUTHORIZATION_PORT) instanceof
      IamEtlAcceptanceAuthorizationAdapter,
  );
  assert.ok(
    provider(dda, RECEIPT_MUTATION_AUTHORIZATION_PORT) instanceof
      IamReceiptMutationAuthorizationAdapter,
  );
});

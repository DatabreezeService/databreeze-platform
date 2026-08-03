import assert from 'node:assert/strict';
import test from 'node:test';

import { IAM_INVITATION_REPOSITORY_PORT } from '../../../src/features/iam/application/invitation-repository.port.js';
import {
  IAM_INVITATION_SERVICE,
  IamInvitationService,
} from '../../../src/features/iam/application/invitation.service.js';
import { IamModule } from '../../../src/features/iam/iam.module.js';
import { PrismaIamInvitationRepositoryAdapter } from '../../../src/features/iam/adapter/prisma-iam-invitation-repository.adapter.js';

function provider(module: ReturnType<typeof IamModule.register>, token: symbol) {
  return module.providers?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === token,
  );
}

void test('[IAM-010] explicitly supplied invitation service is exported by IAM composition', () => {
  const service = {} as IamInvitationService;
  const registered = IamModule.register({ invitationService: service });
  const configured = provider(registered, IAM_INVITATION_SERVICE);
  assert.ok(configured && 'useValue' in configured);
  if (!configured || !('useValue' in configured)) return;
  assert.equal(configured.useValue, service);
  assert.ok(
    registered.controllers?.some((controller) => controller.name === 'IamInvitationController'),
  );
});

void test('[IAM-010] durable invitation composition requires all secret and delivery ports', () => {
  const registered = IamModule.register({ invitationDatabase: {} as never });
  assert.equal(provider(registered, IAM_INVITATION_SERVICE), undefined);
  const repository = provider(registered, IAM_INVITATION_REPOSITORY_PORT);
  assert.ok(repository && 'useValue' in repository);
  if (!repository || !('useValue' in repository)) return;
  assert.ok(repository.useValue instanceof PrismaIamInvitationRepositoryAdapter);
});

void test('[IAM-010] durable invitation composition selects Prisma persistence when configured', () => {
  const registered = IamModule.register({
    invitationDatabase: {} as never,
    invitationPrincipalEmails: { findEmail: async () => 'invitee@example.com' },
    invitationDelivery: { deliver: async () => undefined },
    invitationDigest: {
      digestToken: () => 'a'.repeat(64),
      digestEmail: () => 'b'.repeat(64),
    },
  });
  const repository = provider(registered, IAM_INVITATION_REPOSITORY_PORT);
  const service = provider(registered, IAM_INVITATION_SERVICE);
  assert.ok(repository && 'useValue' in repository);
  assert.ok(service && 'useValue' in service);
  if (!repository || !('useValue' in repository) || !service || !('useValue' in service)) return;
  assert.ok(repository.useValue instanceof PrismaIamInvitationRepositoryAdapter);
  assert.ok(service.useValue instanceof IamInvitationService);
});

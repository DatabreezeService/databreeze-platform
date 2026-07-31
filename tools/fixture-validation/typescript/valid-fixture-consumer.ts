import type {
  ActorMetadata,
  CommandEnvelope,
  CorrelationMetadata,
  CursorPage,
  EventEnvelope,
  Identifier,
  OrganizationScope,
  ProblemDetails,
  ProjectScope,
  Revision,
  UtcTimestamp,
  WorkspaceScope,
} from '@databreeze/contracts/v1';

import actorPayload from '../../../packages/test-fixtures/contracts/v1/payloads/actor-metadata/valid-user.json' with { type: 'json' };
import commandPayload from '../../../packages/test-fixtures/contracts/v1/payloads/command-envelope/valid-idempotent.json' with { type: 'json' };
import correlationPayload from '../../../packages/test-fixtures/contracts/v1/payloads/correlation-metadata/valid-full-chain.json' with { type: 'json' };
import continuingPayload from '../../../packages/test-fixtures/contracts/v1/payloads/cursor-page/valid-continuing.json' with { type: 'json' };
import terminalPayload from '../../../packages/test-fixtures/contracts/v1/payloads/cursor-page/valid-terminal.json' with { type: 'json' };
import eventPayload from '../../../packages/test-fixtures/contracts/v1/payloads/event-envelope/valid-workspace-revision.json' with { type: 'json' };
import identifierPayload from '../../../packages/test-fixtures/contracts/v1/payloads/identifier/valid-uuid.json' with { type: 'json' };
import messageProblemPayload from '../../../packages/test-fixtures/contracts/v1/payloads/problem-details/valid-message-localization-rate-limit.json' with { type: 'json' };
import titleProblemPayload from '../../../packages/test-fixtures/contracts/v1/payloads/problem-details/valid-title-localization.json' with { type: 'json' };
import revisionPayload from '../../../packages/test-fixtures/contracts/v1/payloads/revision/valid-positive.json' with { type: 'json' };
import organizationPayload from '../../../packages/test-fixtures/contracts/v1/payloads/tenant-scope/valid-organization.json' with { type: 'json' };
import projectPayload from '../../../packages/test-fixtures/contracts/v1/payloads/tenant-scope/valid-project.json' with { type: 'json' };
import workspacePayload from '../../../packages/test-fixtures/contracts/v1/payloads/tenant-scope/valid-workspace.json' with { type: 'json' };
import timestampPayload from '../../../packages/test-fixtures/contracts/v1/payloads/utc-timestamp/valid-zulu.json' with { type: 'json' };

const actor: ActorMetadata = actorPayload;
const command: CommandEnvelope<{ readonly displayName: string }> = {
  ...commandPayload,
  tenantScope: { ...commandPayload.tenantScope, scopeType: 'workspace' },
};
const correlation: CorrelationMetadata = correlationPayload;
const continuing: CursorPage<{ readonly id: string }> = {
  ...continuingPayload,
  hasMore: true,
};
const terminal: CursorPage = { ...terminalPayload, hasMore: false };
const event: EventEnvelope<{ readonly changedFields: readonly string[] }> = {
  ...eventPayload,
  tenantScope: { ...eventPayload.tenantScope, scopeType: 'workspace' },
};
const identifier: Identifier = identifierPayload;
const messageProblem: ProblemDetails = messageProblemPayload;
const titleProblem: ProblemDetails = titleProblemPayload;
const revision: Revision = revisionPayload;
const organization: OrganizationScope = {
  ...organizationPayload,
  scopeType: 'organization',
};
const project: ProjectScope = { ...projectPayload, scopeType: 'project' };
const workspace: WorkspaceScope = { ...workspacePayload, scopeType: 'workspace' };
const timestamp: UtcTimestamp = timestampPayload;

export const validGeneratedTypeConsumers = [
  actor,
  command,
  correlation,
  continuing,
  terminal,
  event,
  identifier,
  messageProblem,
  titleProblem,
  revision,
  organization,
  project,
  workspace,
  timestamp,
] as const;

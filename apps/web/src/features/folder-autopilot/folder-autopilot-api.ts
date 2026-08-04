import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

const UUID_ERROR = 'AUTOPILOT_RESPONSE_INVALID';
const SAFE_TOKEN = /^[A-Z][A-Z0-9_.-]{1,63}$/u;
const SAFE_TEXT_LENGTH = 128;

export type FolderAutopilotAssignmentState = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'RETIRED' | 'INVALID';
export type FolderAutopilotCollisionPolicy = 'REVIEW' | 'SKIP' | 'UNIQUE_NAME';
export type FolderAutopilotDataMode = 'LOCAL' | 'HYBRID' | 'CLOUD';
export type FolderAutopilotPreviewStatus = 'READY' | 'NEEDS_APPROVAL' | 'BLOCKED' | 'EXPIRED';
export type FolderAutopilotDecision = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type FolderAutopilotActionType =
  | 'INSPECT'
  | 'RENAME'
  | 'COPY'
  | 'MOVE'
  | 'CONVERT'
  | 'ROUTE';
export type FolderAutopilotCollision = 'NONE' | 'REVIEW' | 'SKIP' | 'UNIQUE_NAME';
export type FolderAutopilotOutcome =
  | 'QUEUED'
  | 'WAITING_FOR_APPROVAL'
  | 'RUNNING'
  | 'HANDLED'
  | 'EXCEPTION'
  | 'UNDO_AVAILABLE'
  | 'UNDO_EXPIRED';
export type FolderAutopilotUndoState =
  | 'AVAILABLE'
  | 'REQUESTED'
  | 'COMPLETED'
  | 'CONFLICT'
  | 'EXPIRED'
  | 'NOT_ELIGIBLE';

export interface FolderAutopilotProfile {
  readonly profileId: string;
  readonly version: number;
  readonly stabilizationSeconds: number;
  readonly collisionPolicy: FolderAutopilotCollisionPolicy;
  readonly confidenceThreshold: number;
  readonly undoWindowHours: number;
  readonly approvalRequired: boolean;
  readonly recipeHash: string;
  readonly updatedAt: string;
}

export interface FolderAutopilotProfileInput {
  readonly stabilizationSeconds: number;
  readonly collisionPolicy: FolderAutopilotCollisionPolicy;
  readonly undoWindowHours: number;
}

export interface FolderAutopilotAssignment {
  readonly assignmentId: string;
  readonly profileId: string;
  readonly jraRecipeVersionId: string;
  readonly deviceId: string;
  readonly inputBindingId: string;
  readonly outputBindingId: string;
  readonly dataModeConstraint?: FolderAutopilotDataMode;
  readonly state: FolderAutopilotAssignmentState;
  readonly approvalRequired: boolean;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface FolderAutopilotActionPlan {
  readonly stepId: string;
  readonly actionType: FolderAutopilotActionType;
  readonly sourceArtifactVersionId: string;
  readonly destinationBindingId?: string;
  readonly collision: FolderAutopilotCollision;
  readonly requiresApproval: boolean;
}

export interface FolderAutopilotPreview {
  readonly previewId: string;
  readonly assignmentId: string;
  readonly jraRecipeVersionId: string;
  readonly planHash: string;
  readonly status: FolderAutopilotPreviewStatus;
  readonly affectedCount: number;
  readonly blockedCount: number;
  readonly actions: readonly FolderAutopilotActionPlan[];
  readonly reasonCodes: readonly string[];
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface FolderAutopilotApproval {
  readonly approvalId: string;
  readonly previewId: string;
  readonly subjectHash: string;
  readonly planHash: string;
  readonly decision: FolderAutopilotDecision;
  readonly expiresAt: string;
  readonly updatedAt: string;
}

export interface FolderAutopilotExecution {
  readonly executionId: string;
  readonly assignmentId: string;
  readonly jraJobId: string;
  readonly resultManifestId: string;
  readonly planHash: string;
  readonly revision: number;
  readonly outcome: FolderAutopilotOutcome;
  readonly affectedCount: number;
  readonly handledCount: number;
  readonly exceptionCount: number;
  readonly reasonCodes: readonly string[];
  readonly undoState: FolderAutopilotUndoState;
  readonly updatedAt: string;
}

export interface FolderAutopilotException {
  readonly exceptionId: string;
  readonly assignmentId: string;
  readonly executionId?: string;
  readonly severity: 'INFO' | 'WARNING' | 'ERROR';
  readonly reasonCode: string;
  readonly status: 'OPEN' | 'RESOLVED' | 'IGNORED';
  readonly createdAt: string;
}

export interface FolderAutopilotHealth {
  readonly assignmentId: string;
  readonly watcherState: 'HEALTHY' | 'PAUSED' | 'OVERFLOWED' | 'OFFLINE';
  readonly lastHeartbeatAt: string;
  readonly queueAgeSeconds: number;
  readonly queuedCount: number;
  readonly syncLagSeconds: number;
}

export interface FolderAutopilotDashboard {
  readonly schemaVersion: 1;
  readonly profiles: readonly FolderAutopilotProfile[];
  readonly assignments: readonly FolderAutopilotAssignment[];
  readonly previews: readonly FolderAutopilotPreview[];
  readonly approvals: readonly FolderAutopilotApproval[];
  readonly executions: readonly FolderAutopilotExecution[];
  readonly exceptions: readonly FolderAutopilotException[];
  readonly health: readonly FolderAutopilotHealth[];
}

function apiBaseUrl(): string {
  const configured: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
  return typeof configured === 'string' && configured.trim() !== ''
    ? configured.replace(/\/$/u, '')
    : '';
}

function object(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error(UUID_ERROR);
  return input as Record<string, unknown>;
}

function only(input: Record<string, unknown>, keys: readonly string[]): void {
  const allowed = new Set(keys);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new Error(UUID_ERROR);
}

function id(input: unknown): string {
  const parsed = parseStableIdentifierV1(input);
  if (!parsed.accepted) throw new Error(UUID_ERROR);
  return parsed.value;
}

function timestamp(input: unknown): string {
  const parsed = parseStrictUtcTimestampV1(input);
  if (!parsed.accepted) throw new Error(UUID_ERROR);
  return parsed.value;
}

function text(input: unknown): string {
  if (
    typeof input !== 'string' ||
    input.length === 0 ||
    input.length > SAFE_TEXT_LENGTH ||
    input.trim() !== input ||
    Array.from(input).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  )
    throw new Error(UUID_ERROR);
  return input;
}

function token(input: unknown): string {
  if (typeof input !== 'string' || !SAFE_TOKEN.test(input)) throw new Error(UUID_ERROR);
  return input;
}

function hash(input: unknown): string {
  if (typeof input !== 'string' || !/^[0-9a-f]{64}$/u.test(input)) throw new Error(UUID_ERROR);
  return input;
}

function count(input: unknown): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0)
    throw new Error(UUID_ERROR);
  return input;
}

function revision(input: unknown): number {
  const value = count(input);
  if (value < 1) throw new Error(UUID_ERROR);
  return value;
}

function decimal(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input < 0 || input > 1)
    throw new Error(UUID_ERROR);
  return input;
}

function boundedSeconds(input: unknown, maximum: number): number {
  const value = count(input);
  if (value > maximum) throw new Error(UUID_ERROR);
  return value;
}

function versionNumber(input: unknown): number {
  const value = boundedSeconds(input, 10_000);
  if (value < 1) throw new Error(UUID_ERROR);
  return value;
}

function oneOf<TValue extends string>(input: unknown, values: readonly TValue[]): TValue {
  if (typeof input !== 'string' || !values.includes(input as TValue)) throw new Error(UUID_ERROR);
  return input as TValue;
}

function list(input: unknown): readonly unknown[] {
  if (!Array.isArray(input) || input.length > 512) throw new Error(UUID_ERROR);
  return input;
}

function parseProfile(input: unknown): FolderAutopilotProfile {
  const value = object(input);
  only(value, [
    'profileId',
    'version',
    'stabilizationSeconds',
    'collisionPolicy',
    'confidenceThreshold',
    'undoWindowHours',
    'approvalRequired',
    'recipeHash',
    'updatedAt',
  ]);
  if (typeof value['approvalRequired'] !== 'boolean') throw new Error(UUID_ERROR);
  return Object.freeze({
    profileId: id(value['profileId']),
    version: versionNumber(value['version']),
    stabilizationSeconds: boundedSeconds(value['stabilizationSeconds'], 86_400),
    collisionPolicy: oneOf(value['collisionPolicy'], ['REVIEW', 'SKIP', 'UNIQUE_NAME']),
    confidenceThreshold: decimal(value['confidenceThreshold']),
    undoWindowHours: boundedSeconds(value['undoWindowHours'], 168),
    approvalRequired: value['approvalRequired'],
    recipeHash: hash(value['recipeHash']),
    updatedAt: timestamp(value['updatedAt']),
  });
}

function parseAssignment(input: unknown): FolderAutopilotAssignment {
  const value = object(input);
  only(value, [
    'assignmentId',
    'profileId',
    'jraRecipeVersionId',
    'deviceId',
    'inputBindingId',
    'outputBindingId',
    'dataModeConstraint',
    'state',
    'approvalRequired',
    'revision',
    'updatedAt',
  ]);
  if (typeof value['approvalRequired'] !== 'boolean') throw new Error(UUID_ERROR);
  return Object.freeze({
    assignmentId: id(value['assignmentId']),
    profileId: id(value['profileId']),
    jraRecipeVersionId: id(value['jraRecipeVersionId']),
    deviceId: id(value['deviceId']),
    inputBindingId: id(value['inputBindingId']),
    outputBindingId: id(value['outputBindingId']),
    ...(value['dataModeConstraint'] === undefined
      ? {}
      : { dataModeConstraint: oneOf(value['dataModeConstraint'], ['LOCAL', 'HYBRID', 'CLOUD']) }),
    state: oneOf(value['state'], ['DRAFT', 'ACTIVE', 'PAUSED', 'RETIRED', 'INVALID']),
    approvalRequired: value['approvalRequired'],
    revision: revision(value['revision']),
    updatedAt: timestamp(value['updatedAt']),
  });
}

function parseAction(input: unknown): FolderAutopilotActionPlan {
  const value = object(input);
  only(value, [
    'stepId',
    'actionType',
    'sourceArtifactVersionId',
    'destinationBindingId',
    'collision',
    'requiresApproval',
  ]);
  if (typeof value['requiresApproval'] !== 'boolean') throw new Error(UUID_ERROR);
  const destinationBindingId = value['destinationBindingId'];
  return Object.freeze({
    stepId: text(value['stepId']),
    actionType: oneOf(value['actionType'], [
      'INSPECT',
      'RENAME',
      'COPY',
      'MOVE',
      'CONVERT',
      'ROUTE',
    ]),
    sourceArtifactVersionId: id(value['sourceArtifactVersionId']),
    ...(destinationBindingId === undefined
      ? {}
      : { destinationBindingId: id(destinationBindingId) }),
    collision: oneOf(value['collision'], ['NONE', 'REVIEW', 'SKIP', 'UNIQUE_NAME']),
    requiresApproval: value['requiresApproval'],
  });
}

function reasonCodes(input: unknown): readonly string[] {
  return Object.freeze(list(input).map(token));
}

function parsePreview(input: unknown): FolderAutopilotPreview {
  const value = object(input);
  only(value, [
    'previewId',
    'assignmentId',
    'jraRecipeVersionId',
    'planHash',
    'status',
    'affectedCount',
    'blockedCount',
    'actions',
    'reasonCodes',
    'createdAt',
    'expiresAt',
  ]);
  return Object.freeze({
    previewId: id(value['previewId']),
    assignmentId: id(value['assignmentId']),
    jraRecipeVersionId: id(value['jraRecipeVersionId']),
    planHash: hash(value['planHash']),
    status: oneOf(value['status'], ['READY', 'NEEDS_APPROVAL', 'BLOCKED', 'EXPIRED']),
    affectedCount: count(value['affectedCount']),
    blockedCount: count(value['blockedCount']),
    actions: Object.freeze(list(value['actions']).map(parseAction)),
    reasonCodes: reasonCodes(value['reasonCodes']),
    createdAt: timestamp(value['createdAt']),
    expiresAt: timestamp(value['expiresAt']),
  });
}

function parseApproval(input: unknown): FolderAutopilotApproval {
  const value = object(input);
  only(value, [
    'approvalId',
    'previewId',
    'subjectHash',
    'planHash',
    'decision',
    'expiresAt',
    'updatedAt',
  ]);
  return Object.freeze({
    approvalId: id(value['approvalId']),
    previewId: id(value['previewId']),
    subjectHash: hash(value['subjectHash']),
    planHash: hash(value['planHash']),
    decision: oneOf(value['decision'], ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']),
    expiresAt: timestamp(value['expiresAt']),
    updatedAt: timestamp(value['updatedAt']),
  });
}

function parseExecution(input: unknown): FolderAutopilotExecution {
  const value = object(input);
  only(value, [
    'executionId',
    'assignmentId',
    'jraJobId',
    'resultManifestId',
    'planHash',
    'revision',
    'outcome',
    'affectedCount',
    'handledCount',
    'exceptionCount',
    'reasonCodes',
    'undoState',
    'updatedAt',
  ]);
  return Object.freeze({
    executionId: id(value['executionId']),
    assignmentId: id(value['assignmentId']),
    jraJobId: id(value['jraJobId']),
    resultManifestId: id(value['resultManifestId']),
    planHash: hash(value['planHash']),
    revision: revision(value['revision']),
    outcome: oneOf(value['outcome'], [
      'QUEUED',
      'WAITING_FOR_APPROVAL',
      'RUNNING',
      'HANDLED',
      'EXCEPTION',
      'UNDO_AVAILABLE',
      'UNDO_EXPIRED',
    ]),
    affectedCount: count(value['affectedCount']),
    handledCount: count(value['handledCount']),
    exceptionCount: count(value['exceptionCount']),
    reasonCodes: reasonCodes(value['reasonCodes']),
    undoState: oneOf(value['undoState'], [
      'AVAILABLE',
      'REQUESTED',
      'COMPLETED',
      'CONFLICT',
      'EXPIRED',
      'NOT_ELIGIBLE',
    ]),
    updatedAt: timestamp(value['updatedAt']),
  });
}

function parseException(input: unknown): FolderAutopilotException {
  const value = object(input);
  only(value, [
    'exceptionId',
    'assignmentId',
    'executionId',
    'severity',
    'reasonCode',
    'status',
    'createdAt',
  ]);
  const executionId = value['executionId'];
  return Object.freeze({
    exceptionId: id(value['exceptionId']),
    assignmentId: id(value['assignmentId']),
    ...(executionId === undefined ? {} : { executionId: id(executionId) }),
    severity: oneOf(value['severity'], ['INFO', 'WARNING', 'ERROR']),
    reasonCode: token(value['reasonCode']),
    status: oneOf(value['status'], ['OPEN', 'RESOLVED', 'IGNORED']),
    createdAt: timestamp(value['createdAt']),
  });
}

function parseHealth(input: unknown): FolderAutopilotHealth {
  const value = object(input);
  only(value, [
    'assignmentId',
    'watcherState',
    'lastHeartbeatAt',
    'queueAgeSeconds',
    'queuedCount',
    'syncLagSeconds',
  ]);
  return Object.freeze({
    assignmentId: id(value['assignmentId']),
    watcherState: oneOf(value['watcherState'], ['HEALTHY', 'PAUSED', 'OVERFLOWED', 'OFFLINE']),
    lastHeartbeatAt: timestamp(value['lastHeartbeatAt']),
    queueAgeSeconds: boundedSeconds(value['queueAgeSeconds'], 31_536_000),
    queuedCount: count(value['queuedCount']),
    syncLagSeconds: boundedSeconds(value['syncLagSeconds'], 31_536_000),
  });
}

function parseDashboard(input: unknown): FolderAutopilotDashboard {
  const value = object(input);
  only(value, [
    'schemaVersion',
    'profiles',
    'assignments',
    'previews',
    'approvals',
    'executions',
    'exceptions',
    'health',
  ]);
  if (value['schemaVersion'] !== 1) throw new Error(UUID_ERROR);
  return Object.freeze({
    schemaVersion: 1,
    profiles: Object.freeze(list(value['profiles']).map(parseProfile)),
    assignments: Object.freeze(list(value['assignments']).map(parseAssignment)),
    previews: Object.freeze(list(value['previews']).map(parsePreview)),
    approvals: Object.freeze(list(value['approvals']).map(parseApproval)),
    executions: Object.freeze(list(value['executions']).map(parseExecution)),
    exceptions: Object.freeze(list(value['exceptions']).map(parseException)),
    health: Object.freeze(list(value['health']).map(parseHealth)),
  });
}

async function responsePayload(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error('AUTOPILOT_REQUEST_FAILED');
  const payload: unknown = await response.json();
  const value = object(payload);
  if (value['accepted'] === true && value['value'] !== undefined) return value['value'];
  return payload;
}

function idempotencyKey(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random === undefined) throw new Error('AUTOPILOT_CRYPTO_UNAVAILABLE');
  return `${prefix}-${random}`;
}

async function sha256Hex(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) throw new Error('AUTOPILOT_CRYPTO_UNAVAILABLE');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function mutate(
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey('autopilot'),
    },
    credentials: 'include',
    body: JSON.stringify(body),
    ...(signal === undefined ? {} : { signal }),
  });
  return responsePayload(response);
}

export async function getFolderAutopilotDashboard(
  signal?: AbortSignal,
): Promise<FolderAutopilotDashboard> {
  const response = await fetch(`${apiBaseUrl()}/v1/autopilot-dashboard`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
    ...(signal === undefined ? {} : { signal }),
  });
  return parseDashboard(await responsePayload(response));
}

export async function createFolderAutopilotProfile(
  input: FolderAutopilotProfileInput,
  signal?: AbortSignal,
): Promise<unknown> {
  const profileId = globalThis.crypto?.randomUUID?.();
  if (profileId === undefined) throw new Error('AUTOPILOT_CRYPTO_UNAVAILABLE');
  const stabilizationSeconds = boundedSeconds(input.stabilizationSeconds, 86_400);
  const undoWindowHours = boundedSeconds(input.undoWindowHours, 168);
  const payload = {
    profileId,
    version: 1,
    stabilizationDelayMs: stabilizationSeconds * 1_000,
    maxFilesPerScan: 10_000,
    collisionPolicy: oneOf(input.collisionPolicy, ['REVIEW', 'SKIP', 'UNIQUE_NAME']),
    undoWindowSeconds: undoWindowHours * 3_600,
    outputLineageEnabled: true,
    createdAt: new Date().toISOString(),
  } as const;
  const payloadHash = await sha256Hex(JSON.stringify(payload));
  return mutate('/v1/autopilot-profiles', { ...payload, payloadHash }, signal);
}

export async function pauseFolderAutopilotAssignment(
  assignmentId: string,
  expectedRevision: number,
  signal?: AbortSignal,
): Promise<unknown> {
  return mutate(
    `/v1/autopilot-assignments/${encodeURIComponent(assignmentId)}/pause`,
    { expectedRevision },
    signal,
  );
}

export async function decideFolderAutopilotApproval(
  approvalId: string,
  subjectHash: string,
  decision: Exclude<FolderAutopilotDecision, 'PENDING' | 'EXPIRED'>,
  planHash: string,
  signal?: AbortSignal,
): Promise<unknown> {
  return mutate(
    `/v1/autopilot-approvals/${encodeURIComponent(approvalId)}/decision`,
    {
      jraApprovalRequestId: approvalId,
      subjectHash: hash(subjectHash),
      planHash: hash(planHash),
      decision: decision === 'APPROVED' ? 'APPROVE' : 'REJECT',
      decisionReason: `Web ${decision.toLowerCase()} decision`,
    },
    signal,
  );
}

export async function requestFolderAutopilotUndo(
  executionId: string,
  planHash: string,
  expectedRevision: number,
  signal?: AbortSignal,
): Promise<unknown> {
  return mutate(
    `/v1/autopilot-executions/${encodeURIComponent(executionId)}/undo`,
    { expectedRevision, planHash: hash(planHash) },
    signal,
  );
}

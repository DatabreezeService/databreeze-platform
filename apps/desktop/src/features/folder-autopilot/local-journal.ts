export type JournalState =
  | 'PREPARED'
  | 'COMMITTING'
  | 'COMMITTED'
  | 'COMPENSATING'
  | 'COMPENSATED'
  | 'CONFLICT';
export type JournalStepState = 'PENDING' | 'COMMITTED' | 'COMPENSATED';
export type JournalAction = 'RENAME' | 'COPY' | 'MOVE';
export type JournalErrorCode =
  | 'DUPLICATE_STEP'
  | 'INVALID_JOURNAL'
  | 'INVALID_TRANSITION'
  | 'RECOVERY_CONFLICT'
  | 'UNDO_CONFLICT'
  | 'UNDO_EXPIRED'
  | 'UNDO_NOT_AVAILABLE';

export class JournalError extends Error {
  readonly code: JournalErrorCode;

  constructor(code: JournalErrorCode) {
    super(code);
    this.name = 'JournalError';
    this.code = code;
  }
}

export interface JournalStepInput {
  readonly operationId: string;
  readonly action: JournalAction;
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly beforeFingerprint: string;
  readonly undoable: boolean;
}

export interface JournalStep extends JournalStepInput {
  readonly state: JournalStepState;
  readonly afterFingerprint: string | null;
}

export interface LocalJournal {
  readonly executionId: string;
  readonly planHash: string;
  readonly state: JournalState;
  readonly steps: readonly JournalStep[];
  readonly createdAtMs: number;
  readonly undoExpiresAtMs: number;
  readonly revision: number;
}

export interface UndoOperation {
  readonly operationId: string;
  readonly action: 'RENAME';
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly expectedSourceFingerprint: string;
}

export interface UndoPlan {
  readonly executionId: string;
  readonly planHash: string;
  readonly operations: readonly UndoOperation[];
}

const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MAX_STEPS = 100;
const MIN_UNDO_WINDOW_MS = 60_000;
const MAX_UNDO_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function reject(code: JournalErrorCode): never {
  throw new JournalError(code);
}

function cloneJournal(journal: LocalJournal, updates: Partial<LocalJournal>): LocalJournal {
  return Object.freeze({ ...journal, ...updates, revision: journal.revision + 1 });
}

function validateStep(step: JournalStepInput): void {
  if (
    typeof step !== 'object' ||
    step === null ||
    !SAFE_ID.test(step.operationId) ||
    !['RENAME', 'COPY', 'MOVE'].includes(step.action) ||
    typeof step.sourcePath !== 'string' ||
    typeof step.destinationPath !== 'string' ||
    step.sourcePath.length === 0 ||
    step.destinationPath.length === 0 ||
    step.sourcePath.includes('\0') ||
    step.destinationPath.includes('\0') ||
    !SHA256.test(step.beforeFingerprint) ||
    typeof step.undoable !== 'boolean'
  ) {
    return reject('INVALID_JOURNAL');
  }
}

export function createJournal({
  executionId,
  planHash,
  steps,
  nowMs,
  undoWindowMs,
}: {
  readonly executionId: string;
  readonly planHash: string;
  readonly steps: readonly JournalStepInput[];
  readonly nowMs: number;
  readonly undoWindowMs: number;
}): LocalJournal {
  if (
    !SAFE_ID.test(executionId) ||
    !SHA256.test(planHash) ||
    !Number.isSafeInteger(nowMs) ||
    !Number.isSafeInteger(undoWindowMs) ||
    undoWindowMs < MIN_UNDO_WINDOW_MS ||
    undoWindowMs > MAX_UNDO_WINDOW_MS ||
    steps.length === 0 ||
    steps.length > MAX_STEPS ||
    new Set(steps.map((step) => step.operationId)).size !== steps.length
  ) {
    return reject('INVALID_JOURNAL');
  }
  steps.forEach(validateStep);
  return Object.freeze({
    executionId,
    planHash,
    state: 'PREPARED',
    steps: Object.freeze(
      steps.map((step) => Object.freeze({ ...step, state: 'PENDING', afterFingerprint: null })),
    ),
    createdAtMs: nowMs,
    undoExpiresAtMs: nowMs + undoWindowMs,
    revision: 0,
  });
}

export function beginJournal(journal: LocalJournal): LocalJournal {
  if (journal.state !== 'PREPARED') return reject('INVALID_TRANSITION');
  return cloneJournal(journal, { state: 'COMMITTING' });
}

export function recordJournalStep(
  journal: LocalJournal,
  operationId: string,
  afterFingerprint: string,
): LocalJournal {
  if (journal.state !== 'COMMITTING' || !SHA256.test(afterFingerprint)) {
    return reject('INVALID_TRANSITION');
  }
  const index = journal.steps.findIndex((step) => step.operationId === operationId);
  if (index < 0) return reject('DUPLICATE_STEP');
  const step = journal.steps[index];
  if (step === undefined) return reject('DUPLICATE_STEP');
  if (step.state !== 'PENDING') return reject('DUPLICATE_STEP');
  const nextSteps = journal.steps.slice();
  nextSteps[index] = Object.freeze({ ...step, state: 'COMMITTED', afterFingerprint });
  const nextState = nextSteps.every((candidate) => candidate.state === 'COMMITTED')
    ? 'COMMITTED'
    : 'COMMITTING';
  return cloneJournal(journal, { state: nextState, steps: Object.freeze(nextSteps) });
}

export function failJournal(journal: LocalJournal): LocalJournal {
  if (journal.state !== 'COMMITTING' || !journal.steps.some((step) => step.state === 'COMMITTED')) {
    return reject('INVALID_TRANSITION');
  }
  return cloneJournal(journal, { state: 'COMPENSATING' });
}

export function compensateJournal(journal: LocalJournal, operationId: string): LocalJournal {
  if (journal.state !== 'COMPENSATING') return reject('INVALID_TRANSITION');
  const index = journal.steps.findIndex((step) => step.operationId === operationId);
  if (index < 0) return reject('DUPLICATE_STEP');
  const step = journal.steps[index];
  if (step === undefined) return reject('DUPLICATE_STEP');
  if (step.state !== 'COMMITTED') return reject('DUPLICATE_STEP');
  const nextSteps = journal.steps.slice();
  nextSteps[index] = Object.freeze({ ...step, state: 'COMPENSATED' });
  const nextState = nextSteps
    .filter((candidate) => candidate.afterFingerprint !== null)
    .every((candidate) => candidate.state === 'COMPENSATED')
    ? 'COMPENSATED'
    : 'COMPENSATING';
  return cloneJournal(journal, { state: nextState, steps: Object.freeze(nextSteps) });
}

export function recoverJournal(
  journal: LocalJournal,
  checkpoints: ReadonlyMap<string, 'COMMITTED' | 'PENDING' | 'UNKNOWN'>,
): LocalJournal {
  if (journal.state !== 'COMMITTING') return reject('INVALID_TRANSITION');
  if ([...checkpoints.values()].some((state) => state === 'UNKNOWN')) {
    return reject('RECOVERY_CONFLICT');
  }
  const nextSteps = journal.steps.map((step) => {
    if (checkpoints.get(step.operationId) === 'COMMITTED' && step.state === 'PENDING') {
      return Object.freeze({ ...step, state: 'COMMITTED' as const });
    }
    return step;
  });
  return cloneJournal(journal, { steps: Object.freeze(nextSteps) });
}

export function buildUndoPlan(
  journal: LocalJournal,
  {
    nowMs,
    currentFingerprints,
  }: { readonly nowMs: number; readonly currentFingerprints: ReadonlyMap<string, string> },
): UndoPlan {
  if (journal.state !== 'COMMITTED') return reject('UNDO_NOT_AVAILABLE');
  if (nowMs > journal.undoExpiresAtMs) return reject('UNDO_EXPIRED');
  const operations: UndoOperation[] = [];
  for (const step of [...journal.steps].reverse()) {
    if (!step.undoable || step.afterFingerprint === null) return reject('UNDO_NOT_AVAILABLE');
    if (currentFingerprints.get(step.destinationPath) !== step.afterFingerprint) {
      return reject('UNDO_CONFLICT');
    }
    operations.push({
      operationId: `undo-${step.operationId}`,
      action: 'RENAME',
      sourcePath: step.destinationPath,
      destinationPath: step.sourcePath,
      expectedSourceFingerprint: step.afterFingerprint,
    });
  }
  return Object.freeze({
    executionId: journal.executionId,
    planHash: journal.planHash,
    operations: Object.freeze(operations),
  });
}

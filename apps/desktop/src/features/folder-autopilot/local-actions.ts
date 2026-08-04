import path from 'node:path';

export type LocalAction = 'INSPECT' | 'VALIDATE' | 'RENAME' | 'COPY' | 'MOVE';
export type LocalCollisionPolicy = 'REVIEW' | 'SKIP' | 'UNIQUE_NAME';
export type LocalActionCode =
  | 'APPROVAL_REQUIRED'
  | 'DESTINATION_COLLISION'
  | 'DESTINATION_RECURSION'
  | 'EXCLUSIVE_RENAME_REQUIRED'
  | 'INVALID_LOCAL_PATH'
  | 'INVALID_PLAN'
  | 'LOCAL_IO_FAILED'
  | 'PATH_OUTSIDE_AUTHORIZATION'
  | 'PATH_REPARSE_POINT'
  | 'STALE_PLAN';

export class LocalActionError extends Error {
  readonly code: LocalActionCode;

  constructor(code: LocalActionCode) {
    super(code);
    this.name = 'LocalActionError';
    this.code = code;
  }
}

export class LocalActionFailure extends LocalActionError {
  public readonly appliedReceipts: readonly LocalActionReceipt[];

  public constructor(code: LocalActionCode, appliedReceipts: readonly LocalActionReceipt[]) {
    super(code);
    this.name = 'LocalActionFailure';
    this.appliedReceipts = Object.freeze([...appliedReceipts]);
  }
}

export interface LocalPathGuard {
  assertContained(candidate: string): string;
}

export interface LocalFileSystem {
  exists(path: string): Promise<boolean>;
  readFingerprint(path: string): Promise<string>;
  copyExclusive(source: string, destination: string): Promise<void>;
  /** The adapter must reject rather than replace an existing destination. */
  renameExclusive?(source: string, destination: string): Promise<void>;
  /** Legacy non-exclusive operation; the local executor never invokes it. */
  rename(source: string, destination: string): Promise<void>;
}

export interface LocalActionOperation {
  readonly operationId: string;
  readonly action: LocalAction;
  readonly sourcePath: string;
  readonly destinationPath?: string;
  readonly sourceFingerprint: string;
  readonly collisionPolicy?: LocalCollisionPolicy;
  readonly approved?: boolean;
}

export interface LocalActionPlan {
  readonly operations: readonly LocalActionOperation[];
}

export interface LocalActionDependencies {
  readonly sourceGuard: LocalPathGuard;
  readonly destinationGuard: LocalPathGuard;
  readonly fileSystem: LocalFileSystem;
}

export interface LocalActionReceipt {
  readonly operationId: string;
  readonly action: LocalAction;
  readonly status: 'APPLIED' | 'SKIPPED';
  readonly destinationPath?: string;
}

const MAX_OPERATIONS = 100;
const MAX_UNIQUE_NAME_ATTEMPTS = 1_000;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function reject(code: LocalActionCode): never {
  throw new LocalActionError(code);
}

const CONTAINMENT_CODES = [
  'INVALID_LOCAL_PATH',
  'PATH_OUTSIDE_AUTHORIZATION',
  'PATH_REPARSE_POINT',
] as const;

function isContainmentCode(value: unknown): value is (typeof CONTAINMENT_CODES)[number] {
  return (
    typeof value === 'string' &&
    CONTAINMENT_CODES.includes(value as (typeof CONTAINMENT_CODES)[number])
  );
}

function failClosed(error: unknown): never {
  if (error instanceof LocalActionError) return reject(error.code);
  if (typeof error === 'object' && error !== null) {
    const code = (error as { readonly code?: unknown }).code;
    if (isContainmentCode(code)) return reject(code);
  }
  return reject('LOCAL_IO_FAILED');
}

function assertContained(guard: LocalPathGuard, candidate: string): string {
  try {
    const contained = guard.assertContained(candidate);
    if (typeof contained !== 'string' || contained.length === 0) return reject('LOCAL_IO_FAILED');
    return contained;
  } catch (error) {
    return failClosed(error);
  }
}

async function pathExists(fileSystem: LocalFileSystem, candidate: string): Promise<boolean> {
  try {
    const exists = await fileSystem.exists(candidate);
    if (typeof exists !== 'boolean') return reject('LOCAL_IO_FAILED');
    return exists;
  } catch (error) {
    return failClosed(error);
  }
}

async function readFingerprint(fileSystem: LocalFileSystem, candidate: string): Promise<string> {
  try {
    const fingerprint = await fileSystem.readFingerprint(candidate);
    if (typeof fingerprint !== 'string') return reject('LOCAL_IO_FAILED');
    return fingerprint;
  } catch (error) {
    return failClosed(error);
  }
}

function isWriteAction(action: LocalAction): boolean {
  return action === 'RENAME' || action === 'COPY' || action === 'MOVE';
}

function validateOperation(operation: LocalActionOperation): void {
  if (
    typeof operation !== 'object' ||
    operation === null ||
    typeof operation.operationId !== 'string' ||
    !SAFE_ID.test(operation.operationId) ||
    !['INSPECT', 'VALIDATE', 'RENAME', 'COPY', 'MOVE'].includes(operation.action) ||
    typeof operation.sourcePath !== 'string' ||
    operation.sourcePath.length === 0 ||
    operation.sourcePath.includes('\0') ||
    typeof operation.sourceFingerprint !== 'string' ||
    !SHA256.test(operation.sourceFingerprint)
  ) {
    return reject('INVALID_PLAN');
  }
  if (isWriteAction(operation.action)) {
    if (
      typeof operation.destinationPath !== 'string' ||
      operation.destinationPath.length === 0 ||
      operation.destinationPath.includes('\0')
    ) {
      return reject('INVALID_PLAN');
    }
    if (
      operation.collisionPolicy !== undefined &&
      !['REVIEW', 'SKIP', 'UNIQUE_NAME'].includes(operation.collisionPolicy)
    ) {
      return reject('INVALID_PLAN');
    }
    if (operation.action === 'MOVE' && operation.approved !== true) {
      return reject('APPROVAL_REQUIRED');
    }
  } else if (operation.destinationPath !== undefined || operation.collisionPolicy !== undefined) {
    return reject('INVALID_PLAN');
  }
}

function uniqueDestinationName(destinationPath: string, index: number): string {
  const parsed = path.win32.parse(destinationPath);
  return path.win32.join(parsed.dir, `${parsed.name} (${index})${parsed.ext}`);
}

async function chooseDestination(
  containedDestination: string,
  collisionPolicy: LocalCollisionPolicy | undefined,
  destinationGuard: LocalPathGuard,
  fileSystem: LocalFileSystem,
): Promise<{ readonly path: string; readonly generated: boolean; readonly skipped: boolean }> {
  const destination = containedDestination;
  if (!(await pathExists(fileSystem, destination))) {
    return { path: destination, generated: false, skipped: false };
  }
  if (collisionPolicy === 'SKIP') return { path: destination, generated: false, skipped: true };
  if (collisionPolicy !== 'UNIQUE_NAME') return reject('DESTINATION_COLLISION');

  for (let index = 1; index <= MAX_UNIQUE_NAME_ATTEMPTS; index += 1) {
    const candidate = assertContained(destinationGuard, uniqueDestinationName(destination, index));
    if (!(await pathExists(fileSystem, candidate))) {
      return { path: candidate, generated: true, skipped: false };
    }
  }
  return reject('DESTINATION_COLLISION');
}

export async function executeLocalPlan(
  plan: LocalActionPlan,
  { sourceGuard, destinationGuard, fileSystem }: LocalActionDependencies,
): Promise<readonly LocalActionReceipt[]> {
  const candidate: unknown = plan;
  if (typeof candidate !== 'object' || candidate === null) return reject('INVALID_PLAN');
  const operationsValue: unknown = (candidate as { readonly operations?: unknown }).operations;
  if (!Array.isArray(operationsValue) || operationsValue.length > MAX_OPERATIONS) {
    return reject('INVALID_PLAN');
  }
  const operations = operationsValue as readonly LocalActionOperation[];

  const receipts: LocalActionReceipt[] = [];
  for (const operation of operations) {
    try {
      validateOperation(operation);
      if (
        (operation.action === 'RENAME' || operation.action === 'MOVE') &&
        typeof fileSystem.renameExclusive !== 'function'
      ) {
        return reject('EXCLUSIVE_RENAME_REQUIRED');
      }
      const source = assertContained(sourceGuard, operation.sourcePath);
      const expectedFingerprint = await readFingerprint(fileSystem, source);
      if (expectedFingerprint !== operation.sourceFingerprint) return reject('STALE_PLAN');

      if (!isWriteAction(operation.action)) {
        receipts.push({
          operationId: operation.operationId,
          action: operation.action,
          status: 'APPLIED',
        });
        continue;
      }

      const requestedDestination = assertContained(
        destinationGuard,
        operation.destinationPath as string,
      );
      if (source.toLowerCase() === requestedDestination.toLowerCase()) {
        return reject('DESTINATION_RECURSION');
      }
      const destinationSelection = await chooseDestination(
        requestedDestination,
        operation.collisionPolicy,
        destinationGuard,
        fileSystem,
      );
      const destination = destinationSelection.path;
      if (destinationSelection.skipped) {
        receipts.push({
          operationId: operation.operationId,
          action: operation.action,
          status: 'SKIPPED',
        });
        continue;
      }
      if (await pathExists(fileSystem, destination)) {
        if (operation.collisionPolicy === 'SKIP') {
          receipts.push({
            operationId: operation.operationId,
            action: operation.action,
            status: 'SKIPPED',
          });
          continue;
        }
        return reject('DESTINATION_COLLISION');
      }
      try {
        if (operation.action === 'COPY') await fileSystem.copyExclusive(source, destination);
        else await fileSystem.renameExclusive!(source, destination);
      } catch {
        throw new LocalActionFailure('LOCAL_IO_FAILED', receipts);
      }
      receipts.push({
        operationId: operation.operationId,
        action: operation.action,
        status: 'APPLIED',
        ...(destinationSelection.generated ? { destinationPath: destination } : {}),
      });
    } catch (error) {
      if (receipts.length > 0) {
        if (error instanceof LocalActionFailure) throw error;
        if (error instanceof LocalActionError) {
          throw new LocalActionFailure(error.code, receipts);
        }
        throw new LocalActionFailure('LOCAL_IO_FAILED', receipts);
      }
      throw error;
    }
  }
  return receipts;
}

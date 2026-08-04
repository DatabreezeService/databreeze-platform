import path from 'node:path';

export type LocalAction = 'INSPECT' | 'VALIDATE' | 'RENAME' | 'COPY' | 'MOVE';
export type LocalCollisionPolicy = 'REVIEW' | 'SKIP' | 'UNIQUE_NAME';
export type LocalActionCode =
  | 'APPROVAL_REQUIRED'
  | 'DESTINATION_COLLISION'
  | 'DESTINATION_RECURSION'
  | 'INVALID_PLAN'
  | 'LOCAL_IO_FAILED'
  | 'STALE_PLAN';

export class LocalActionError extends Error {
  readonly code: LocalActionCode;

  constructor(code: LocalActionCode) {
    super(code);
    this.name = 'LocalActionError';
    this.code = code;
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

function isWriteAction(action: LocalAction): boolean {
  return action === 'RENAME' || action === 'COPY' || action === 'MOVE';
}

function validateOperation(operation: LocalActionOperation): void {
  if (
    typeof operation !== 'object' ||
    operation === null ||
    !SAFE_ID.test(operation.operationId) ||
    !['INSPECT', 'VALIDATE', 'RENAME', 'COPY', 'MOVE'].includes(operation.action) ||
    typeof operation.sourcePath !== 'string' ||
    operation.sourcePath.length === 0 ||
    operation.sourcePath.includes('\0') ||
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
  if (!(await fileSystem.exists(destination))) {
    return { path: destination, generated: false, skipped: false };
  }
  if (collisionPolicy === 'SKIP') return { path: destination, generated: false, skipped: true };
  if (collisionPolicy !== 'UNIQUE_NAME') return reject('DESTINATION_COLLISION');

  for (let index = 1; index <= MAX_UNIQUE_NAME_ATTEMPTS; index += 1) {
    const candidate = destinationGuard.assertContained(uniqueDestinationName(destination, index));
    if (!(await fileSystem.exists(candidate))) {
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
    validateOperation(operation);
    const source = sourceGuard.assertContained(operation.sourcePath);
    const expectedFingerprint = await fileSystem.readFingerprint(source);
    if (expectedFingerprint !== operation.sourceFingerprint) return reject('STALE_PLAN');

    if (!isWriteAction(operation.action)) {
      receipts.push({ operationId: operation.operationId, action: operation.action, status: 'APPLIED' });
      continue;
    }

    const requestedDestination = destinationGuard.assertContained(operation.destinationPath as string);
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
      receipts.push({ operationId: operation.operationId, action: operation.action, status: 'SKIPPED' });
      continue;
    }
    if (await fileSystem.exists(destination)) {
      if (operation.collisionPolicy === 'SKIP') {
        receipts.push({ operationId: operation.operationId, action: operation.action, status: 'SKIPPED' });
        continue;
      }
      return reject('DESTINATION_COLLISION');
    }
    try {
      if (operation.action === 'COPY') await fileSystem.copyExclusive(source, destination);
      else if (fileSystem.renameExclusive !== undefined) {
        await fileSystem.renameExclusive(source, destination);
      } else {
        await fileSystem.rename(source, destination);
      }
    } catch {
      return reject('LOCAL_IO_FAILED');
    }
    receipts.push({
      operationId: operation.operationId,
      action: operation.action,
      status: 'APPLIED',
      ...(destinationSelection.generated
        ? { destinationPath: destination }
        : {}),
    });
  }
  return receipts;
}

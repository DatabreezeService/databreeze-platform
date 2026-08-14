import { createHash, randomUUID } from 'node:crypto';

export type ReversibleFileMoveProblemCodeV1 =
  | 'PATH_ESCAPE'
  | 'ABSOLUTE_PATH'
  | 'DESTINATION_OUTSIDE_GRANT'
  | 'SOURCE_MISSING'
  | 'SOURCE_CHANGED'
  | 'DESTINATION_COLLISION'
  | 'VERIFY_FAILED'
  | 'UNKNOWN_PLAN'
  | 'UNKNOWN_RECEIPT';

export interface ReversibleFileMoveFsV1 {
  readBytes(relativePath: string): Promise<Uint8Array>;
  writeBytes(relativePath: string, bytes: Uint8Array): Promise<void>;
  exists(relativePath: string): Promise<boolean>;
  remove(relativePath: string): Promise<void>;
  rename(fromRelative: string, toRelative: string): Promise<void>;
}

export interface MovePlanV1 {
  readonly planId: string;
  readonly bindingId: string;
  readonly relativeSource: string;
  readonly relativeDestinationDirectory: string;
  readonly relativeDestination: string;
  readonly sourceFingerprint: string;
  readonly collisionStrategy: 'UNIQUE_SUFFIX';
}

export interface MoveReceiptV1 {
  readonly receiptId: string;
  readonly planId: string;
  readonly bindingId: string;
  readonly relativeSource: string;
  readonly relativeDestination: string;
  readonly sourceFingerprint: string;
}

export type MoveResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: ReversibleFileMoveProblemCodeV1 };

function rejected(code: ReversibleFileMoveProblemCodeV1): MoveResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function normalizeRelative(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

function isAbsolute(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('/') || path.startsWith('\\');
}

function escapes(path: string): boolean {
  const normalized = normalizeRelative(path);
  return (
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized.endsWith('/..')
  );
}

function withinGrant(path: string, prefixes: readonly string[]): boolean {
  const normalized = normalizeRelative(path);
  return prefixes.some((prefix) => {
    const clean = normalizeRelative(prefix).replace(/\/?$/, '/');
    return normalized === clean.slice(0, -1) || normalized.startsWith(clean);
  });
}

function fingerprint(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function uniqueDestination(
  directory: string,
  fileName: string,
  existsSync: (relativePath: string) => Promise<boolean>,
): Promise<string> {
  const normalizedDir = normalizeRelative(directory).replace(/\/$/, '');
  const base = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;
  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '';
  let candidate = `${normalizedDir}/${fileName}`;
  let index = 1;
  return (async () => {
    while (await existsSync(candidate)) {
      candidate = `${normalizedDir}/${base}-${index}${ext}`;
      index += 1;
    }
    return candidate;
  })();
}

/** DSO-009: preview a collision-safe move inside an approved binding grant. */
export async function planMove(input: {
  readonly bindingId: string;
  readonly relativeSource: string;
  readonly relativeDestinationDirectory: string;
  readonly approvedRootRelativePrefixes: readonly string[];
  readonly fs?: ReversibleFileMoveFsV1;
}): Promise<MoveResultV1<MovePlanV1>> {
  if (isAbsolute(input.relativeSource) || isAbsolute(input.relativeDestinationDirectory)) {
    return rejected('ABSOLUTE_PATH');
  }
  if (escapes(input.relativeSource) || escapes(input.relativeDestinationDirectory)) {
    return rejected('PATH_ESCAPE');
  }
  const relativeSource = normalizeRelative(input.relativeSource);
  const relativeDestinationDirectory = normalizeRelative(input.relativeDestinationDirectory);
  if (
    !withinGrant(relativeSource, input.approvedRootRelativePrefixes) ||
    !withinGrant(relativeDestinationDirectory, input.approvedRootRelativePrefixes)
  ) {
    return rejected('DESTINATION_OUTSIDE_GRANT');
  }
  if (!input.fs) {
    return rejected('SOURCE_MISSING');
  }
  if (!(await input.fs.exists(relativeSource))) return rejected('SOURCE_MISSING');
  const bytes = await input.fs.readBytes(relativeSource);
  const sourceFingerprint = fingerprint(bytes);
  const fileName = relativeSource.includes('/')
    ? relativeSource.slice(relativeSource.lastIndexOf('/') + 1)
    : relativeSource;
  const relativeDestination = await uniqueDestination(
    relativeDestinationDirectory,
    fileName,
    (path) => input.fs!.exists(path),
  );
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      planId: randomUUID(),
      bindingId: input.bindingId,
      relativeSource,
      relativeDestinationDirectory,
      relativeDestination,
      sourceFingerprint,
      collisionStrategy: 'UNIQUE_SUFFIX' as const,
    }),
  });
}

/** DSO-009: copy/verify then remove source; never overwrite. */
export async function commitMove(input: {
  readonly planId: string;
  readonly expectedFingerprint: string;
  readonly plan: MovePlanV1;
  readonly fs: ReversibleFileMoveFsV1;
}): Promise<MoveResultV1<MoveReceiptV1>> {
  if (input.planId !== input.plan.planId) return rejected('UNKNOWN_PLAN');
  if (!(await input.fs.exists(input.plan.relativeSource))) return rejected('SOURCE_MISSING');
  const bytes = await input.fs.readBytes(input.plan.relativeSource);
  const current = fingerprint(bytes);
  if (current !== input.expectedFingerprint || current !== input.plan.sourceFingerprint) {
    return rejected('SOURCE_CHANGED');
  }
  if (await input.fs.exists(input.plan.relativeDestination)) {
    return rejected('DESTINATION_COLLISION');
  }

  const tempRelative = `${input.plan.relativeDestination}.tmp-${randomUUID()}`;
  await input.fs.writeBytes(tempRelative, bytes);
  const written = await input.fs.readBytes(tempRelative);
  if (fingerprint(written) !== current) {
    await input.fs.remove(tempRelative);
    return rejected('VERIFY_FAILED');
  }
  await input.fs.rename(tempRelative, input.plan.relativeDestination);
  const published = await input.fs.readBytes(input.plan.relativeDestination);
  if (fingerprint(published) !== current) {
    await input.fs.remove(input.plan.relativeDestination);
    return rejected('VERIFY_FAILED');
  }
  await input.fs.remove(input.plan.relativeSource);

  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      receiptId: randomUUID(),
      planId: input.plan.planId,
      bindingId: input.plan.bindingId,
      relativeSource: input.plan.relativeSource,
      relativeDestination: input.plan.relativeDestination,
      sourceFingerprint: current,
    }),
  });
}

/** DSO-009: restore source from receipt without overwriting collisions. */
export async function undoMove(input: {
  readonly receiptId: string;
  readonly receipt: MoveReceiptV1;
  readonly fs: ReversibleFileMoveFsV1;
}): Promise<MoveResultV1<MoveReceiptV1>> {
  if (input.receiptId !== input.receipt.receiptId) return rejected('UNKNOWN_RECEIPT');
  if (!(await input.fs.exists(input.receipt.relativeDestination))) {
    return rejected('SOURCE_MISSING');
  }
  if (await input.fs.exists(input.receipt.relativeSource)) {
    return rejected('DESTINATION_COLLISION');
  }
  const bytes = await input.fs.readBytes(input.receipt.relativeDestination);
  if (fingerprint(bytes) !== input.receipt.sourceFingerprint) {
    return rejected('VERIFY_FAILED');
  }
  await input.fs.rename(input.receipt.relativeDestination, input.receipt.relativeSource);
  return Object.freeze({ accepted: true, value: input.receipt });
}

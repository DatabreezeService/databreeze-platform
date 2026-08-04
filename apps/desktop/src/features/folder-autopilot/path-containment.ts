import path from 'node:path';

export type ReparsePointPolicy = 'REJECT' | 'ALLOW_WITHIN_ROOT';

export type PathContainmentCode =
  | 'INVALID_LOCAL_PATH'
  | 'PATH_OUTSIDE_AUTHORIZATION'
  | 'PATH_REPARSE_POINT';

export class PathContainmentError extends Error {
  readonly code: PathContainmentCode;

  constructor(code: PathContainmentCode) {
    super(code);
    this.name = 'PathContainmentError';
    this.code = code;
  }
}

export interface PathContainmentOptions {
  readonly canonicalRoot: string;
  readonly realpath: (value: string) => string;
  readonly isReparsePoint?: (value: string) => boolean;
  readonly reparsePointPolicy?: ReparsePointPolicy;
}

export interface PathContainmentGuard {
  readonly canonicalRoot: string;
  assertContained(candidate: string): string;
  relativeName(candidate: string): string;
}

function reject(code: PathContainmentCode): never {
  throw new PathContainmentError(code);
}

export function canonicalizeWindowsPath(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    return reject('INVALID_LOCAL_PATH');
  }
  const normalized = path.win32.normalize(value.replaceAll('/', '\\'));
  if (!path.win32.isAbsolute(normalized)) return reject('INVALID_LOCAL_PATH');
  const parsed = path.win32.parse(normalized);
  if (normalized !== parsed.root) return normalized.replace(/[\\]+$/, '');
  return parsed.root;
}

function caseFold(value: string): string {
  return value.toLowerCase();
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.win32.relative(caseFold(root), caseFold(candidate));
  return (
    relative.length === 0 ||
    (!relative.startsWith('..\\') && relative !== '..' && !path.win32.isAbsolute(relative))
  );
}

export function createPathContainmentGuard({
  canonicalRoot,
  realpath,
  isReparsePoint = () => false,
  reparsePointPolicy = 'REJECT',
}: PathContainmentOptions): PathContainmentGuard {
  const root = canonicalizeWindowsPath(canonicalRoot);
  let resolvedRoot: string;
  try {
    resolvedRoot = canonicalizeWindowsPath(realpath(root));
  } catch {
    return reject('INVALID_LOCAL_PATH');
  }

  const assertContained = (candidate: string): string => {
    const canonicalCandidate = canonicalizeWindowsPath(candidate);
    if (reparsePointPolicy === 'REJECT' && isReparsePoint(canonicalCandidate)) {
      return reject('PATH_REPARSE_POINT');
    }
    let resolvedCandidate: string;
    try {
      resolvedCandidate = canonicalizeWindowsPath(realpath(canonicalCandidate));
    } catch {
      return reject('INVALID_LOCAL_PATH');
    }
    if (!isContained(resolvedRoot, resolvedCandidate)) {
      return reject('PATH_OUTSIDE_AUTHORIZATION');
    }
    return resolvedCandidate;
  };

  return Object.freeze({
    canonicalRoot: resolvedRoot,
    assertContained,
    relativeName: (candidate: string): string => {
      const resolvedCandidate = assertContained(candidate);
      return path.win32.relative(resolvedRoot, resolvedCandidate);
    },
  });
}

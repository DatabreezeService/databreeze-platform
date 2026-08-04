import { describe, expect, it, vi } from 'vitest';
import {
  LocalActionError,
  executeLocalPlan,
  type LocalActionPlan,
  type LocalFileSystem,
} from '../src/features/folder-autopilot/local-actions.ts';

const sourcePath = 'C:\\Approved\\invoice.csv';
const destinationPath = 'C:\\Output\\invoice-reviewed.csv';

function dependencies(overrides: Partial<LocalFileSystem> = {}) {
  const fileSystem: LocalFileSystem = {
    exists: vi.fn(() => Promise.resolve(false)),
    readFingerprint: vi.fn(() => Promise.resolve('a'.repeat(64))),
    copyExclusive: vi.fn(() => Promise.resolve()),
    rename: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
  return {
    fileSystem,
    sourceGuard: { assertContained: vi.fn((value: string) => value) },
    destinationGuard: { assertContained: vi.fn((value: string) => value) },
  };
}

function plan(...operations: LocalActionPlan['operations']): LocalActionPlan {
  return { operations };
}

describe('Folder Autopilot local typed actions', () => {
  it('evaluates inspect and validate without a filesystem mutation', async () => {
    const deps = dependencies();
    const copyExclusive = vi.spyOn(deps.fileSystem, 'copyExclusive');
    const rename = vi.spyOn(deps.fileSystem, 'rename');
    const result = await executeLocalPlan(
      plan(
        { operationId: 'inspect-1', action: 'INSPECT', sourcePath, sourceFingerprint: 'a'.repeat(64) },
        { operationId: 'validate-1', action: 'VALIDATE', sourcePath, sourceFingerprint: 'a'.repeat(64) },
      ),
      deps,
    );

    expect(result.map((item) => item.status)).toEqual(['APPLIED', 'APPLIED']);
    expect(copyExclusive).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
  });

  it('revalidates containment and source fingerprint before a rename', async () => {
    const deps = dependencies();
    const rename = vi.spyOn(deps.fileSystem, 'rename');
    const result = await executeLocalPlan(
      plan({
        operationId: 'rename-1',
        action: 'RENAME',
        sourcePath,
        destinationPath,
        sourceFingerprint: 'a'.repeat(64),
      }),
      deps,
    );

    expect(result[0].status).toBe('APPLIED');
    expect(deps.sourceGuard.assertContained).toHaveBeenCalledWith(sourcePath);
    expect(deps.destinationGuard.assertContained).toHaveBeenCalledWith(destinationPath);
    expect(rename).toHaveBeenCalledWith(sourcePath, destinationPath);
  });

  it('never overwrites a destination and handles SKIP explicitly', async () => {
    const deps = dependencies({ exists: vi.fn(() => Promise.resolve(true)) });
    const copyExclusive = vi.spyOn(deps.fileSystem, 'copyExclusive');
    const result = await executeLocalPlan(
      plan({
        operationId: 'copy-1',
        action: 'COPY',
        sourcePath,
        destinationPath,
        sourceFingerprint: 'a'.repeat(64),
        collisionPolicy: 'SKIP',
      }),
      deps,
    );

    expect(result).toEqual([{ operationId: 'copy-1', action: 'COPY', status: 'SKIPPED' }]);
    expect(copyExclusive).not.toHaveBeenCalled();
  });

  it('fails closed for collisions, stale plans, and unknown local effects', async () => {
    const collisionDeps = dependencies({ exists: vi.fn(() => Promise.resolve(true)) });
    await expect(
      executeLocalPlan(
        plan({
          operationId: 'copy-1',
          action: 'COPY',
          sourcePath,
          destinationPath,
          sourceFingerprint: 'a'.repeat(64),
        }),
        collisionDeps,
      ),
    ).rejects.toMatchObject<LocalActionError>({ code: 'DESTINATION_COLLISION' });

    const staleDeps = dependencies({ readFingerprint: vi.fn(() => Promise.resolve('b'.repeat(64))) });
    await expect(
      executeLocalPlan(
        plan({
          operationId: 'rename-1',
          action: 'RENAME',
          sourcePath,
          destinationPath,
          sourceFingerprint: 'a'.repeat(64),
        }),
        staleDeps,
      ),
    ).rejects.toMatchObject<LocalActionError>({ code: 'STALE_PLAN' });
  });
});

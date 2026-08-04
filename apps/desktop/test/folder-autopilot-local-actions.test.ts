import { describe, expect, it, vi } from 'vitest';
import {
  executeLocalPlan,
  LocalActionFailure,
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
    renameExclusive: vi.fn(() => Promise.resolve()),
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
        {
          operationId: 'inspect-1',
          action: 'INSPECT',
          sourcePath,
          sourceFingerprint: 'a'.repeat(64),
        },
        {
          operationId: 'validate-1',
          action: 'VALIDATE',
          sourcePath,
          sourceFingerprint: 'a'.repeat(64),
        },
      ),
      deps,
    );

    expect(result.map((item) => item.status)).toEqual(['APPLIED', 'APPLIED']);
    expect(copyExclusive).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
  });

  it('revalidates containment and source fingerprint before a rename', async () => {
    const deps = dependencies();
    const renameExclusive = vi.spyOn(deps.fileSystem, 'renameExclusive');
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

    expect(result[0]!.status).toBe('APPLIED');
    expect(deps.sourceGuard.assertContained).toHaveBeenCalledWith(sourcePath);
    expect(deps.destinationGuard.assertContained).toHaveBeenCalledWith(destinationPath);
    expect(renameExclusive).toHaveBeenCalledWith(sourcePath, destinationPath);
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

  it('allocates a bounded deterministic unique name and returns the chosen destination', async () => {
    const exists = vi
      .fn<LocalFileSystem['exists']>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    const deps = dependencies({ exists });
    const copyExclusive = vi.spyOn(deps.fileSystem, 'copyExclusive');
    await expect(
      executeLocalPlan(
        plan({
          operationId: 'copy-unique-1',
          action: 'COPY',
          sourcePath,
          destinationPath,
          sourceFingerprint: 'a'.repeat(64),
          collisionPolicy: 'UNIQUE_NAME',
        }),
        deps,
      ),
    ).resolves.toEqual([
      {
        operationId: 'copy-unique-1',
        action: 'COPY',
        status: 'APPLIED',
        destinationPath: 'C:\\Output\\invoice-reviewed (2).csv',
      },
    ]);
    expect(copyExclusive).toHaveBeenCalledWith(sourcePath, 'C:\\Output\\invoice-reviewed (2).csv');
    expect(deps.destinationGuard.assertContained).toHaveBeenNthCalledWith(
      2,
      'C:\\Output\\invoice-reviewed (1).csv',
    );
    expect(deps.destinationGuard.assertContained).toHaveBeenNthCalledWith(
      3,
      'C:\\Output\\invoice-reviewed (2).csv',
    );
  });

  it('prefers the exclusive rename port when the adapter provides it', async () => {
    const renameExclusive = vi.fn<NonNullable<LocalFileSystem['renameExclusive']>>(() =>
      Promise.resolve(),
    );
    const deps = dependencies({ renameExclusive });
    const rename = vi.spyOn(deps.fileSystem, 'rename');

    await executeLocalPlan(
      plan({
        operationId: 'rename-exclusive-1',
        action: 'RENAME',
        sourcePath,
        destinationPath,
        sourceFingerprint: 'a'.repeat(64),
      }),
      deps,
    );

    expect(renameExclusive).toHaveBeenCalledWith(sourcePath, destinationPath);
    expect(rename).not.toHaveBeenCalled();
  });

  it('fails closed when only a non-exclusive rename primitive is available', async () => {
    const deps = dependencies();
    delete deps.fileSystem.renameExclusive;
    const rename = vi.spyOn(deps.fileSystem, 'rename');

    await expect(
      executeLocalPlan(
        plan({
          operationId: 'rename-unsafe-1',
          action: 'RENAME',
          sourcePath,
          destinationPath,
          sourceFingerprint: 'a'.repeat(64),
        }),
        deps,
      ),
    ).rejects.toMatchObject({ code: 'EXCLUSIVE_RENAME_REQUIRED' });
    expect(rename).not.toHaveBeenCalled();
  });

  it('maps guard and filesystem failures to content-free stable errors', async () => {
    const sourceGuardFailure = dependencies({
      readFingerprint: vi.fn(() => Promise.reject(new Error('source C:\\secret\\file.csv'))),
    });
    await expect(
      executeLocalPlan(
        plan({
          operationId: 'read-failure-1',
          action: 'INSPECT',
          sourcePath,
          sourceFingerprint: 'a'.repeat(64),
        }),
        sourceGuardFailure,
      ),
    ).rejects.toMatchObject({ code: 'LOCAL_IO_FAILED', message: 'LOCAL_IO_FAILED' });

    const guardFailure = dependencies();
    guardFailure.destinationGuard.assertContained = vi.fn(() => {
      throw new Error('destination C:\\secret\\file.csv');
    });
    await expect(
      executeLocalPlan(
        plan({
          operationId: 'guard-failure-1',
          action: 'COPY',
          sourcePath,
          destinationPath,
          sourceFingerprint: 'a'.repeat(64),
        }),
        guardFailure,
      ),
    ).rejects.toMatchObject({ code: 'LOCAL_IO_FAILED', message: 'LOCAL_IO_FAILED' });
  });

  it('rejects unique-name exhaustion at the bounded allocation limit', async () => {
    const exists = vi.fn<LocalFileSystem['exists']>(() => Promise.resolve(true));
    const deps = dependencies({ exists });

    await expect(
      executeLocalPlan(
        plan({
          operationId: 'copy-unique-exhausted',
          action: 'COPY',
          sourcePath,
          destinationPath,
          sourceFingerprint: 'a'.repeat(64),
          collisionPolicy: 'UNIQUE_NAME',
        }),
        deps,
      ),
    ).rejects.toMatchObject({ code: 'DESTINATION_COLLISION' });
    expect(exists).toHaveBeenCalledTimes(1_001);
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
    ).rejects.toMatchObject({ code: 'DESTINATION_COLLISION' });

    const staleDeps = dependencies({
      readFingerprint: vi.fn(() => Promise.resolve('b'.repeat(64))),
    });
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
    ).rejects.toMatchObject({ code: 'STALE_PLAN' });
  });

  it('preserves receipts when a later write fails', async () => {
    const copyExclusive = vi
      .fn<LocalFileSystem['copyExclusive']>()
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('disk full'));
    const deps = dependencies({ copyExclusive });
    try {
      await executeLocalPlan(
        plan(
          {
            operationId: 'copy-first',
            action: 'COPY',
            sourcePath,
            destinationPath,
            sourceFingerprint: 'a'.repeat(64),
          },
          {
            operationId: 'copy-second',
            action: 'COPY',
            sourcePath,
            destinationPath: 'C:\\Output\\second.csv',
            sourceFingerprint: 'a'.repeat(64),
          },
        ),
        deps,
      );
      throw new Error('expected local action failure');
    } catch (error) {
      expect(error).toBeInstanceOf(LocalActionFailure);
      expect(error).toMatchObject({ code: 'LOCAL_IO_FAILED' });
      expect((error as LocalActionFailure).appliedReceipts).toHaveLength(1);
      expect((error as LocalActionFailure).appliedReceipts[0]?.operationId).toBe('copy-first');
    }
  });

  it('preserves receipts when a later operation has a stale source', async () => {
    const readFingerprint = vi
      .fn<LocalFileSystem['readFingerprint']>()
      .mockResolvedValueOnce('a'.repeat(64))
      .mockResolvedValueOnce('b'.repeat(64));
    const deps = dependencies({ readFingerprint });

    await expect(
      executeLocalPlan(
        plan(
          {
            operationId: 'copy-first',
            action: 'COPY',
            sourcePath,
            destinationPath,
            sourceFingerprint: 'a'.repeat(64),
          },
          {
            operationId: 'copy-stale',
            action: 'COPY',
            sourcePath,
            destinationPath: 'C:\\Output\\stale.csv',
            sourceFingerprint: 'a'.repeat(64),
          },
        ),
        deps,
      ),
    ).rejects.toMatchObject({
      code: 'STALE_PLAN',
      appliedReceipts: [{ operationId: 'copy-first', status: 'APPLIED' }],
    });
  });

  it('rejects missing operation identifiers before filesystem access', async () => {
    const deps = dependencies();
    const readFingerprint = vi.spyOn(deps.fileSystem, 'readFingerprint');
    await expect(
      executeLocalPlan(
        {
          operations: [
            {
              operationId: undefined,
              action: 'INSPECT',
              sourcePath,
              sourceFingerprint: 'a'.repeat(64),
            },
          ],
        } as unknown as LocalActionPlan,
        deps,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_PLAN' });
    expect(readFingerprint).not.toHaveBeenCalled();
  });
});

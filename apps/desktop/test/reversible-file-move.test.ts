import { mkdtemp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  commitMove,
  planMove,
  undoMove,
  type ReversibleFileMoveFsV1,
} from '../src/application/reversible-file-move.service.ts';

async function createFs(root: string): Promise<ReversibleFileMoveFsV1> {
  await Promise.resolve();
  return {
    async readBytes(relativePath) {
      return readFile(join(root, relativePath));
    },
    async writeBytes(relativePath, bytes) {
      await mkdir(join(root, relativePath, '..'), { recursive: true });
      await writeFile(join(root, relativePath), bytes);
    },
    async exists(relativePath) {
      try {
        await access(join(root, relativePath));
        return true;
      } catch {
        return false;
      }
    },
    async remove(relativePath) {
      await rm(join(root, relativePath), { force: true });
    },
    async rename(fromRelative, toRelative) {
      await mkdir(join(root, toRelative, '..'), { recursive: true });
      const { rename } = await import('node:fs/promises');
      await rename(join(root, fromRelative), join(root, toRelative));
    },
  };
}

describe('[DSO-009][DSK-014] reversible file move', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'db-move-'));
    await mkdir(join(root, 'inbox'), { recursive: true });
    await mkdir(join(root, 'sales'), { recursive: true });
    await writeFile(join(root, 'inbox', 'a.csv'), 'invoice_id,amount\n1,2\n', 'utf8');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('rejects absolute paths, traversal, and destinations outside the grant', async () => {
    const fs = await createFs(root);
    expect(
      (
        await planMove({
          bindingId: 'binding-1',
          relativeSource: '../escape.csv',
          relativeDestinationDirectory: 'sales',
          approvedRootRelativePrefixes: ['inbox/', 'sales/'],
        })
      ).accepted,
    ).toBe(false);
    expect(
      (
        await planMove({
          bindingId: 'binding-1',
          relativeSource: 'C:/Windows/a.csv',
          relativeDestinationDirectory: 'sales',
          approvedRootRelativePrefixes: ['inbox/', 'sales/'],
        })
      ).accepted,
    ).toBe(false);
    expect(
      (
        await planMove({
          bindingId: 'binding-1',
          relativeSource: 'inbox/a.csv',
          relativeDestinationDirectory: 'outside',
          approvedRootRelativePrefixes: ['inbox/', 'sales/'],
          fs,
        })
      ).accepted,
    ).toBe(false);
  });

  it('plans and commits a collision-safe verified move then supports undo', async () => {
    const fs = await createFs(root);
    const sourceBytes = await readFile(join(root, 'inbox', 'a.csv'));
    const fingerprint = createHash('sha256').update(sourceBytes).digest('hex');
    const plan = await planMove({
      bindingId: 'binding-1',
      relativeSource: 'inbox/a.csv',
      relativeDestinationDirectory: 'sales',
      approvedRootRelativePrefixes: ['inbox/', 'sales/'],
      fs,
    });
    expect(plan.accepted).toBe(true);
    if (!plan.accepted) return;
    expect(plan.value.sourceFingerprint).toBe(fingerprint);

    const committed = await commitMove({
      planId: plan.value.planId,
      expectedFingerprint: fingerprint,
      plan: plan.value,
      fs,
    });
    expect(committed.accepted).toBe(true);
    if (!committed.accepted) return;
    expect(
      await access(join(root, 'inbox', 'a.csv'))
        .then(() => false)
        .catch(() => true),
    ).toBe(true);
    const moved = await readFile(join(root, committed.value.relativeDestination));
    expect(createHash('sha256').update(moved).digest('hex')).toBe(fingerprint);

    const undone = await undoMove({
      receiptId: committed.value.receiptId,
      receipt: committed.value,
      fs,
    });
    expect(undone.accepted).toBe(true);
    const restored = await readFile(join(root, 'inbox', 'a.csv'));
    expect(createHash('sha256').update(restored).digest('hex')).toBe(fingerprint);
  });

  it('rejects commit when source fingerprint changed after preview', async () => {
    const fs = await createFs(root);
    const plan = await planMove({
      bindingId: 'binding-1',
      relativeSource: 'inbox/a.csv',
      relativeDestinationDirectory: 'sales',
      approvedRootRelativePrefixes: ['inbox/', 'sales/'],
      fs,
    });
    expect(plan.accepted).toBe(true);
    if (!plan.accepted) return;
    await writeFile(join(root, 'inbox', 'a.csv'), 'changed\n', 'utf8');
    const committed = await commitMove({
      planId: plan.value.planId,
      expectedFingerprint: plan.value.sourceFingerprint,
      plan: plan.value,
      fs,
    });
    expect(committed.accepted).toBe(false);
    if (committed.accepted) return;
    expect(committed.code).toBe('SOURCE_CHANGED');
  });
});

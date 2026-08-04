import { describe, expect, it } from 'vitest';
import {
  JournalError,
  beginJournal,
  beginUndo,
  buildUndoPlan,
  completeUndo,
  compensateJournal,
  createJournal,
  failJournal,
  recordJournalStep,
  recoverJournal,
  type JournalStepInput,
} from '../src/features/folder-autopilot/local-journal.ts';

const source = 'C:\\Approved\\invoice.csv';
const destination = 'C:\\Output\\invoice-reviewed.csv';
const before = 'a'.repeat(64);
const after = 'b'.repeat(64);

const steps: readonly JournalStepInput[] = [
  {
    operationId: 'rename-1',
    action: 'RENAME',
    sourcePath: source,
    destinationPath: destination,
    beforeFingerprint: before,
    undoable: true,
  },
  {
    operationId: 'move-1',
    action: 'MOVE',
    sourcePath: destination,
    destinationPath: 'C:\\Archive\\invoice-reviewed.csv',
    beforeFingerprint: after,
    undoable: true,
  },
];

function committedJournal() {
  let journal = createJournal({
    executionId: 'execution-1',
    planHash: 'c'.repeat(64),
    steps,
    nowMs: 1_000,
    undoWindowMs: 60_000,
  });
  journal = beginJournal(journal);
  journal = recordJournalStep(journal, 'rename-1', after);
  journal = recordJournalStep(journal, 'move-1', 'd'.repeat(64));
  return journal;
}

describe('Folder Autopilot local journal', () => {
  it('commits staged steps exactly once and exposes a reverse undo plan', () => {
    const journal = committedJournal();
    expect(journal.state).toBe('COMMITTED');
    expect(journal.steps.every((step) => step.state === 'COMMITTED')).toBe(true);

    const undo = buildUndoPlan(journal, {
      nowMs: 2_000,
      currentFingerprints: new Map([
        ['C:\\Archive\\invoice-reviewed.csv', 'd'.repeat(64)],
        [destination, after],
      ]),
    });

    expect(undo.operations.map((operation) => operation.sourcePath)).toEqual([
      'C:\\Archive\\invoice-reviewed.csv',
      destination,
    ]);
    expect(undo.operations[0]!.destinationPath).toBe(destination);
    expect(undo.planHash).toBe('c'.repeat(64));
  });

  it('refuses undo when a later user edit changed an affected file', () => {
    const journal = committedJournal();
    expect(() =>
      buildUndoPlan(journal, {
        nowMs: 2_000,
        currentFingerprints: new Map([
          ['C:\\Archive\\invoice-reviewed.csv', 'changed'.padEnd(64, '0')],
          [destination, after],
        ]),
      }),
    ).toThrowError(new JournalError('UNDO_CONFLICT'));
  });

  it('recovers a crashed commit or enters an explained conflict', () => {
    let journal = beginJournal(
      createJournal({
        executionId: 'execution-1',
        planHash: 'c'.repeat(64),
        steps,
        nowMs: 1_000,
        undoWindowMs: 60_000,
      }),
    );
    journal = recordJournalStep(journal, 'rename-1', after);
    expect(recoverJournal(journal, new Map([['rename-1', 'COMMITTED']])).state).toBe('COMMITTING');
    expect(() => recoverJournal(journal, new Map([['rename-1', 'UNKNOWN']]))).toThrow(
      'RECOVERY_CONFLICT',
    );
  });

  it('supports compensation after a staged failure and bounds undo expiry', () => {
    let journal = beginJournal(
      createJournal({
        executionId: 'execution-1',
        planHash: 'c'.repeat(64),
        steps,
        nowMs: 1_000,
        undoWindowMs: 60_000,
      }),
    );
    journal = recordJournalStep(journal, 'rename-1', after);
    journal = failJournal(journal);
    journal = compensateJournal(journal, 'rename-1');
    expect(journal.state).toBe('COMPENSATED');
    expect(() =>
      buildUndoPlan(committedJournal(), {
        nowMs: 61_001,
        currentFingerprints: new Map(),
      }),
    ).toThrowError(new JournalError('UNDO_EXPIRED'));
  });

  it('tracks the undo lifecycle without erasing the original journal', () => {
    const { journal: undoing, plan } = beginUndo(committedJournal(), {
      nowMs: 2_000,
      currentFingerprints: new Map([
        ['C:\\Archive\\invoice-reviewed.csv', 'd'.repeat(64)],
        [destination, after],
      ]),
    });
    expect(undoing.state).toBe('UNDOING');
    expect(plan.operations).toHaveLength(2);
    expect(completeUndo(undoing).state).toBe('UNDONE');
    expect(() => completeUndo(completeUndo(undoing))).toThrow('INVALID_TRANSITION');
  });
});

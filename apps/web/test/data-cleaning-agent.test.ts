import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyIntents,
  coherenceCheck,
  deriveSafeIntents,
  planIntents,
} from '../src/features/data/cleaning-engine.ts';
import { parseCsvContent } from '../src/features/data/csv-parser.ts';
import {
  cleaningAgentStore,
  parseCleaningInstruction,
} from '../src/features/data/cleaning-agent-store.ts';
import { localDataStore } from '../src/features/data/local-data-store.ts';
import { buildDatasetRecordFromTabular } from '../src/features/data/csv-parser.ts';

function seedDataset(csv: string, name = 'seed.csv'): string {
  const parsed = parseCsvContent(name, csv);
  const record = buildDatasetRecordFromTabular(parsed, 'vi-VN');
  localDataStore.addDataset(record, parsed);
  return record.datasetId;
}

describe('[DDA-053] cleaning engine', () => {
  it('plans type changes with lossy detection and before/after examples', () => {
    const parsed = parseCsvContent('t.csv', 'ma,so_luong\nA,0012\nB,7\n');
    const plan = planIntents(parsed, [
      { kind: 'CHANGE_COLUMN_TYPE', column: 'so_luong', targetType: 'INTEGER' },
    ]);
    expect(plan.allValid).toBe(true);
    expect(plan.anyLossy).toBe(false);
    expect(plan.intents[0]?.affectedCount).toBe(2);

    const bad = parseCsvContent('bad.csv', 'ma,gia\nA,2.55\nB,abc\n');
    const lossyPlan = planIntents(bad, [
      { kind: 'CHANGE_COLUMN_TYPE', column: 'gia', targetType: 'DECIMAL' },
    ]);
    expect(lossyPlan.anyLossy).toBe(true);
    expect(lossyPlan.intents[0]?.exampleBefore).toBe('abc');
    expect(lossyPlan.intents[0]?.exampleAfter).toBe('null');
  });

  it('marks unknown columns invalid without touching data', () => {
    const parsed = parseCsvContent('t.csv', 'a\n1\n');
    const plan = planIntents(parsed, [
      { kind: 'CHANGE_COLUMN_TYPE', column: 'nope', targetType: 'TEXT' },
    ]);
    expect(plan.allValid).toBe(false);
  });

  it('applies intents as fresh immutable payloads', () => {
    const parsed = parseCsvContent('t.csv', 'ma,ngay\nA,12/1/2010 8:26\nB,1/2/2011\n');
    const next = applyIntents(parsed, [{ kind: 'FIX_DATE_FORMAT', column: 'ngay' }]);
    // Vietnamese D/M convention: 12/1/2010 is January 12.
    expect(next.rows[0]?.['ngay']).toBe('2010-01-12 08:26');
    expect(next.rows[1]?.['ngay']).toBe('2011-02-01');
    expect(parsed.rows[0]?.['ngay']).toBe('12/1/2010 8:26');
  });

  it('deduplicates fully identical rows and reports the drop', () => {
    const parsed = parseCsvContent('d.csv', 'a,b\n1,2\n1,2\n3,4\n');
    const plan = planIntents(parsed, [{ kind: 'DEDUPLICATE_ROWS' }]);
    expect(plan.intents[0]?.lossy).toBe(true);
    expect(plan.intents[0]?.affectedCount).toBe(1);
    const next = applyIntents(parsed, [{ kind: 'DEDUPLICATE_ROWS' }]);
    expect(next.totalRows).toBe(2);
  });

  it('derives the realistic fix queue: duplicates need confirmation', () => {
    const parsed = parseCsvContent('q.csv', 'a,b\n1,2\n1,2\n3,4\n');
    const intents = deriveSafeIntents(parsed);
    expect(intents).toEqual([{ kind: 'DEDUPLICATE_ROWS' }]);
  });

  it('checks project coherence across shared keys', () => {
    const a = {
      record: { label: 'Sales' } as never,
      tabular: parseCsvContent('a.csv', 'ma_hang,so\nX1,5\nX2,3\n'),
    };
    const b = {
      record: { label: 'Stock' } as never,
      tabular: parseCsvContent('b.csv', 'ma_hang,ton\nX1,10\nX3,2\n'),
    };
    const report = coherenceCheck([a, b]);
    expect(
      report.findings.some((finding) => finding.textVi.includes('1 giá trị trùng')),
    ).toBe(true);
  });
});

describe('[DDA-053] agent instruction parsing', () => {
  const tabular = parseCsvContent('p.csv', 'Số lượng,Ngày giao dịch,Quốc gia\n6,12/1/2010,UK\n');

  it('maps Vietnamese type-change instructions to typed intents', () => {
    const outcome = parseCleaningInstruction('Đổi cột Số lượng sang số nguyên', tabular);
    expect(outcome).toEqual({
      kind: 'intents',
      intents: [{ kind: 'CHANGE_COLUMN_TYPE', column: 'Số lượng', targetType: 'INTEGER' }],
    });
  });

  it('maps duplicate-removal requests', () => {
    expect(parseCleaningInstruction('Bỏ các dòng trùng lặp', tabular)).toEqual({
      kind: 'intents',
      intents: [{ kind: 'DEDUPLICATE_ROWS' }],
    });
  });

  it('asks for clarification with suggestions instead of guessing', () => {
    const outcome = parseCleaningInstruction('làm cho đẹp dữ liệu giúp tôi', tabular);
    expect(outcome.kind).toBe('clarification');
  });
});

describe('[DDA-053] agent chat-to-clean loop', () => {
  beforeEach(() => {
    localDataStore.resetToDefaults();
  });

  it('proposes user-requested changes and applies them as revisions', async () => {
    const datasetId = seedDataset('ma,so\nA,"2.55"\nB,"3.39"\n');
    await cleaningAgentStore.loadThread(datasetId);
    cleaningAgentStore.send(datasetId, 'Đổi cột so sang số thập phân', 'vi-VN');

    const thread = cleaningAgentStore.getThread(datasetId);
    const proposal = thread.messages.find((message) => message.role === 'proposal');
    expect(proposal?.status).toBe('pending');

    cleaningAgentStore.applyProposal(datasetId, proposal?.proposalId ?? '', 'vi-VN');
    const appliedRecord = localDataStore.getDatasetRecord(datasetId);
    expect(appliedRecord?.appliedRevisions).toHaveLength(1);
    expect(appliedRecord?.cleaningState).not.toBe('APPROVED');
    expect(localDataStore.getTabularData(datasetId)?.rows[0]?.['so']).toBe(2.55);
  });

  it('auto-applies requested safe intents and invites approval when the queue empties', async () => {
    const datasetId = seedDataset('ma,so\nA,"2.55"\nB,"3.39"\n');
    await cleaningAgentStore.loadThread(datasetId);
    cleaningAgentStore.setAutoApplySafe(datasetId, true);

    cleaningAgentStore.send(datasetId, 'Đổi cột so sang số thập phân', 'vi-VN');

    const thread = cleaningAgentStore.getThread(datasetId);
    expect(thread.messages.some((message) => message.role === 'applied')).toBe(true);
    expect(thread.messages.some((message) => message.role === 'proposal' && message.status === 'pending')).toBe(false);
    expect(thread.messages.some((message) => message.role === 'agent' && (message.text ?? '').includes('sẵn sàng'))).toBe(true);
    expect(localDataStore.getDatasetRecord(datasetId)?.cleaningState).toBe('REVIEW');
  });

  it('locks the dataset only through the explicit approval action', async () => {
    const datasetId = seedDataset('a\n1\n');
    await cleaningAgentStore.loadThread(datasetId);
    cleaningAgentStore.send(datasetId, 'Bỏ các dòng trùng lặp', 'vi-VN');

    const approved = localDataStore.approveDataset(datasetId);
    expect(approved?.cleaningState).toBe('APPROVED');

    cleaningAgentStore.send(datasetId, 'Đổi cột a sang số nguyên', 'vi-VN');
    const thread = cleaningAgentStore.getThread(datasetId);
    const lastAgent = [...thread.messages].reverse().find((message) => message.role === 'agent');
    expect(lastAgent?.text).toContain('khóa');
    expect(localDataStore.getDatasetRecord(datasetId)?.cleaningState).toBe('APPROVED');
  });
});

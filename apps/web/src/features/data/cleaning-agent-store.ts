import type { CleaningIntentV1 } from './data-model.ts';
import type { ParsedTabularData } from './csv-parser.ts';
import {
  applyIntents,
  buildCleaningRevision,
  deriveSafeIntents,
  planIntents,
  type CleaningContextV1,
  type CleaningPlanV1,
} from './cleaning-engine.ts';
import { localDataStore } from './local-data-store.ts';

/**
 * Deterministic cleaning agent (DDA-053 chat-to-clean). Parses bilingual
 * instructions into typed intents, proposes plans, auto-applies SAFE ones when
 * the user opts in, and always stops for confirmation on lossy operations.
 * ADR-0005: no provider calls — every number comes from the local engine.
 */

export type AgentMessageRoleV1 = 'user' | 'agent' | 'proposal' | 'applied' | 'system';

export interface AgentMessageV1 {
  readonly messageId: string;
  readonly role: AgentMessageRoleV1;
  readonly createdAt: string;
  readonly text?: string;
  readonly proposalId?: string;
  readonly plan?: CleaningPlanV1;
  readonly status?: 'pending' | 'applied' | 'skipped';
  readonly suggestions?: readonly string[];
}

export interface CleaningThreadV1 {
  readonly datasetId: string;
  readonly messages: readonly AgentMessageV1[];
  readonly autoApplySafe: boolean;
}

function stripDiacritics(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function findColumn(text: string, headers: readonly string[]): string | undefined {
  const normalized = stripDiacritics(text);
  let best: string | undefined;
  let bestLength = 0;
  for (const header of headers) {
    const clean = stripDiacritics(header);
    if (clean.length === 0) continue;
    if (normalized.includes(clean) && clean.length > bestLength) {
      best = header;
      bestLength = clean.length;
    }
  }
  return best;
}

export type ParseOutcomeV1 =
  | { readonly kind: 'intents'; readonly intents: readonly CleaningIntentV1[] }
  | { readonly kind: 'clarification'; readonly suggestions: readonly string[] };

/** Map free-text instructions (vi/en) onto typed cleaning intents. */
export function parseCleaningInstruction(text: string, tabular: ParsedTabularData): ParseOutcomeV1 {
  const normalized = stripDiacritics(text);
  const suggestions: string[] = [];

  // Deduplicate
  if (/(bo|go|xoa|loai bo|loai tru|remove|delete|dedupe).*(trung|duplicate)/u.test(normalized)) {
    return { kind: 'intents', intents: [{ kind: 'DEDUPLICATE_ROWS' }] };
  }

  // Change column type
  if (
    /(doi|chuyen|change|convert|cast|ep kieu).*(cot|column|kieu|type)/u.test(normalized) ||
    /(so nguyen|integer|so thap phan|decimal|kieu ngay|as date|as text)/u.test(normalized)
  ) {
    const column = findColumn(text, tabular.headers);
    if (column !== undefined) {
      let targetType: 'INTEGER' | 'DECIMAL' | 'DATE' | 'TEXT' | undefined;
      if (/so nguyen|integer|\bint\b/u.test(normalized)) targetType = 'INTEGER';
      else if (/so thap phan|decimal|float|so tien|number/u.test(normalized))
        targetType = 'DECIMAL';
      else if (/ngay|date/u.test(normalized)) targetType = 'DATE';
      else if (/van ban|text|string|chuoi/u.test(normalized)) targetType = 'TEXT';
      if (targetType !== undefined) {
        return { kind: 'intents', intents: [{ kind: 'CHANGE_COLUMN_TYPE', column, targetType }] };
      }
    }
    suggestions.push('Đổi cột "Số lượng" sang số nguyên');
    return { kind: 'clarification', suggestions };
  }

  // Rename column
  const renameMatch = /(doi ten|rename|dong ten cot).*(cot|column)?/u.test(normalized);
  if (renameMatch) {
    const column = findColumn(text, tabular.headers);
    const newName = /\[(.+)\]|"(.+)"|'(.+)'|thanh\s+(\S+)|to\s+(\S+)/u.exec(text);
    if (column !== undefined && newName !== null) {
      const captured = newName
        .slice(1)
        .find((group) => group !== undefined && group.trim().length > 0);
      if (captured !== undefined) {
        return {
          kind: 'intents',
          intents: [{ kind: 'RENAME_COLUMN', column, newName: captured.trim() }],
        };
      }
    }
    suggestions.push('Đổi tên cột "Ngày" thành "Ngày giao dịch"');
    return { kind: 'clarification', suggestions };
  }

  // Normalize values
  if (
    /(chuan hoa|normalize|trim|khoang trang|viet thuong|lowercase).*(gia tri|values?|cot|column)?/u.test(
      normalized,
    )
  ) {
    const column = findColumn(text, tabular.headers);
    if (column !== undefined) {
      return {
        kind: 'intents',
        intents: [
          {
            kind: 'NORMALIZE_VALUES',
            column,
            trim: true,
            lowercase: /viet thuong|lowercase/u.test(normalized),
          },
        ],
      };
    }
    suggestions.push('Chuẩn hóa giá trị cột "Quốc gia"');
    return { kind: 'clarification', suggestions };
  }

  // Filter rows
  if (/(bo|loc|filter|loai bo|xoa).*(dong|hang|row)/u.test(normalized)) {
    const column = findColumn(text, tabular.headers);
    if (column !== undefined) {
      if (/trong|rong|empty|null/u.test(normalized)) {
        return { kind: 'intents', intents: [{ kind: 'FILTER_ROWS', column, operator: 'EMPTY' }] };
      }
    }
    suggestions.push('Bỏ các dòng có cột "Ngày" trống');
    return { kind: 'clarification', suggestions };
  }

  // Fix date format
  if (/(chuan hoa|dinh dang|normalize|format|sua).*(ngay|date)/u.test(normalized)) {
    const column = findColumn(text, tabular.headers);
    if (column !== undefined) {
      return { kind: 'intents', intents: [{ kind: 'FIX_DATE_FORMAT', column }] };
    }
    suggestions.push('Chuẩn hóa định dạng ngày của cột "Ngày giao dịch"');
    return { kind: 'clarification', suggestions };
  }

  const derived = deriveSafeIntents(tabular).slice(0, 3);
  return {
    kind: 'clarification',
    suggestions: [...derived.map((intent) => suggestionFor(intent)), 'Bỏ các dòng trùng lặp'].slice(
      0,
      3,
    ),
  };
}

function suggestionFor(intent: CleaningIntentV1): string {
  switch (intent.kind) {
    case 'CHANGE_COLUMN_TYPE':
      return `Đổi cột "${intent.column}" sang ${intent.targetType === 'INTEGER' ? 'số nguyên' : 'số thập phân'}`;
    case 'FIX_DATE_FORMAT':
      return `Chuẩn hóa định dạng ngày của cột "${intent.column}"`;
    case 'DEDUPLICATE_ROWS':
      return 'Bỏ các dòng trùng lặp';
    default:
      return 'Bỏ các dòng trùng lặp';
  }
}

function intentKey(intent: CleaningIntentV1): string {
  return JSON.stringify(intent);
}

function nowIso(): string {
  return new Date().toISOString();
}

export class CleaningAgentStore {
  private readonly threads = new Map<string, CleaningThreadV1>();
  private readonly listeners = new Set<() => void>();
  private readonly loaded = new Set<string>();

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  public async loadThread(datasetId: string): Promise<CleaningThreadV1> {
    const existing = this.threads.get(datasetId);
    if (existing !== undefined) return existing;
    if (!this.loaded.has(datasetId)) {
      this.loaded.add(datasetId);
      const persisted = await localDataStore.loadThread(datasetId);
      if (persisted !== undefined) {
        const thread: CleaningThreadV1 = {
          datasetId,
          messages: persisted.messages as readonly AgentMessageV1[],
          autoApplySafe: persisted.autoApplySafe,
        };
        this.threads.set(datasetId, thread);
        return thread;
      }
    }
    const fresh: CleaningThreadV1 = { datasetId, messages: [], autoApplySafe: false };
    this.threads.set(datasetId, fresh);
    return fresh;
  }

  public getThread(datasetId: string): CleaningThreadV1 {
    const existing = this.threads.get(datasetId);
    if (existing !== undefined) return existing;
    // Memoize the empty thread so useSyncExternalStore snapshots stay stable.
    const fresh: CleaningThreadV1 = { datasetId, messages: [], autoApplySafe: false };
    this.threads.set(datasetId, fresh);
    return fresh;
  }

  private update(
    datasetId: string,
    mutate: (thread: CleaningThreadV1) => CleaningThreadV1,
  ): CleaningThreadV1 {
    const thread = this.getThread(datasetId);
    const next = mutate(thread);
    this.threads.set(datasetId, next);
    this.notify();
    void localDataStore.saveThread({
      datasetId,
      messages: next.messages,
      autoApplySafe: next.autoApplySafe,
      updatedAt: nowIso(),
    });
    return next;
  }

  private append(
    datasetId: string,
    message: Omit<AgentMessageV1, 'messageId' | 'createdAt'>,
  ): void {
    this.update(datasetId, (thread) => ({
      ...thread,
      messages: [
        ...thread.messages,
        { ...message, messageId: crypto.randomUUID(), createdAt: nowIso() },
      ],
    }));
  }

  /** Initial greeting describing what the agent found in this dataset. */
  public async greet(datasetId: string, locale: 'en' | 'vi-VN'): Promise<void> {
    await this.loadThread(datasetId);
    const thread = this.getThread(datasetId);
    if (thread.messages.length > 0) return;
    const tabular = localDataStore.getTabularData(datasetId);
    if (tabular === undefined) return;
    const derived = deriveSafeIntents(tabular);
    const vi = locale === 'vi-VN';
    const text = vi
      ? `Tôi đã xem bộ dữ liệu này (${tabular.totalRows.toLocaleString('vi-VN')} dòng). ${
          derived.length > 0
            ? `Tôi thấy ${derived.length} việc có thể cải thiện — bạn có thể yêu cầu trực tiếp hoặc để tôi đề xuất từng bước.`
            : 'Dữ liệu hiện đã khá sạch. Bạn muốn chỉnh gì cứ nói nhé!'
        }`
      : `I reviewed this dataset (${tabular.totalRows.toLocaleString('en-US')} rows). ${
          derived.length > 0
            ? `I found ${derived.length} possible improvements — ask directly or let me propose them step by step.`
            : 'The data looks clean already. Tell me what to adjust!'
        }`;
    this.append(datasetId, { role: 'agent', text });
  }

  public setAutoApplySafe(datasetId: string, enabled: boolean): void {
    this.update(datasetId, (thread) => ({ ...thread, autoApplySafe: enabled }));
    this.runAutopilot(datasetId);
  }

  private pendingAndResolvedKeys(thread: CleaningThreadV1): {
    pending: Set<string>;
    resolved: Set<string>;
  } {
    const pending = new Set<string>();
    const resolved = new Set<string>();
    for (const message of thread.messages) {
      if (message.role !== 'proposal' || message.plan === undefined) continue;
      for (const item of message.plan.intents) {
        const key = intentKey(item.intent);
        if (message.status === 'pending') pending.add(key);
        else resolved.add(key);
      }
    }
    return { pending, resolved };
  }

  /** Handle a user instruction: parse, plan, then apply-or-propose. */
  public send(datasetId: string, text: string, locale: 'en' | 'vi-VN'): void {
    const tabular = localDataStore.getTabularData(datasetId);
    if (tabular === undefined) return;
    const vi = locale === 'vi-VN';
    this.append(datasetId, { role: 'user', text: text.trim() });

    const record = localDataStore.getDatasetRecord(datasetId);
    if (record?.cleaningState === 'APPROVED') {
      this.append(datasetId, {
        role: 'agent',
        text: vi
          ? 'Phiên bản này đã được duyệt và khóa. Hãy nhập thêm dữ liệu mới để tạo phiên bản tiếp theo.'
          : 'This version is approved and locked. Import new data to create the next version.',
      });
      return;
    }

    const outcome = parseCleaningInstruction(text, tabular);
    if (outcome.kind === 'clarification') {
      this.append(datasetId, {
        role: 'agent',
        text: vi
          ? 'Tôi chưa chắc ý bạn — bạn có thể thử một trong các gợi ý sau:'
          : "I'm not sure what you mean — try one of these:",
        suggestions: outcome.suggestions,
      });
      return;
    }

    const plan = planIntents(tabular, outcome.intents, mergeContext());
    if (!plan.allValid) {
      this.append(datasetId, {
        role: 'agent',
        text: vi
          ? 'Yêu cầu chưa áp dụng được (cột hoặc nguồn không hợp lệ). Hãy kiểm tra lại tên cột.'
          : 'That request cannot be applied (unknown column or source). Check the column name.',
      });
      return;
    }

    if (plan.anyLossy || !this.getThread(datasetId).autoApplySafe) {
      this.append(datasetId, {
        role: 'proposal',
        proposalId: crypto.randomUUID(),
        plan,
        status: 'pending',
      });
      this.append(datasetId, {
        role: 'agent',
        text: vi
          ? 'Đây là kế hoạch thay đổi — kiểm tra rồi bấm "Áp dụng" hoặc "Bỏ qua".'
          : 'Here is the change plan — review it, then Apply or Skip.',
      });
      localDataStore.setCleaningState(datasetId, 'CLEANING');
      return;
    }

    this.applyIntentsToDataset(datasetId, outcome.intents, plan, locale);
    this.runAutopilot(datasetId, locale);
  }

  public applyProposal(datasetId: string, proposalId: string, locale: 'en' | 'vi-VN'): void {
    const thread = this.getThread(datasetId);
    const message = thread.messages.find(
      (candidate) => candidate.proposalId === proposalId && candidate.status === 'pending',
    );
    if (message === undefined || message.plan === undefined) return;
    const intents = message.plan.intents.filter((item) => item.valid).map((item) => item.intent);
    this.markProposal(datasetId, proposalId, 'applied');
    this.applyIntentsToDataset(datasetId, intents, message.plan, locale);
    this.runAutopilot(datasetId, locale);
  }

  public skipProposal(datasetId: string, proposalId: string, locale: 'en' | 'vi-VN'): void {
    this.markProposal(datasetId, proposalId, 'skipped');
    this.runAutopilot(datasetId, locale);
  }

  private markProposal(datasetId: string, proposalId: string, status: 'applied' | 'skipped'): void {
    this.update(datasetId, (thread) => ({
      ...thread,
      messages: thread.messages.map((message) =>
        message.proposalId === proposalId ? { ...message, status } : message,
      ),
    }));
  }

  private applyIntentsToDataset(
    datasetId: string,
    intents: readonly CleaningIntentV1[],
    plan: CleaningPlanV1,
    locale: 'en' | 'vi-VN',
  ): void {
    const tabular = localDataStore.getTabularData(datasetId);
    if (tabular === undefined) return;
    const next = applyIntents(tabular, intents, mergeContext());
    const revision = buildCleaningRevision(
      intents,
      plan.anyLossy,
      tabular.totalRows,
      next.totalRows,
    );
    localDataStore.applyCleaning(datasetId, revision, next);
    const vi = locale === 'vi-VN';
    const summary = plan.intents[0]?.descriptionVi ?? revision.summaryVi;
    const summaryEn = plan.intents[0]?.descriptionEn ?? revision.summaryEn;
    this.append(datasetId, {
      role: 'applied',
      text: vi ? summary : summaryEn,
    });
    if (tabular.totalRows !== next.totalRows) {
      this.append(datasetId, {
        role: 'system',
        text: vi
          ? `Số dòng: ${tabular.totalRows.toLocaleString('vi-VN')} → ${next.totalRows.toLocaleString('vi-VN')}`
          : `Rows: ${tabular.totalRows.toLocaleString('en-US')} → ${next.totalRows.toLocaleString('en-US')}`,
      });
    }
  }

  /**
   * Auto-pilot: propose (or auto-apply) the next derived safe fix until the
   * queue empties, then invite the explicit approval decision.
   */
  public runAutopilot(datasetId: string, locale: 'en' | 'vi-VN' = 'vi-VN'): void {
    const tabular = localDataStore.getTabularData(datasetId);
    if (tabular === undefined) return;
    const record = localDataStore.getDatasetRecord(datasetId);
    if (record?.cleaningState === 'APPROVED') return;

    const thread = this.getThread(datasetId);
    const { pending, resolved } = this.pendingAndResolvedKeys(thread);
    const derived = deriveSafeIntents(tabular).filter((intent) => {
      const key = intentKey(intent);
      return !pending.has(key) && !resolved.has(key);
    });

    const vi = locale === 'vi-VN';
    if (derived.length === 0) {
      const hasPending = thread.messages.some(
        (message) => message.role === 'proposal' && message.status === 'pending',
      );
      if (!hasPending) {
        this.append(datasetId, {
          role: 'agent',
          text: vi
            ? 'Tôi không còn việc gì để đề xuất nữa — bộ dữ liệu đã sẵn sàng để duyệt.'
            : "I'm out of suggestions — the dataset is ready for your approval.",
        });
        if (record?.cleaningState !== 'REVIEW') {
          localDataStore.setCleaningState(datasetId, 'REVIEW');
        }
      }
      return;
    }

    const next = derived[0]!;
    const plan = planIntents(tabular, [next], mergeContext());
    if (!plan.anyLossy && thread.autoApplySafe) {
      this.applyIntentsToDataset(datasetId, [next], plan, locale);
      this.runAutopilot(datasetId, locale);
      return;
    }
    this.append(datasetId, {
      role: 'proposal',
      proposalId: crypto.randomUUID(),
      plan,
      status: 'pending',
    });
    localDataStore.setCleaningState(datasetId, 'CLEANING');
  }

  /** Post a coherence summary into a dataset thread after new data lands in its project. */
  public postCoherence(datasetId: string, text: string): void {
    this.append(datasetId, { role: 'system', text });
  }
}

function mergeContext(): CleaningContextV1 {
  return {
    getMergeSource: (datasetId: string) => {
      const record = localDataStore.getDatasetRecord(datasetId);
      const tabular = localDataStore.getTabularData(datasetId);
      if (record === undefined || tabular === undefined) return undefined;
      return { label: record.label, tabular };
    },
  };
}

export const cleaningAgentStore = new CleaningAgentStore();

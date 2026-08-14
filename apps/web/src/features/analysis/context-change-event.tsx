import type { AnalysisContextChangeEventV1 } from './analysis-model.ts';

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        advanced: 'Dữ liệu đã được cập nhật',
        changed: 'Ngữ cảnh phân tích đã thay đổi',
        next: 'Câu trả lời tiếp theo sử dụng ngữ cảnh được cấp quyền hiện tại.',
      }
    : {
        advanced: 'Data updated',
        changed: 'Analysis context changed',
        next: 'The next answer uses the current authorized context.',
      };
}

export interface ContextChangeEventProps {
  readonly event: AnalysisContextChangeEventV1;
  readonly locale: 'en' | 'vi-VN';
}

/** DDA-056: old answers remain unchanged; the next turn names the new context. */
export function ContextChangeEvent({ event, locale }: ContextChangeEventProps) {
  const text = copy(locale);
  const versionChange =
    event.datasetLabel !== undefined &&
    event.fromVersionLabel !== undefined &&
    event.toVersionLabel !== undefined
      ? `${event.datasetLabel}: ${event.fromVersionLabel} → ${event.toVersionLabel}`
      : undefined;
  return (
    <section className="analysis-context-change-event" role="status">
      <strong>{event.kind === 'DATASET_VERSION_ADVANCED' ? text.advanced : text.changed}</strong>
      {versionChange === undefined ? null : <span>{versionChange}</span>}
      <small>{text.next}</small>
    </section>
  );
}

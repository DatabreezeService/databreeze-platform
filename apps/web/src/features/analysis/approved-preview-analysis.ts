import type { DdaDataImportDashboardPreview } from '@databreeze/contracts/v4';

import type { AnalysisChartProposalV1 } from './analysis-model.ts';

type ApprovedPreviewV1 = DdaDataImportDashboardPreview['value'];

export interface ApprovedPreviewAnalysisResultV1 {
  readonly answerText: string;
  readonly chartProposal?: AnalysisChartProposalV1;
}

function formatNumber(value: number, locale: 'en' | 'vi-VN'): string {
  return new Intl.NumberFormat(locale === 'vi-VN' ? 'vi-VN' : 'en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMeasure(value: number, locale: 'en' | 'vi-VN'): string {
  // The bounded preview has no currency/unit metadata. Keep the exact number
  // and let the field label carry whatever semantics the approved schema knows.
  return formatNumber(value, locale);
}

/**
 * DDA-053/DDA-055: deterministic local analysis from the server-owned approved
 * preview. This intentionally contains no raw source rows and never claims to
 * be an AI completion or a certified dashboard snapshot.
 */
export function executeApprovedPreviewAnalysis(
  question: string,
  preview: ApprovedPreviewV1,
  locale: 'en' | 'vi-VN',
): ApprovedPreviewAnalysisResultV1 {
  const vi = locale === 'vi-VN';
  const measure = preview.measure;
  const dimension = preview.dimension;
  const fieldLabel = measure?.field ?? (vi ? 'giá trị số' : 'numeric value');
  const scopeLabel = preview.datasetName;
  const localLabel = vi ? 'Nhận định cục bộ từ bản xem nhanh' : 'Local approved-data preview';
  const questionLabel = question.trim().slice(0, 160);

  if (measure === undefined) {
    return {
      answerText: [
        `**${localLabel}**`,
        vi
          ? `Tôi đã kiểm tra **${scopeLabel}** theo câu hỏi “${questionLabel}”.`
          : `I checked **${scopeLabel}** for “${questionLabel}”.`,
        vi
          ? `Bản duyệt có ${formatNumber(preview.rowCount, locale)} dòng và ${formatNumber(preview.columns.length, locale)} cột, nhưng chưa có trường số để tính tổng hoặc so sánh.`
          : `The approved data has ${formatNumber(preview.rowCount, locale)} rows and ${formatNumber(preview.columns.length, locale)} columns, but no numeric field is available for totals or comparisons.`,
        vi
          ? 'Đây là bản xem nhanh cục bộ, không phải câu trả lời AI hay snapshot đã chứng nhận.'
          : 'This is a local preview, not an AI answer or certified snapshot.',
      ].join('\n\n'),
    };
  }

  const total = formatMeasure(measure.sum, locale);
  const average = formatMeasure(measure.average, locale);
  const groups = dimension?.groups ?? [];
  const groupsWithTotals = groups.filter(
    (group): group is typeof group & { readonly total: number } => typeof group.total === 'number',
  );
  const topGroup = groupsWithTotals[0] ?? groups[0];
  const chartProposal =
    groupsWithTotals.length > 0 && dimension !== undefined
      ? Object.freeze({
          optionId: `local-preview:${preview.importId}:${preview.datasetVersionId}`,
          type: 'BAR' as const,
          title: vi
            ? `${fieldLabel} theo ${dimension.field}`
            : `${fieldLabel} by ${dimension.field}`,
          summary: vi
            ? `Bản xem nhanh cục bộ theo ${dimension.field}`
            : `Local approved-data preview by ${dimension.field}`,
          dimensionName: dimension.field,
          measureName: fieldLabel,
          dataPoints: groupsWithTotals.slice(0, 6).map((group) => ({
            label: group.label,
            value: group.total,
            formatted: formatMeasure(group.total, locale),
          })),
          aggregateValue: total,
        })
      : undefined;

  const topLine =
    topGroup === undefined
      ? undefined
      : typeof topGroup.total === 'number'
        ? vi
          ? `Nhóm **${topGroup.label}** đang dẫn đầu với **${formatMeasure(topGroup.total, locale)}**.`
          : `**${topGroup.label}** leads with **${formatMeasure(topGroup.total, locale)}**.`
        : vi
          ? `Nhóm **${topGroup.label}** có nhiều bản ghi nhất (${formatNumber(topGroup.count, locale)}).`
          : `**${topGroup.label}** has the most rows (${formatNumber(topGroup.count, locale)}).`;

  return {
    answerText: [
      `**${localLabel}**`,
      vi
        ? `Tôi đã kiểm tra **${scopeLabel}** theo câu hỏi “${questionLabel}”.`
        : `I checked **${scopeLabel}** for “${questionLabel}”.`,
      vi
        ? `Tổng **${fieldLabel}** là **${total}**, trung bình **${average}** trên ${formatNumber(preview.rowCount, locale)} dòng.`
        : `Total **${fieldLabel}** is **${total}**, with an average of **${average}** across ${formatNumber(preview.rowCount, locale)} rows.`,
      ...(topLine === undefined ? [] : [topLine]),
      vi
        ? 'Đây là bản xem nhanh cục bộ từ phiên bản đã duyệt, không phải câu trả lời AI hay snapshot đã chứng nhận.'
        : 'This is a local preview from the approved version, not an AI answer or certified snapshot.',
    ].join('\n\n'),
    ...(chartProposal === undefined ? {} : { chartProposal }),
  };
}

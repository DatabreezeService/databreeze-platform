import { localDataStore } from '../data/local-data-store.ts';
import type { ParsedTabularData } from '../data/csv-parser.ts';

export interface LocalAnalysisChartProposal {
  readonly optionId: string;
  readonly type: 'BAR' | 'LINE' | 'DONUT' | 'KPI' | 'TABLE';
  readonly title: string;
  readonly summary: string;
  readonly dimensionName?: string;
  readonly measureName?: string;
  readonly dataPoints: readonly {
    readonly label: string;
    readonly value: number;
    readonly formatted: string;
  }[];
  readonly aggregateValue?: string;
}

export interface LocalAnalysisResult {
  readonly answerText: string;
  readonly chartProposal?: LocalAnalysisChartProposal;
}

function formatCurrencyOrNumber(value: number, isCurrency = true): string {
  if (isCurrency && value >= 1_000_000_000) {
    return `₫${(value / 1_000_000_000).toFixed(2).replace(/\.?0+$/u, '')} tỷ`;
  }
  if (isCurrency && value >= 1_000_000) {
    return `₫${(value / 1_000_000).toFixed(1).replace(/\.?0+$/u, '')} triệu`;
  }
  if (isCurrency && value >= 1_000) {
    return `₫${(value / 1_000).toFixed(0)}K`;
  }
  if (isCurrency) {
    return `₫${value.toLocaleString('vi-VN')}`;
  }
  return value.toLocaleString('vi-VN');
}

export function executeLocalAnalysis(
  question: string,
  datasetId?: string,
  locale: 'en' | 'vi-VN' = 'vi-VN',
): LocalAnalysisResult {
  const datasets = localDataStore.getDatasets();
  const targetDataset = datasetId ? localDataStore.getDataset(datasetId) : datasets[0];

  const tabular: ParsedTabularData | undefined = targetDataset
    ? localDataStore.getTabularData(targetDataset.datasetId)
    : undefined;

  const datasetName =
    targetDataset?.label ?? (locale === 'vi-VN' ? 'Dữ liệu không gian làm việc' : 'Workspace data');

  if (!tabular || tabular.rows.length === 0) {
    return {
      answerText:
        locale === 'vi-VN'
          ? `Tôi đã kiểm tra bộ dữ liệu "${datasetName}". Hiện chưa có bản ghi nào để tổng hợp số liệu. Bạn hãy tải lên tệp CSV/Excel trong phần Dữ liệu nhé!`
          : `I checked the dataset "${datasetName}". No records are available yet. Please upload a CSV/Excel file in Data!`,
    };
  }

  const numericCols = tabular.columns.filter((c) => c.type === 'INTEGER' || c.type === 'DECIMAL');
  const textCols = tabular.columns.filter((c) => c.type === 'TEXT');
  const dateCols = tabular.columns.filter((c) => c.type === 'DATE');

  const lowerQ = question.toLowerCase();

  // Find target numeric measure
  let measureCol = numericCols.find((c) => lowerQ.includes(c.name.toLowerCase()));
  if (!measureCol) {
    measureCol =
      numericCols.find(
        (c) =>
          c.name.toLowerCase().includes('số lượng') ||
          c.name.toLowerCase().includes('quantity') ||
          c.name.toLowerCase().includes('doanh thu') ||
          c.name.toLowerCase().includes('revenue') ||
          c.name.toLowerCase().includes('đơn giá') ||
          c.name.toLowerCase().includes('unitprice') ||
          c.name.toLowerCase().includes('tiền') ||
          c.name.toLowerCase().includes('amount') ||
          c.name.toLowerCase().includes('tồn kho'),
      ) ?? numericCols[0];
  }

  // Find target grouping dimension
  let dimCol = textCols.find((c) => lowerQ.includes(c.name.toLowerCase()));
  if (!dimCol) {
    dimCol =
      textCols.find(
        (c) =>
          c.name.toLowerCase().includes('quốc gia') ||
          c.name.toLowerCase().includes('country') ||
          c.name.toLowerCase().includes('khu vực') ||
          c.name.toLowerCase().includes('region') ||
          c.name.toLowerCase().includes('mô tả') ||
          c.name.toLowerCase().includes('description') ||
          c.name.toLowerCase().includes('sản phẩm') ||
          c.name.toLowerCase().includes('product') ||
          c.name.toLowerCase().includes('mã hàng') ||
          c.name.toLowerCase().includes('stockcode'),
      ) ??
      dateCols[0] ??
      textCols[0];
  }

  const isTimeOrder = dimCol && dimCol.type === 'DATE';
  const isCurrency = measureCol
    ? measureCol.name.toLowerCase().includes('doanh thu') ||
      measureCol.name.toLowerCase().includes('tiền') ||
      measureCol.name.toLowerCase().includes('vnd') ||
      measureCol.name.toLowerCase().includes('$') ||
      measureCol.name.toLowerCase().includes('usd') ||
      measureCol.name.toLowerCase().includes('giá') ||
      measureCol.name.toLowerCase().includes('revenue') ||
      measureCol.name.toLowerCase().includes('price')
    : true;

  if (measureCol && dimCol) {
    const aggMap = new Map<string, number>();
    let totalMeasure = 0;

    for (const row of tabular.rows) {
      const dimVal = String(row[dimCol.name] ?? (locale === 'vi-VN' ? 'Khác' : 'Other'));
      const rawNum = row[measureCol.name];
      const numVal = typeof rawNum === 'number' ? rawNum : 0;
      aggMap.set(dimVal, (aggMap.get(dimVal) ?? 0) + numVal);
      totalMeasure += numVal;
    }

    let entries = Array.from(aggMap.entries());
    if (!isTimeOrder) {
      entries.sort((a, b) => b[1] - a[1]);
    }
    entries = entries.slice(0, 6);

    const topEntry = entries[0];
    const topPct =
      totalMeasure > 0 && topEntry ? ((topEntry[1] / totalMeasure) * 100).toFixed(1) : '0';

    const dataPoints = entries.map(([label, val]) => ({
      label,
      value: val,
      formatted: formatCurrencyOrNumber(val, isCurrency),
    }));

    const chartTitle = `${measureCol.name} theo ${dimCol.name}`;
    const chartType: LocalAnalysisChartProposal['type'] = isTimeOrder ? 'LINE' : 'BAR';

    const formattedTotal = formatCurrencyOrNumber(totalMeasure, isCurrency);

    const answerLines: string[] = [];
    if (locale === 'vi-VN') {
      answerLines.push(
        `Dựa trên dữ liệu **${datasetName}** (${tabular.totalRows.toLocaleString('vi-VN')} dòng):`,
      );
      answerLines.push('');
      if (topEntry) {
        answerLines.push(
          `- **${topEntry[0]}** dẫn đầu với **${formatCurrencyOrNumber(topEntry[1], isCurrency)}** (chiếm ${topPct}% tổng số).`,
        );
      }
      for (const [lbl, val] of entries.slice(1, 4)) {
        answerLines.push(`- **${lbl}**: ${formatCurrencyOrNumber(val, isCurrency)}`);
      }
      answerLines.push('');
      answerLines.push(`Tổng cộng **${measureCol.name}** đạt **${formattedTotal}**.`);
      answerLines.push(
        'Tôi đã tạo biểu đồ tương ứng bên dưới. Bạn có thể nhấn **➕ Thêm vào Bảng điều khiển** để ghim thẻ này lên Canvas.',
      );
    } else {
      answerLines.push(`Based on data from **${datasetName}** (${tabular.totalRows} rows):`);
      answerLines.push('');
      if (topEntry) {
        answerLines.push(
          `- **${topEntry[0]}** leads with **${formatCurrencyOrNumber(topEntry[1], isCurrency)}** (${topPct}% of total).`,
        );
      }
      for (const [lbl, val] of entries.slice(1, 4)) {
        answerLines.push(`- **${lbl}**: ${formatCurrencyOrNumber(val, isCurrency)}`);
      }
      answerLines.push('');
      answerLines.push(`Total **${measureCol.name}** reaches **${formattedTotal}**.`);
      answerLines.push(
        'I created a chart proposal below. You can click **➕ Add to Dashboard** to pin it to Canvas.',
      );
    }

    return {
      answerText: answerLines.join('\n'),
      chartProposal: {
        optionId: crypto.randomUUID(),
        type: chartType,
        title: chartTitle,
        summary:
          locale === 'vi-VN'
            ? `Phân bổ ${measureCol.name} theo ${dimCol.name}`
            : `${measureCol.name} distribution by ${dimCol.name}`,
        dimensionName: dimCol.name,
        measureName: measureCol.name,
        dataPoints,
        aggregateValue: formattedTotal,
      },
    };
  }

  // Fallback KPI summary
  const formattedCount = tabular.totalRows.toLocaleString(locale === 'vi-VN' ? 'vi-VN' : 'en-US');
  return {
    answerText:
      locale === 'vi-VN'
        ? `Bộ dữ liệu **${datasetName}** hiện có **${formattedCount}** bản ghi và **${tabular.columns.length}** cột trường dữ liệu. Bạn có thể hỏi về doanh thu, số lượng hoặc cơ cấu phân nhóm!`
        : `Dataset **${datasetName}** contains **${formattedCount}** records and **${tabular.columns.length}** columns. You can ask about revenue, quantities, or group comparisons!`,
    chartProposal: {
      optionId: crypto.randomUUID(),
      type: 'KPI',
      title: locale === 'vi-VN' ? 'Tổng số bản ghi' : 'Total records',
      summary:
        locale === 'vi-VN'
          ? `Tổng bản ghi trong ${datasetName}`
          : `Total records in ${datasetName}`,
      dataPoints: [{ label: datasetName, value: tabular.totalRows, formatted: formattedCount }],
      aggregateValue: formattedCount,
    },
  };
}

/**
 * Deterministic entry point for the local analysis flow. ADR-0005 keeps AI
 * assistance behind server-side adapters only, so the browser never holds a
 * provider key or calls a provider directly.
 */
export function executeAnalysisWithAgent(
  question: string,
  datasetId?: string,
  locale: 'en' | 'vi-VN' = 'vi-VN',
): Promise<LocalAnalysisResult> {
  return Promise.resolve(executeLocalAnalysis(question, datasetId, locale));
}

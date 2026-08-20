import { describe, expect, it } from 'vitest';
import { executeLocalAnalysis } from '../src/features/analysis/local-analysis-engine.ts';

describe('local-analysis-engine', () => {
  it('aggregates revenue by region and produces chart proposal for retail dataset', () => {
    const result = executeLocalAnalysis(
      'Quốc gia nào có số lượng bán cao nhất?',
      '00000000-0000-4000-8000-000000000051',
      'vi-VN',
    );

    expect(result.answerText).toContain('Bán lẻ Trực tuyến (data.csv)');
    expect(result.chartProposal).toBeDefined();
    expect(result.chartProposal?.type).toBe('BAR');
    expect(result.chartProposal?.dataPoints.length).toBeGreaterThan(0);
  });

  it('handles custom questions in English locale', () => {
    const result = executeLocalAnalysis(
      'Compare products by quantity',
      '00000000-0000-4000-8000-000000000051',
      'en',
    );

    expect(result.answerText).toContain('Based on data from');
    expect(result.chartProposal).toBeDefined();
  });
});

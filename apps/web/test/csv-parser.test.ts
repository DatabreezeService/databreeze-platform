import { describe, expect, it } from 'vitest';
import { buildDatasetFromTabularData, parseCsvContent } from '../src/features/data/csv-parser.ts';

describe('csv-parser', () => {
  it('parses standard comma-delimited CSV with quoted strings and numbers', () => {
    const csv = `Sản phẩm,Khu vực,Số lượng,Doanh thu
"Cà phê Robusta, đặc biệt",Miền Nam,120,18000000
Trà Ô Long,Miền Bắc,85,18700000
Hạt điều,Miền Trung,240,43200000`;

    const parsed = parseCsvContent('sales.csv', csv);
    expect(parsed.totalRows).toBe(3);
    expect(parsed.headers).toEqual(['Sản phẩm', 'Khu vực', 'Số lượng', 'Doanh thu']);
    expect(parsed.columns[0]?.type).toBe('TEXT');
    expect(parsed.columns[2]?.type).toBe('INTEGER');
    expect(parsed.columns[3]?.type).toBe('INTEGER');
    expect(parsed.rows[0]?.['Sản phẩm']).toBe('Cà phê Robusta, đặc biệt');
    expect(parsed.rows[0]?.['Số lượng']).toBe(120);
    expect(parsed.rows[0]?.['Doanh thu']).toBe(18000000);
  });

  it('detects semicolon delimiters and decimal numbers', () => {
    const csv = `Mã;Tên;Giá;Ngày
SP01;Sữa tươi;32.500;2026-08-10
SP02;Bánh mì;15.000;2026-08-11`;

    const parsed = parseCsvContent('products.csv', csv);
    expect(parsed.totalRows).toBe(2);
    expect(parsed.headers).toEqual(['Mã', 'Tên', 'Giá', 'Ngày']);
    expect(parsed.columns[3]?.type).toBe('DATE');
  });

  it('builds a valid governed DatasetCardV1 from tabular data', () => {
    const csv = `Khu vực,Doanh thu
Miền Nam,100000
Miền Bắc,80000`;

    const parsed = parseCsvContent('doanh-thu.csv', csv);
    const { dataset } = buildDatasetFromTabularData(parsed, 'vi-VN');

    expect(dataset.label).toBe('Doanh thu');
    expect(dataset.status).toBe('PUBLISHED');
    expect(dataset.fieldCount).toBe(2);
    expect(
      typeof dataset.health === 'object' && dataset.health !== null ? dataset.health.tone : '',
    ).toBe('HEALTHY');
    expect(dataset.sources?.[0]?.label).toBe('doanh-thu.csv');
    expect(dataset.preparation?.counts.output).toBe(2);
  });
});

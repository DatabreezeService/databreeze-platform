import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import { filesToDataImportFiles } from '../src/features/data/data-import-api.ts';

async function withFromCharCodeCallLimit<T>(
  maximumCalls: number,
  operation: () => Promise<T>,
): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(String, 'fromCharCode');
  if (!descriptor || typeof descriptor.value !== 'function') {
    throw new Error('String.fromCharCode descriptor unavailable');
  }
  const fromCharCode = descriptor.value as typeof String.fromCharCode;
  let calls = 0;
  Object.defineProperty(String, 'fromCharCode', {
    ...descriptor,
    value: (...codeUnits: number[]) => {
      calls += 1;
      if (calls > maximumCalls) {
        throw new Error('Base64 conversion exceeded the bounded binary-string call budget');
      }
      return Reflect.apply(fromCharCode, String, codeUnits);
    },
  });

  try {
    return await operation();
  } finally {
    Object.defineProperty(String, 'fromCharCode', descriptor);
  }
}

describe('[DDA-002] browser data-import base64 encoding', () => {
  it('preserves exact bytes and file metadata across base64 chunk boundaries', async () => {
    const bytes = Uint8Array.from(
      { length: 96 * 1024 + 5 },
      (_, index) => (index * 31 + 17) & 0xff,
    );

    const result = await filesToDataImportFiles([
      {
        name: 'Bán hàng.CSV',
        type: 'text/csv;charset=utf-8',
        arrayBuffer: () => Promise.resolve(bytes.buffer),
      },
    ]);

    expect(result).toEqual([
      {
        fileName: 'Bán hàng.CSV',
        claimedMediaType: 'text/csv;charset=utf-8',
        declaredEncoding: 'windows-1258',
        contentBase64: Buffer.from(bytes).toString('base64'),
      },
    ]);
  });

  it('encodes a large bounded input without byte-by-byte binary-string calls', async () => {
    const bytes = new Uint8Array(8 * 1024 * 1024 + 2);
    bytes.fill(0xa5);

    const result = await withFromCharCodeCallLimit(1_024, () =>
      filesToDataImportFiles([
        {
          name: 'large.xlsx',
          type: '',
          arrayBuffer: () => Promise.resolve(bytes.buffer),
        },
      ]),
    );

    expect(result).toEqual([
      {
        fileName: 'large.xlsx',
        claimedMediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        contentBase64: Buffer.from(bytes).toString('base64'),
      },
    ]);
  }, 10_000);

  it('declares strict UTF-8 and UTF-8-SIG metadata for valid CSV bytes', async () => {
    const utf8 = new TextEncoder().encode('name,city\nLan,Đà Nẵng\n');
    const utf8WithBom = Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8]);

    const result = await filesToDataImportFiles([
      {
        name: 'utf8.csv',
        type: 'text/csv',
        arrayBuffer: () => Promise.resolve(utf8.buffer),
      },
      {
        name: 'utf8-sig.csv',
        type: 'text/csv',
        arrayBuffer: () => Promise.resolve(utf8WithBom.buffer),
      },
    ]);

    expect(result[0]).toMatchObject({ declaredEncoding: 'utf-8' });
    expect(result[1]).toMatchObject({ declaredEncoding: 'utf-8-sig' });
  });

  it('uses the published Windows-1258 fallback for a non-UTF-8 CSV', async () => {
    const bytes = Uint8Array.from([0x6e, 0x61, 0x6d, 0x65, 0x0a, 0x4c, 0xea, 0x0a]);

    const [result] = await filesToDataImportFiles([
      {
        name: 'legacy.csv',
        type: 'text/csv',
        arrayBuffer: () => Promise.resolve(bytes.buffer),
      },
    ]);

    expect(result).toMatchObject({ declaredEncoding: 'windows-1258' });
  });

  it('omits encoding metadata for XLSX bytes', async () => {
    const bytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04]);

    const [result] = await filesToDataImportFiles([
      {
        name: 'workbook.xlsx',
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        arrayBuffer: () => Promise.resolve(bytes.buffer),
      },
    ]);

    expect(result).not.toHaveProperty('declaredEncoding');
  });
});

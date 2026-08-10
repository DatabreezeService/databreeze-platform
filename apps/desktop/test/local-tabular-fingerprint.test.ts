import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { fingerprintLocalTabularFile } from '../src/application/local-tabular-fingerprint.ts';

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(entries: ReadonlyArray<{ readonly name: string; readonly data: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const compressed = deflateRawSync(entry.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc32(entry.data), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    const localHeaderOffset = offset;
    localParts.push(local, compressed);
    offset += local.length + compressed.length;

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc32(entry.data), 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(localHeaderOffset, 42);
    name.copy(central, 46);
    centralParts.push(central);
  }

  const directory = Buffer.concat(centralParts);
  const directoryOffset = offset;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(directoryOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, directory, end]);
}

describe('DDA-014 local CSV/XLSX fingerprinting', () => {
  it('accepts stable CSV headers and governed XLSX sheet headers', () => {
    const csv = Buffer.from('region,amount\nHN,1000\n', 'utf8');
    const csvResult = fingerprintLocalTabularFile('C:\\Approved\\sales.csv', csv);
    expect(csvResult).toMatchObject({
      accepted: true,
      profile: 'CSV',
      schemaFingerprint: createHash('sha256').update('region,amount').digest('hex'),
    });

    const sheet = Buffer.from(
      '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c t="inlineStr"><is><t>region</t></is></c><c><v>amount</v></c></row></sheetData></worksheet>',
      'utf8',
    );
    // Prefer <v> extraction path used by the profiler.
    const sheetWithValues = Buffer.from(
      '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c><v>region</v></c><c><v>amount</v></c></row></sheetData></worksheet>',
      'utf8',
    );
    const xlsx = zipStore([
      { name: '[Content_Types].xml', data: Buffer.from('<Types/>') },
      { name: 'xl/workbook.xml', data: Buffer.from('<workbook/>') },
      { name: 'xl/worksheets/sheet1.xml', data: sheetWithValues },
    ]);
    void sheet;
    const xlsxResult = fingerprintLocalTabularFile('C:\\Approved\\sales.xlsx', xlsx);
    expect(xlsxResult).toMatchObject({
      accepted: true,
      profile: 'XLSX',
      schemaFingerprint: createHash('sha256').update('region,amount').digest('hex'),
    });
  });

  it('quarantines macro, external-link, and protected workbooks with counted reason codes', () => {
    const macro = zipStore([
      { name: '[Content_Types].xml', data: Buffer.from('<Types/>') },
      { name: 'xl/workbook.xml', data: Buffer.from('<workbook/>') },
      { name: 'xl/vbaProject.bin', data: Buffer.from('macro') },
      {
        name: 'xl/worksheets/sheet1.xml',
        data: Buffer.from(
          '<worksheet><sheetData><row><c><v>a</v></c></row></sheetData></worksheet>',
        ),
      },
    ]);
    expect(fingerprintLocalTabularFile('sales.xlsx', macro)).toEqual({
      rejected: 'MACRO_ENABLED',
    });

    const external = zipStore([
      { name: '[Content_Types].xml', data: Buffer.from('<Types/>') },
      { name: 'xl/workbook.xml', data: Buffer.from('<workbook/>') },
      { name: 'xl/externalLinks/externalLink1.xml', data: Buffer.from('<link/>') },
      {
        name: 'xl/worksheets/sheet1.xml',
        data: Buffer.from(
          '<worksheet><sheetData><row><c><v>a</v></c></row></sheetData></worksheet>',
        ),
      },
    ]);
    expect(fingerprintLocalTabularFile('sales.xlsx', external)).toEqual({
      rejected: 'EXTERNAL_LINK',
    });

    const protectedBook = zipStore([
      { name: 'EncryptionInfo', data: Buffer.from('secret') },
      { name: 'EncryptedPackage', data: Buffer.from('cipher') },
    ]);
    expect(fingerprintLocalTabularFile('sales.xlsx', protectedBook)).toEqual({
      rejected: 'PROTECTED_CONTENT',
    });
  });
});

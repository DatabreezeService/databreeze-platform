import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findMojibake } from './support/user-visible-copy-scanner.ts';

const codePoints = (...points: number[]) => String.fromCodePoint(...points);
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scannedExtensions = new Set(['.css', '.html', '.json', '.ts', '.tsx']);
const scannedRoots = ['src', 'test', 'e2e'];

function collectTextFiles(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return collectTextFiles(path);
    return scannedExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

/** WEB-002, WEB-014, WEB-020 through WEB-024, DDA-033: keep governed Web copy readable. */
describe('user-visible Web copy encoding guard', () => {
  it('finds common UTF-8 mojibake markers and replacement characters', () => {
    const corrupted = [
      `T${codePoints(0x00e1, 0x00bb)}i`,
      `B${codePoints(0x00e1, 0x00ba)}ng`,
      `M${codePoints(0x00c3)}y`,
      `M${codePoints(0x00c4)}y`,
      `M${codePoints(0x00c6)}y`,
      `M${codePoints(0xfffd)}y`,
    ].join(' ');

    expect(findMojibake(corrupted)).toHaveLength(6);
  });

  it('does not flag valid Vietnamese or intentional Unicode punctuation', () => {
    expect(findMojibake('Bảng điều khiển · Đã làm mới… Δ 50 / 50%')).toEqual([]);
  });

  it('keeps mojibake out of user-visible Web source and matching tests', () => {
    const findings = scannedRoots.flatMap((root) =>
      collectTextFiles(resolve(webRoot, root)).flatMap((path) =>
        findMojibake(readFileSync(path, 'utf8')).map(
          (match) => `${relative(webRoot, path)}: ${match}`,
        ),
      ),
    );

    expect(findings).toEqual([]);
  });
});

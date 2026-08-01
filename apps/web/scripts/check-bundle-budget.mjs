import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const budgetBytes = 250 * 1024;
const assetsDirectory = new globalThis.URL('../dist/assets/', import.meta.url);
const javascriptFiles = readdirSync(assetsDirectory).filter((file) => file.endsWith('.js'));
const gzipBytes = javascriptFiles.reduce(
  (total, file) =>
    total + gzipSync(readFileSync(new globalThis.URL(file, assetsDirectory))).byteLength,
  0,
);

if (gzipBytes > budgetBytes) {
  throw new Error(`Initial JavaScript is ${gzipBytes} gzip bytes; budget is ${budgetBytes}.`);
}

console.log(`Initial JavaScript budget: ${gzipBytes}/${budgetBytes} gzip bytes.`);

import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

// 2026-08: raised 250→268 KiB for the Dữ liệu workspace redesign (project tree,
// cleaning agent dock, deterministic cleaning engine) — all route-lazy, so the
// first-paint entry chunk is unaffected; this gate still caps total app JS.
const budgetBytes = 268 * 1024;
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

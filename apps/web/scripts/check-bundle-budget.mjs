import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

// Count the entry module and Vite's explicit modulepreload dependencies only.
// Route-lazy chunks are intentionally excluded: they are downloaded when the
// user opens that route, not during the first paint. This keeps the guard tied
// to the performance claim it reports instead of treating the whole app as an
// initial payload.
const budgetBytes = 310 * 1024;
const distDirectory = new globalThis.URL('../dist/', import.meta.url);
const assetsDirectory = new globalThis.URL('assets/', distDirectory);
const indexHtml = readFileSync(new globalThis.URL('index.html', distDirectory), 'utf8');
const javascriptFiles = [
  ...indexHtml.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/gu),
  ...indexHtml.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/gu),
].map((match) => {
  const assetPath = match[1];
  if (assetPath === undefined || !assetPath.startsWith('/assets/')) {
    throw new Error('Bundle entry references an unexpected JavaScript asset.');
  }
  return assetPath.slice('/assets/'.length);
});
if (javascriptFiles.length === 0) {
  throw new Error('Bundle entry did not expose a module or modulepreload asset.');
}
const gzipBytes = javascriptFiles.reduce(
  (total, file) =>
    total + gzipSync(readFileSync(new globalThis.URL(file, assetsDirectory))).byteLength,
  0,
);

if (gzipBytes > budgetBytes) {
  throw new Error(`Initial JavaScript is ${gzipBytes} gzip bytes; budget is ${budgetBytes}.`);
}

console.log(`Initial JavaScript budget: ${gzipBytes}/${budgetBytes} gzip bytes.`);

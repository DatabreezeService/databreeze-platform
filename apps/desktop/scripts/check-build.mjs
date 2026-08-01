import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const desktopDirectory = path.resolve(import.meta.dirname, '..');
const outputDirectory = path.join(desktopDirectory, 'dist');
const requiredOutputs = ['main/index.js', 'preload/index.cjs', 'renderer/index.html'];
for (const relativePath of requiredOutputs) {
  assert.equal(
    existsSync(path.join(outputDirectory, relativePath)),
    true,
    `Missing ${relativePath}`,
  );
}

function filesWithin(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

const outputFiles = filesWithin(outputDirectory);
assert.equal(
  outputFiles.some((filePath) => filePath.endsWith('.map')),
  false,
  'Source map leaked',
);

const rendererHtml = readFileSync(path.join(outputDirectory, 'renderer/index.html'), 'utf8');
assert.match(rendererHtml, /Content-Security-Policy/);
assert.doesNotMatch(rendererHtml, /unsafe-inline|unsafe-eval|https?:/);

const rendererAssets = outputFiles.filter((filePath) =>
  filePath.includes(`${path.sep}renderer${path.sep}assets${path.sep}`),
);
const rendererJavaScript = rendererAssets.filter((filePath) => filePath.endsWith('.js'));
assert.ok(rendererJavaScript.length > 0, 'Renderer JavaScript output missing');
const gzipBytes = rendererJavaScript.reduce(
  (total, filePath) => total + gzipSync(readFileSync(filePath)).byteLength,
  0,
);
const budgetBytes = 180 * 1024;
assert.ok(gzipBytes <= budgetBytes, `Renderer JavaScript ${gzipBytes} exceeds ${budgetBytes}`);

const approvedWordmark = path.resolve(
  desktopDirectory,
  '../../packages/design-tokens/brand/generated/web/navigation-wordmark-blue-204x50.png',
);
const approvedHash = createHash('sha256').update(readFileSync(approvedWordmark)).digest('hex');
assert.ok(
  rendererAssets
    .filter((filePath) => filePath.endsWith('.png'))
    .some(
      (filePath) =>
        createHash('sha256').update(readFileSync(filePath)).digest('hex') === approvedHash,
    ),
  'Approved DataBreeze wordmark was not emitted unchanged',
);

console.log(`Desktop renderer JavaScript gzip: ${gzipBytes}/${budgetBytes} bytes.`);

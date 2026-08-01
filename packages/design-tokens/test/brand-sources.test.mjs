import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { URL } from 'node:url';

const brandDirectory = new URL('../brand/', import.meta.url);
const sourceDirectory = new URL('source/', brandDirectory);
const manifestUrl = new URL('manifest.json', brandDirectory);

const approvedAssets = [
  {
    file: 'databreeze-mark-dark.png',
    height: 1973,
    intendedUse: 'Standalone application and product mark on dark backgrounds',
    mediaType: 'image/png',
    sha256: '5EE10842AD090F2BB980B51DDCF8BB4F8738C87B9659BE10387FE0B2D845B7A4',
    width: 1974,
  },
  {
    file: 'databreeze-wordmark-black.png',
    height: 1155,
    intendedUse: 'Monochrome DataBreeze wordmark on light backgrounds',
    mediaType: 'image/png',
    sha256: '4F37835E9648E7035DE9BCB6ADA05C1203A1C05A1D0DB81DF1D1AEA01D46FC98',
    width: 4710,
  },
  {
    file: 'databreeze-wordmark-blue.png',
    height: 1155,
    intendedUse: 'Primary DataBreeze wordmark on light backgrounds',
    mediaType: 'image/png',
    sha256: 'B2BB9353A2E2C42DAC8F68EC5BC30A9EB366F3C8139A46D4FDEC686264590D3D',
    width: 4710,
  },
];

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

async function readManifest() {
  return JSON.parse(await readFile(manifestUrl, 'utf8'));
}

test('the manifest records the complete approved immutable source set', async () => {
  const manifest = await readManifest();

  assert.deepEqual(manifest, {
    schemaVersion: 1,
    assets: approvedAssets,
  });
});

test('the source directory contains only the three canonical named PNGs', async () => {
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  const sourceFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(sourceFiles, approvedAssets.map(({ file }) => file).sort());
});

for (const asset of approvedAssets) {
  test(`${asset.file} retains its approved bytes and PNG dimensions`, async () => {
    const bytes = await readFile(new URL(asset.file, sourceDirectory));

    assert.deepEqual(bytes.subarray(0, pngSignature.length), pngSignature);
    assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR');
    assert.equal(bytes.readUInt32BE(16), asset.width);
    assert.equal(bytes.readUInt32BE(20), asset.height);
    assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(), asset.sha256);
  });
}

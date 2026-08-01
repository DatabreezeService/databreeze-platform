import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const execFileAsync = promisify(execFile);
const packageDirectory = fileURLToPath(new URL('../', import.meta.url));
const generatorPath = join(packageDirectory, 'scripts', 'generate-brand-derivatives.mjs');
const brandDirectory = join(packageDirectory, 'brand');
const committedOutputDirectory = join(brandDirectory, 'generated');
const committedManifestPath = join(brandDirectory, 'derivatives.json');
const goldenPath = join(packageDirectory, 'test', 'fixtures', 'brand-visual-golden.json');

const expectedInventory = [
  ['android/adaptive-foreground-432.png', 432, 432],
  ['android/launcher-hdpi-72.png', 72, 72],
  ['android/launcher-mdpi-48.png', 48, 48],
  ['android/launcher-xhdpi-96.png', 96, 96],
  ['android/launcher-xxhdpi-144.png', 144, 144],
  ['android/launcher-xxxhdpi-192.png', 192, 192],
  ['android/notification-hdpi-36.png', 36, 36],
  ['android/notification-mdpi-24.png', 24, 24],
  ['android/notification-xhdpi-48.png', 48, 48],
  ['android/notification-xxhdpi-72.png', 72, 72],
  ['android/notification-xxxhdpi-96.png', 96, 96],
  ['desktop/application-256.png', 256, 256],
  ['desktop/application.ico', 256, 256],
  ['desktop/installer.ico', 256, 256],
  ['desktop/notification-32.png', 32, 32],
  ['desktop/updater.ico', 256, 256],
  ['web/apple-touch-icon-180.png', 180, 180],
  ['web/favicon-16.png', 16, 16],
  ['web/favicon-32.png', 32, 32],
  ['web/install-icon-192.png', 192, 192],
  ['web/install-icon-512.png', 512, 512],
  ['web/navigation-wordmark-black-204x50.png', 204, 50],
  ['web/navigation-wordmark-blue-204x50.png', 204, 50],
  ['web/social-card-1200x630.png', 1200, 630],
];

function runGenerator(args) {
  return execFileAsync(process.execPath, [generatorPath, ...args], {
    cwd: packageDirectory,
    encoding: 'utf8',
  });
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseIco(bytes) {
  assert.equal(bytes.readUInt16LE(0), 0);
  assert.equal(bytes.readUInt16LE(2), 1);
  const count = bytes.readUInt16LE(4);
  const frames = [];
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    const width = bytes.readUInt8(entry) || 256;
    const height = bytes.readUInt8(entry + 1) || 256;
    const length = bytes.readUInt32LE(entry + 8);
    const offset = bytes.readUInt32LE(entry + 12);
    frames.push({ bytes: bytes.subarray(offset, offset + length), height, width });
  }
  return frames;
}

test('a clean output directory receives the complete deterministic platform inventory', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'databreeze-brand-derivatives-'));
  const outputDirectory = join(temporaryRoot, 'generated');
  const manifestPath = join(temporaryRoot, 'derivatives.json');

  try {
    await runGenerator(['--output', outputDirectory, '--manifest', manifestPath]);

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const actual = manifest.assets.map(({ file, height, width }) => [file, width, height]);
    assert.deepEqual(actual, expectedInventory);

    const platformDirectories = await readdir(outputDirectory);
    assert.deepEqual(platformDirectories.sort(), ['android', 'desktop', 'web']);
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});

test('committed derivatives reproduce byte-for-byte and a changed output is detected as drift', async () => {
  const module = await import('../scripts/generate-brand-derivatives.mjs');
  assert.equal(typeof module.compareBrandDerivatives, 'function');

  await module.compareBrandDerivatives({
    expectedManifestPath: committedManifestPath,
    expectedOutputDirectory: committedOutputDirectory,
  });

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'databreeze-brand-drift-'));
  try {
    const outputDirectory = join(temporaryRoot, 'generated');
    const manifestPath = join(temporaryRoot, 'derivatives.json');
    await runGenerator(['--output', outputDirectory, '--manifest', manifestPath]);
    const faviconPath = join(outputDirectory, 'web', 'favicon-16.png');
    const changed = Buffer.from(await readFile(faviconPath));
    changed[changed.length - 1] ^= 0xff;
    await import('node:fs/promises').then(({ writeFile }) => writeFile(faviconPath, changed));

    await assert.rejects(
      module.compareBrandDerivatives({
        expectedManifestPath: manifestPath,
        expectedOutputDirectory: outputDirectory,
      }),
      /Brand derivative drift detected: web\/favicon-16\.png/,
    );
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});

test('the derivative manifest links every output to an approved source and records safe fitted geometry', async () => {
  const [manifest, sourceManifest] = await Promise.all([
    readFile(committedManifestPath, 'utf8').then(JSON.parse),
    readFile(join(brandDirectory, 'manifest.json'), 'utf8').then(JSON.parse),
  ]);
  const approved = new Map(sourceManifest.assets.map((source) => [source.file, source]));

  assert.equal(
    manifest.sourceManifestSha256,
    hash(await readFile(join(brandDirectory, 'manifest.json'))),
  );
  for (const asset of manifest.assets) {
    const source = approved.get(asset.source.file);
    assert.ok(source, `${asset.file} must use an approved source`);
    assert.equal(asset.source.sha256, source.sha256);
    assert.equal(asset.transform, 'aspect-preserving-contain');
    assert.ok(asset.safeZone.length > 0);
    assert.ok(asset.fittedBox.x >= asset.contentBox.x);
    assert.ok(asset.fittedBox.y >= asset.contentBox.y);
    assert.ok(
      asset.fittedBox.x + asset.fittedBox.width <= asset.contentBox.x + asset.contentBox.width,
    );
    assert.ok(
      asset.fittedBox.y + asset.fittedBox.height <= asset.contentBox.y + asset.contentBox.height,
    );

    const sourceWidth = asset.source.crop?.width ?? source.width;
    const sourceHeight = asset.source.crop?.height ?? source.height;
    const sourceAspect = sourceWidth / sourceHeight;
    const fittedAspectError =
      sourceAspect >= asset.contentBox.width / asset.contentBox.height
        ? Math.abs(asset.fittedBox.height - asset.fittedBox.width / sourceAspect)
        : Math.abs(asset.fittedBox.width - asset.fittedBox.height * sourceAspect);
    assert.ok(fittedAspectError <= 0.5, `${asset.file} must preserve the source aspect ratio`);
  }
});

test('PNG and ICO outputs have declared dimensions, transparent clear space, and preserved brand colors', async () => {
  const [{ default: sharp }, manifest] = await Promise.all([
    import('sharp'),
    readFile(committedManifestPath, 'utf8').then(JSON.parse),
  ]);
  const sourceColors = {
    'databreeze-mark-dark.png': [
      [4, 9, 32],
      [52, 78, 248],
    ],
    'databreeze-wordmark-black.png': [[0, 0, 0]],
    'databreeze-wordmark-blue.png': [[52, 78, 248]],
  };

  for (const asset of manifest.assets) {
    const bytes = await readFile(join(committedOutputDirectory, asset.file));
    assert.equal(hash(bytes), asset.sha256);
    const pngs =
      asset.mediaType === 'image/x-icon'
        ? parseIco(bytes)
        : [{ bytes, width: asset.width, height: asset.height }];

    if (asset.frames)
      assert.deepEqual(
        pngs.map(({ width }) => width),
        asset.frames,
      );
    for (const frame of pngs) {
      if (asset.frames) assert.equal(frame.width, frame.height);
      assert.deepEqual(frame.bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const { data, info } = await sharp(frame.bytes)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.equal(info.width, frame.width);
      assert.equal(info.height, frame.height);

      let transparentPixelFound = false;
      const visibleColors = new Set();
      for (let offset = 0; offset < data.length; offset += 4) {
        if (data[offset + 3] === 0) transparentPixelFound = true;
        if (data[offset + 3] > 0)
          visibleColors.add(`${data[offset]},${data[offset + 1]},${data[offset + 2]}`);
      }
      assert.ok(transparentPixelFound, `${asset.file} must retain transparent clear space`);
      assert.ok(
        sourceColors[asset.source.file].some((color) => visibleColors.has(color.join(','))),
        `${asset.file} must retain an approved source color`,
      );
    }
  }
});

test('visual signatures match the separately approved golden fixture', async () => {
  const [manifest, golden] = await Promise.all([
    readFile(committedManifestPath, 'utf8').then(JSON.parse),
    readFile(goldenPath, 'utf8').then(JSON.parse),
  ]);
  assert.deepEqual(
    Object.fromEntries(manifest.assets.map((asset) => [asset.file, asset.visualSha256])),
    golden.assets,
  );
});

test('plan validation blocks unsafe paths, invalid safe zones, and duplicate wordmark text policy', async () => {
  const { validateDerivativePlan } = await import('../scripts/generate-brand-derivatives.mjs');
  const plan = JSON.parse(await readFile(join(brandDirectory, 'derivative-plan.json'), 'utf8'));

  const traversal = cloneJson(plan);
  traversal.assets[0].file = '../source/changed.png';
  assert.throws(() => validateDerivativePlan(traversal), /Unsafe derivative output path/);

  const unsafeGeometry = cloneJson(plan);
  unsafeGeometry.assets[0].contentBox.width = unsafeGeometry.assets[0].width;
  assert.throws(() => validateDerivativePlan(unsafeGeometry), /Content box exceeds output bounds/);

  const duplicateText = cloneJson(plan);
  const wordmark = duplicateText.assets.find((asset) => asset.containsWordmark);
  wordmark.adjacentProductNamePolicy = 'allowed';
  assert.throws(
    () => validateDerivativePlan(duplicateText),
    /must forbid adjacent duplicate product text/,
  );
});

test('output target validation prevents any generated write beneath immutable sources', async () => {
  const { validateOutputTargets } = await import('../scripts/generate-brand-derivatives.mjs');
  assert.equal(typeof validateOutputTargets, 'function');
  assert.throws(
    () =>
      validateOutputTargets({
        manifestPath: join(brandDirectory, 'source', 'derivatives.json'),
        outputDirectory: join(brandDirectory, 'generated'),
      }),
    /must not contain or overwrite immutable brand sources/,
  );
});

test('the source hash gate rejects bytes that are not the approved canonical asset', async () => {
  const { assertApprovedSourceBytes } = await import('../scripts/generate-brand-derivatives.mjs');
  assert.equal(typeof assertApprovedSourceBytes, 'function');
  assert.throws(
    () =>
      assertApprovedSourceBytes({
        approvedSha256: 'A'.repeat(64),
        bytes: Buffer.from('changed source'),
        file: 'databreeze-wordmark-blue.png',
      }),
    /Approved source checksum mismatch: databreeze-wordmark-blue\.png/,
  );
});

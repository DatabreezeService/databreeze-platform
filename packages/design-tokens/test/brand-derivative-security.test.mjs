import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const packageDirectory = fileURLToPath(new URL('../', import.meta.url));
const brandDirectory = join(packageDirectory, 'brand');
const sourceDirectory = join(brandDirectory, 'source');
const committedOutputDirectory = join(brandDirectory, 'generated');
const committedManifestPath = join(brandDirectory, 'derivatives.json');

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadValidationInputs() {
  const [plan, sourceManifest] = await Promise.all([
    readFile(join(brandDirectory, 'derivative-plan.json'), 'utf8').then(JSON.parse),
    readFile(join(brandDirectory, 'manifest.json'), 'utf8').then(JSON.parse),
  ]);
  return { plan, sourceManifest };
}

test('the derivative plan is a closed, typed, complete portable contract', async (context) => {
  const { validateDerivativePlan } = await import('../scripts/generate-brand-derivatives.mjs');
  const { plan, sourceManifest } = await loadValidationInputs();

  const mutations = [
    ['unknown root key', (value) => (value.unexpected = true), /unknown key/i],
    ['unknown pipeline key', (value) => (value.pipeline.unexpected = true), /unknown key/i],
    ['wrong libvips runtime', (value) => (value.pipeline.libvipsVersion = '0.0.0'), /libvips/i],
    ['wrong PNG runtime', (value) => (value.pipeline.pngVersion = '0.0.0'), /PNG/i],
    ['empty asset inventory', (value) => (value.assets = []), /complete.*inventory/i],
    ['missing required asset', (value) => value.assets.pop(), /complete.*inventory/i],
    ['backslash path', (value) => (value.assets[0].file = 'android\\icon.png'), /portable.*path/i],
    [
      'dot path segment',
      (value) => (value.assets[0].file = 'android/./icon.png'),
      /portable.*path/i,
    ],
    [
      'case-folded duplicate path',
      (value) => (value.assets[1].file = value.assets[0].file.toUpperCase()),
      /duplicate.*path/i,
    ],
    [
      'unknown source key',
      (value) => (value.sources.extra = value.sources.blueMark),
      /source keys/i,
    ],
    ['unknown source field', (value) => (value.sources.blueMark.extra = true), /unknown key/i],
    [
      'out-of-bounds source crop',
      (value) => (value.sources.blueMark.crop.width = 99999),
      /crop.*bounds/i,
    ],
    ['unknown asset field', (value) => (value.assets[0].extra = true), /unknown key/i],
    ['non-object asset', (value) => (value.assets[0] = null), /asset.*object/i],
    ['invalid platform', (value) => (value.assets[0].platform = 'ios'), /platform/i],
    ['empty purpose', (value) => (value.assets[0].purpose = ''), /purpose/i],
    ['empty safe zone', (value) => (value.assets[0].safeZone = ''), /safeZone/i],
    [
      'wrong transform policy',
      (value) => (value.pipeline.pixelPolicy = 'stretch'),
      /pixel policy|transform/i,
    ],
    [
      'unordered ICO frames',
      (value) => (value.assets.find((asset) => asset.frames).frames = [16, 32, 24]),
      /frames.*ascending/i,
    ],
    [
      'duplicate ICO frames',
      (value) => (value.assets.find((asset) => asset.frames).frames = [16, 16, 32]),
      /frames.*ascending/i,
    ],
    [
      'oversized ICO frame',
      (value) => (value.assets.find((asset) => asset.frames).frames = [16, 257]),
      /frame.*256/i,
    ],
  ];

  for (const [name, mutate, expected] of mutations) {
    await context.test(name, () => {
      const changed = cloneJson(plan);
      mutate(changed);
      assert.throws(() => validateDerivativePlan(changed, { sourceManifest }), expected);
    });
  }
});

test('manifest provenance pins the loaded Sharp libvips and PNG runtimes', async () => {
  const [{ default: sharp }, manifest] = await Promise.all([
    import('sharp'),
    readFile(committedManifestPath, 'utf8').then(JSON.parse),
  ]);
  assert.deepEqual(manifest.generator.runtime, {
    libvips: sharp.versions.vips,
    png: sharp.versions.png,
    sharp: sharp.versions.sharp,
  });
});

test('filesystem-aware target validation rejects linked ancestry and output/manifest collisions', async () => {
  const { validateOutputTargets } = await import('../scripts/generate-brand-derivatives.mjs');
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'databreeze-brand-targets-'));
  try {
    const linkPath = join(temporaryRoot, 'linked-source');
    await symlink(sourceDirectory, linkPath, process.platform === 'win32' ? 'junction' : 'dir');

    await assert.rejects(
      validateOutputTargets({
        assetFiles: [],
        manifestPath: join(temporaryRoot, 'derivatives.json'),
        outputDirectory: join(linkPath, 'generated'),
      }),
      /symbolic link|junction|reparse/i,
    );

    await assert.rejects(
      validateOutputTargets({
        assetFiles: [],
        manifestPath: join(temporaryRoot, 'generated', 'derivatives.json'),
        outputDirectory: join(temporaryRoot, 'generated'),
      }),
      /manifest.*output/i,
    );

    await assert.rejects(
      validateOutputTargets({
        assetFiles: ['web/favicon-16.png'],
        manifestPath: join(temporaryRoot, 'generated', 'web', 'favicon-16.png'),
        outputDirectory: join(temporaryRoot, 'generated'),
      }),
      /manifest.*generated asset/i,
    );
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});

test('generation refuses a junction output ancestor before writing through it', async () => {
  const { generateBrandDerivatives } = await import('../scripts/generate-brand-derivatives.mjs');
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'databreeze-brand-write-link-'));
  try {
    const externalTarget = join(temporaryRoot, 'external');
    const linkPath = join(temporaryRoot, 'linked');
    await mkdir(externalTarget);
    await symlink(externalTarget, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(
      generateBrandDerivatives({
        manifestPath: join(temporaryRoot, 'derivatives.json'),
        outputDirectory: join(linkPath, 'generated'),
      }),
      /symbolic link|junction|reparse/i,
    );
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});

test('drift comparison rejects extra empty directories', async () => {
  const { compareBrandDerivatives, generateBrandDerivatives } = await import(
    '../scripts/generate-brand-derivatives.mjs'
  );
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'databreeze-brand-empty-dir-'));
  try {
    const outputDirectory = join(temporaryRoot, 'generated');
    const manifestPath = join(temporaryRoot, 'derivatives.json');
    await generateBrandDerivatives({ manifestPath, outputDirectory });
    await mkdir(join(outputDirectory, 'unexpected-empty'));
    await assert.rejects(
      compareBrandDerivatives({
        expectedManifestPath: manifestPath,
        expectedOutputDirectory: outputDirectory,
      }),
      /inventory drift/i,
    );
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});

test('ICO validation rejects malformed headers, directory entries, offsets, and trailing bytes', async () => {
  const { parseAndValidateIco } = await import('../scripts/generate-brand-derivatives.mjs');
  assert.equal(typeof parseAndValidateIco, 'function');
  const original = await readFile(join(committedOutputDirectory, 'desktop', 'application.ico'));
  const mutate = (callback) => {
    const bytes = Buffer.from(original);
    callback(bytes);
    return bytes;
  };

  const cases = [
    ['reserved header', mutate((bytes) => bytes.writeUInt16LE(1, 0))],
    ['icon type', mutate((bytes) => bytes.writeUInt16LE(2, 2))],
    ['reserved entry', mutate((bytes) => bytes.writeUInt8(1, 9))],
    ['planes', mutate((bytes) => bytes.writeUInt16LE(2, 10))],
    ['bit depth', mutate((bytes) => bytes.writeUInt16LE(24, 12))],
    ['overlapping offset', mutate((bytes) => bytes.writeUInt32LE(6, 18))],
    ['out-of-bounds length', mutate((bytes) => bytes.writeUInt32LE(0xffffffff, 14))],
    ['trailing bytes', Buffer.concat([original, Buffer.from([0])])],
  ];
  for (const [name, bytes] of cases) {
    assert.throws(
      () => parseAndValidateIco(bytes, [16, 24, 32, 48, 64, 128, 256]),
      undefined,
      name,
    );
  }
});

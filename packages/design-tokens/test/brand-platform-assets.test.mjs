import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import sharp from 'sharp';

const packageDirectory = fileURLToPath(new URL('../', import.meta.url));
const brandDirectory = join(packageDirectory, 'brand');
const outputDirectory = join(brandDirectory, 'generated');
const planPath = join(brandDirectory, 'derivative-plan.json');
const manifestPath = join(brandDirectory, 'derivatives.json');
const sourcePath = join(brandDirectory, 'source', 'databreeze-wordmark-blue.png');

async function rgba(file) {
  return sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function visibleBounds(data, width, height) {
  const bounds = { maxX: -1, maxY: -1, minX: width, minY: height };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  return bounds;
}

function foregroundBounds(data, width, height, background) {
  const bounds = { maxX: -1, maxY: -1, minX: width, minY: height };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (
        data[offset] === background[0] &&
        data[offset + 1] === background[1] &&
        data[offset + 2] === background[2] &&
        data[offset + 3] === background[3]
      ) {
        continue;
      }
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  return bounds;
}

function linearChannel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function contrast(left, right) {
  const luminance = (color) =>
    0.2126 * linearChannel(color[0]) +
    0.7152 * linearChannel(color[1]) +
    0.0722 * linearChannel(color[2]);
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('navigation wordmarks have documented transparent clear space on every edge', async () => {
  const [plan, manifest] = await Promise.all([
    readFile(planPath, 'utf8').then(JSON.parse),
    readFile(manifestPath, 'utf8').then(JSON.parse),
  ]);
  for (const name of ['black', 'blue']) {
    const file = `web/navigation-wordmark-${name}-204x50.png`;
    const assetPlan = plan.assets.find((asset) => asset.file === file);
    const assetManifest = manifest.assets.find((asset) => asset.file === file);
    const { data, info } = await rgba(join(outputDirectory, file));
    const bounds = visibleBounds(data, info.width, info.height);
    assert.deepEqual(assetPlan.contentBox, { x: 10, y: 5, width: 184, height: 40 });
    assert.equal(assetPlan.safeZone, 'minimum-5px-vertical-and-20px-fitted-horizontal');
    assert.ok(bounds.minX >= 20 && bounds.minY >= 5, `${file} leading clear space`);
    assert.ok(bounds.maxX <= 183 && bounds.maxY <= 44, `${file} trailing clear space`);
    assert.deepEqual(assetManifest.visibleBounds, bounds);
  }
});

test('Android notification sources are white alpha masks with exact approved-mark geometry', async () => {
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  const source = plan.sources.blueMark;
  for (const asset of plan.assets.filter((candidate) =>
    candidate.file.startsWith('android/notification-'),
  )) {
    assert.equal(asset.outputMode, 'android-alpha-mask');
    let reference = sharp(sourcePath)
      .extract(source.crop)
      .resize({
        width: asset.contentBox.width,
        height: asset.contentBox.height,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: sharp.kernel.lanczos3,
      });
    const resized = await reference.png().toBuffer();
    const referenceCanvas = await sharp({
      create: {
        width: asset.width,
        height: asset.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: resized, left: asset.contentBox.x, top: asset.contentBox.y }])
      .ensureAlpha()
      .raw()
      .toBuffer();
    const { data: mask, info } = await rgba(join(outputDirectory, asset.file));
    assert.equal(mask.length, referenceCanvas.length);
    for (let offset = 0; offset < mask.length; offset += 4) {
      assert.equal(mask[offset + 3], referenceCanvas[offset + 3], `${asset.file} alpha geometry`);
      if (mask[offset + 3] > 0) {
        assert.deepEqual([...mask.subarray(offset, offset + 3)], [255, 255, 255]);
      }
    }
    assert.equal(info.width, asset.width);
    assert.equal(info.height, asset.height);
  }
});

test('social metadata uses the approved opaque dark background and unchanged blue wordmark', async () => {
  const [plan, manifest, { data, info }] = await Promise.all([
    readFile(planPath, 'utf8').then(JSON.parse),
    readFile(manifestPath, 'utf8').then(JSON.parse),
    rgba(join(outputDirectory, 'web', 'social-card-1200x630.png')),
  ]);
  const assetPlan = plan.assets.find((asset) => asset.file === 'web/social-card-1200x630.png');
  const assetManifest = manifest.assets.find(
    (asset) => asset.file === 'web/social-card-1200x630.png',
  );
  assert.deepEqual(assetPlan.backgroundColor, { red: 4, green: 9, blue: 32, alpha: 1 });
  assert.deepEqual(assetManifest.backgroundColor, assetPlan.backgroundColor);
  let blueFound = false;
  for (let offset = 0; offset < data.length; offset += 4) {
    assert.equal(data[offset + 3], 255, 'social image must be fully opaque');
    if (data[offset] === 52 && data[offset + 1] === 78 && data[offset + 2] === 248) {
      blueFound = true;
    }
  }
  assert.deepEqual([...data.subarray(0, 4)], [4, 9, 32, 255]);
  assert.ok(blueFound, 'social image must retain exact approved blue pixels');
  assert.ok(contrast([52, 78, 248], [4, 9, 32]) >= 3);
  const bounds = foregroundBounds(data, info.width, info.height, [4, 9, 32, 255]);
  assert.deepEqual(assetManifest.visibleBounds, bounds);
  assert.ok(bounds.minX >= 120 && bounds.maxX < info.width - 120);
  assert.ok(bounds.minY >= 126 && bounds.maxY < info.height - 126);
});

test('visual approval provenance is explicit and independently anchored to approved source hashes', async () => {
  const [plan, manifest, golden] = await Promise.all([
    readFile(planPath, 'utf8').then(JSON.parse),
    readFile(manifestPath, 'utf8').then(JSON.parse),
    readFile(join(packageDirectory, 'test', 'fixtures', 'brand-visual-golden.json'), 'utf8').then(
      JSON.parse,
    ),
  ]);
  const expected = {
    status: 'plan-approved',
    reviewedOn: '2026-08-01',
    reviewSource: 'approved Task 11 plan and DataBreeze brand specification',
    specReference: 'docs/product/brand-and-experience.md#1-brand-continuity',
    taskReference:
      'docs/plans/010-engineering-foundation.md#task-11-reproducible-brand-derivatives',
    cropRationale:
      'The blue mark is the left 1155x1155 square of the approved blue wordmark; cropping removes only the adjacent DataBreeze letters and does not redraw geometry.',
    sourceHashes: {
      'databreeze-mark-dark.png':
        '5EE10842AD090F2BB980B51DDCF8BB4F8738C87B9659BE10387FE0B2D845B7A4',
      'databreeze-wordmark-black.png':
        '4F37835E9648E7035DE9BCB6ADA05C1203A1C05A1D0DB81DF1D1AEA01D46FC98',
      'databreeze-wordmark-blue.png':
        'B2BB9353A2E2C42DAC8F68EC5BC30A9EB366F3C8139A46D4FDEC686264590D3D',
    },
  };
  assert.deepEqual(plan.approval, expected);
  assert.deepEqual(manifest.approval, expected);
  assert.deepEqual(golden.approval, {
    status: expected.status,
    reviewedOn: expected.reviewedOn,
    reviewSource: expected.reviewSource,
    specReference: expected.specReference,
    taskReference: expected.taskReference,
  });
});

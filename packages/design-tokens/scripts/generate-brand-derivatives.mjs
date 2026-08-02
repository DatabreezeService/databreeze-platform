import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import sharp from 'sharp';

const packageDirectory = fileURLToPath(new URL('../', import.meta.url));
const brandDirectory = join(packageDirectory, 'brand');
const sourceDirectory = join(brandDirectory, 'source');
const sourceManifestPath = join(brandDirectory, 'manifest.json');
const planPath = join(brandDirectory, 'derivative-plan.json');
const defaultOutputDirectory = join(brandDirectory, 'generated');
const defaultManifestPath = join(brandDirectory, 'derivatives.json');

const PIXEL_POLICY =
  'sRGB brand colors are preserved; allowed operations are approved cropping, aspect-preserving contain resize, transparent padding, approved-source-color background compositing, Android alpha-mask extraction, and PNG/ICO container conversion';
const APPROVAL_METADATA = {
  cropRationale:
    'The blue mark is the left 1155x1155 square of the approved blue wordmark; cropping removes only the adjacent DataBreeze letters and does not redraw geometry.',
  reviewSource: 'approved Task 11 plan and DataBreeze brand specification',
  reviewedOn: '2026-08-01',
  specReference: 'docs/product/brand-and-experience.md#1-brand-continuity',
  status: 'plan-approved',
  taskReference: 'docs/plans/010-engineering-foundation.md#task-11-reproducible-brand-derivatives',
};
const REQUIRED_SOURCE_DEFINITIONS = {
  blackWordmark: { file: 'databreeze-wordmark-black.png' },
  blueMark: {
    crop: { height: 1155, left: 0, top: 0, width: 1155 },
    file: 'databreeze-wordmark-blue.png',
  },
  blueWordmark: { file: 'databreeze-wordmark-blue.png' },
  darkMark: { file: 'databreeze-mark-dark.png' },
};
const REQUIRED_ASSET_FILES = [
  'android/adaptive-foreground-432.png',
  'android/launcher-hdpi-72.png',
  'android/launcher-mdpi-48.png',
  'android/launcher-xhdpi-96.png',
  'android/launcher-xxhdpi-144.png',
  'android/launcher-xxxhdpi-192.png',
  'android/notification-hdpi-36.png',
  'android/notification-mdpi-24.png',
  'android/notification-xhdpi-48.png',
  'android/notification-xxhdpi-72.png',
  'android/notification-xxxhdpi-96.png',
  'desktop/application-256.png',
  'desktop/application.ico',
  'desktop/installer.ico',
  'desktop/notification-32.png',
  'desktop/updater.ico',
  'web/apple-touch-icon-180.png',
  'web/favicon-16.png',
  'web/favicon-32.png',
  'web/install-icon-192.png',
  'web/install-icon-512.png',
  'web/navigation-wordmark-black-204x50.png',
  'web/navigation-wordmark-blue-204x50.png',
  'web/social-card-1200x630.png',
];
const PLATFORM_VALUES = new Set(['android', 'desktop', 'web']);
const ADJACENT_NAME_POLICIES = new Set(['accessible-context-only', 'forbidden']);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

sharp.cache(false);
sharp.concurrency(1);
sharp.simd(false);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

export function assertApprovedSourceBytes({ approvedSha256, bytes, file }) {
  if (sha256(bytes) !== approvedSha256) {
    throw new Error(`Approved source checksum mismatch: ${file}`);
  }
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isWithin(parent, child) {
  const pathFromParent = relative(resolve(parent), resolve(child));
  return (
    pathFromParent === '' || (!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== '..')
  );
}

function assertInteger(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer greater than or equal to ${minimum}`);
  }
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  assertPlainObject(value, label);
  const expected = [...expectedKeys].sort();
  const actual = Object.keys(value).sort();
  const unknown = actual.filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !actual.includes(key));
  if (unknown.length > 0) throw new Error(`${label} has unknown key "${unknown[0]}"`);
  if (missing.length > 0) throw new Error(`${label} is missing key "${missing[0]}"`);
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new Error(`${label} must be a non-empty trimmed string`);
  }
}

function assertPortableAssetPath(file) {
  if (typeof file !== 'string' || isAbsolute(file) || /^[A-Za-z]:/u.test(file)) {
    throw new Error(`Derivative file must be a portable relative path: ${String(file)}`);
  }
  if (file.includes('\\')) {
    throw new Error(`Derivative file must be a portable POSIX path: ${file}`);
  }
  const segments = file.split('/');
  if (
    segments.length < 2 ||
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        !/^[A-Za-z0-9._-]+$/u.test(segment),
    )
  ) {
    throw new Error(`Derivative file must be a portable normalized path: ${file}`);
  }
}

function approvedSourceMap(sourceManifest) {
  assertExactKeys(sourceManifest, ['assets', 'schemaVersion'], 'source manifest');
  if (sourceManifest.schemaVersion !== 1 || !Array.isArray(sourceManifest.assets)) {
    throw new Error('Unsupported source manifest');
  }
  return new Map(sourceManifest.assets.map((asset) => [asset.file, asset]));
}

function validatePipeline(pipeline) {
  assertExactKeys(
    pipeline,
    ['engine', 'engineVersion', 'libvipsVersion', 'pixelPolicy', 'png', 'pngVersion'],
    'pipeline',
  );
  if (pipeline.engine !== 'sharp') throw new Error('Unsupported brand derivative plan engine');
  const runtimePins = [
    ['Sharp', pipeline.engineVersion, sharp.versions.sharp],
    ['libvips', pipeline.libvipsVersion, sharp.versions.vips],
    ['PNG', pipeline.pngVersion, sharp.versions.png],
  ];
  for (const [label, planned, loaded] of runtimePins) {
    if (planned !== loaded)
      throw new Error(`${label} runtime requires ${planned}; loaded ${loaded}`);
  }
  if (pipeline.pixelPolicy !== PIXEL_POLICY) {
    throw new Error('Pipeline pixel policy must use the approved aspect-preserving transform');
  }
  assertExactKeys(
    pipeline.png,
    ['adaptiveFiltering', 'compressionLevel', 'effort', 'palette'],
    'pipeline.png',
  );
  if (
    pipeline.png.adaptiveFiltering !== false ||
    pipeline.png.compressionLevel !== 9 ||
    pipeline.png.effort !== 10 ||
    pipeline.png.palette !== false
  ) {
    throw new Error('Pipeline PNG options must match the deterministic encoder policy');
  }
}

function validateSources(sources, approvedSources) {
  assertExactKeys(sources, Object.keys(REQUIRED_SOURCE_DEFINITIONS), 'source keys');
  for (const [key, expected] of Object.entries(REQUIRED_SOURCE_DEFINITIONS)) {
    const source = sources[key];
    assertExactKeys(source, expected.crop ? ['crop', 'file'] : ['file'], `source ${key}`);
    if (source.file !== expected.file) throw new Error(`Source ${key} must use ${expected.file}`);
    const approved = approvedSources.get(source.file);
    if (!approved) throw new Error(`Source ${key} is not approved: ${source.file}`);
    if (expected.crop) {
      assertExactKeys(source.crop, ['height', 'left', 'top', 'width'], `source ${key} crop`);
      for (const field of ['height', 'left', 'top', 'width']) {
        assertInteger(
          source.crop[field],
          `source ${key} crop.${field}`,
          field === 'height' || field === 'width' ? 1 : 0,
        );
      }
      if (
        source.crop.left + source.crop.width > approved.width ||
        source.crop.top + source.crop.height > approved.height
      ) {
        throw new Error(`Source ${key} crop exceeds approved source bounds`);
      }
      if (JSON.stringify(source.crop) !== JSON.stringify(expected.crop)) {
        throw new Error(`Source ${key} crop must match the approved extraction`);
      }
    }
  }
}

function validateApproval(approval, approvedSources) {
  assertExactKeys(
    approval,
    [
      'cropRationale',
      'reviewSource',
      'reviewedOn',
      'sourceHashes',
      'specReference',
      'status',
      'taskReference',
    ],
    'approval',
  );
  for (const [field, expected] of Object.entries(APPROVAL_METADATA)) {
    if (approval[field] !== expected)
      throw new Error(`Approval ${field} must match plan provenance`);
  }
  assertExactKeys(approval.sourceHashes, [...approvedSources.keys()], 'approval sourceHashes');
  for (const [file, approved] of approvedSources) {
    if (approval.sourceHashes[file] !== approved.sha256) {
      throw new Error(`Approval source hash must match ${file}`);
    }
  }
}

function validateAsset(asset, sources, seenFiles) {
  assertPlainObject(asset, 'asset');
  const hasFrames = Object.prototype.hasOwnProperty.call(asset, 'frames');
  const hasOutputMode = Object.prototype.hasOwnProperty.call(asset, 'outputMode');
  const hasBackground = Object.prototype.hasOwnProperty.call(asset, 'backgroundColor');
  assertExactKeys(
    asset,
    [
      'adjacentProductNamePolicy',
      'containsWordmark',
      'contentBox',
      'file',
      ...(hasFrames ? ['frames'] : []),
      ...(hasBackground ? ['backgroundColor'] : []),
      'height',
      ...(hasOutputMode ? ['outputMode'] : []),
      'platform',
      'purpose',
      'safeZone',
      'source',
      'width',
    ],
    `asset ${String(asset?.file)}`,
  );
  assertPortableAssetPath(asset.file);
  const foldedFile = asset.file.toLowerCase();
  if (seenFiles.has(foldedFile)) throw new Error(`Duplicate derivative output path: ${asset.file}`);
  seenFiles.add(foldedFile);

  if (!PLATFORM_VALUES.has(asset.platform)) throw new Error(`Invalid platform for ${asset.file}`);
  if (!asset.file.startsWith(`${asset.platform}/`)) {
    throw new Error(`Asset path must begin with its platform for ${asset.file}`);
  }
  const isAndroidNotification = asset.file.startsWith('android/notification-');
  if (isAndroidNotification) {
    if (asset.outputMode !== 'android-alpha-mask') {
      throw new Error(`${asset.file} outputMode must be android-alpha-mask`);
    }
  } else if (hasOutputMode) {
    throw new Error(`outputMode is not allowed for ${asset.file}`);
  }
  const isSocialCard = asset.file === 'web/social-card-1200x630.png';
  if (isSocialCard) {
    assertExactKeys(
      asset.backgroundColor,
      ['alpha', 'blue', 'green', 'red'],
      `${asset.file} backgroundColor`,
    );
    const expectedBackground = { alpha: 1, blue: 32, green: 9, red: 4 };
    for (const [channel, expected] of Object.entries(expectedBackground)) {
      if (asset.backgroundColor[channel] !== expected) {
        throw new Error(`${asset.file} backgroundColor must use the approved dark mark color`);
      }
    }
  } else if (hasBackground) {
    throw new Error(`backgroundColor is not allowed for ${asset.file}`);
  }
  assertNonEmptyString(asset.purpose, `${asset.file} purpose`);
  assertNonEmptyString(asset.safeZone, `${asset.file} safeZone`);
  if (!Object.prototype.hasOwnProperty.call(sources, asset.source)) {
    throw new Error(`Unknown derivative source "${String(asset.source)}" for ${asset.file}`);
  }
  if (typeof asset.containsWordmark !== 'boolean') {
    throw new Error(`${asset.file} containsWordmark must be boolean`);
  }
  if (!ADJACENT_NAME_POLICIES.has(asset.adjacentProductNamePolicy)) {
    throw new Error(`Invalid adjacent product name policy for ${asset.file}`);
  }
  if (asset.containsWordmark && asset.adjacentProductNamePolicy !== 'forbidden') {
    throw new Error(`Wordmark ${asset.file} must forbid adjacent duplicate product text`);
  }
  if (!asset.containsWordmark && asset.adjacentProductNamePolicy !== 'accessible-context-only') {
    throw new Error(
      `Standalone mark ${asset.file} may add product text only for accessible context`,
    );
  }

  assertInteger(asset.width, `${asset.file} width`, 1);
  assertInteger(asset.height, `${asset.file} height`, 1);
  assertExactKeys(asset.contentBox, ['height', 'width', 'x', 'y'], `${asset.file} contentBox`);
  for (const field of ['x', 'y', 'width', 'height']) {
    assertInteger(
      asset.contentBox[field],
      `${asset.file} contentBox.${field}`,
      field === 'width' || field === 'height' ? 1 : 0,
    );
  }
  if (
    asset.contentBox.x + asset.contentBox.width > asset.width ||
    asset.contentBox.y + asset.contentBox.height > asset.height
  ) {
    throw new Error(`Content box exceeds output bounds for ${asset.file}`);
  }

  if (hasFrames) {
    if (!asset.file.endsWith('.ico') || !Array.isArray(asset.frames) || asset.frames.length === 0) {
      throw new Error(`Only non-empty ICO frame lists are supported for ${asset.file}`);
    }
    let previous = 0;
    for (const frame of asset.frames) {
      assertInteger(frame, `${asset.file} frame`, 1);
      if (frame > 256) throw new Error(`${asset.file} frame must be at most 256`);
      if (frame <= previous) throw new Error(`${asset.file} frames must be unique and ascending`);
      previous = frame;
    }
  } else if (!asset.file.endsWith('.png')) {
    throw new Error(`PNG output required for ${asset.file}`);
  }
}

export function validateDerivativePlan(plan, { sourceManifest } = {}) {
  assertExactKeys(plan, ['approval', 'assets', 'pipeline', 'schemaVersion', 'sources'], 'plan');
  if (plan.schemaVersion !== 1) throw new Error('Unsupported brand derivative plan schema');
  validatePipeline(plan.pipeline);
  const approvedSources = approvedSourceMap(sourceManifest);
  validateApproval(plan.approval, approvedSources);
  validateSources(plan.sources, approvedSources);
  if (!Array.isArray(plan.assets) || plan.assets.length === 0) {
    throw new Error('Derivative plan must contain the complete platform inventory');
  }
  const seenFiles = new Set();
  for (const asset of plan.assets) validateAsset(asset, plan.sources, seenFiles);
  const actualFiles = plan.assets.map((asset) => asset.file).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify([...REQUIRED_ASSET_FILES].sort())) {
    throw new Error('Derivative plan must contain the complete required platform inventory');
  }
  return plan;
}

async function loadInputs() {
  const [planBytes, sourceManifestBytes] = await Promise.all([
    readFile(planPath),
    readFile(sourceManifestPath),
  ]);
  const sourceManifest = JSON.parse(sourceManifestBytes.toString('utf8'));
  const plan = validateDerivativePlan(JSON.parse(planBytes.toString('utf8')), { sourceManifest });
  const approvedSources = new Map(sourceManifest.assets.map((asset) => [asset.file, asset]));
  const sourceBytes = new Map();

  for (const source of Object.values(plan.sources)) {
    const approved = approvedSources.get(source.file);
    if (!approved) throw new Error(`Derivative plan references unapproved source ${source.file}`);
    if (!sourceBytes.has(source.file)) {
      const bytes = await readFile(join(sourceDirectory, source.file));
      assertApprovedSourceBytes({ approvedSha256: approved.sha256, bytes, file: source.file });
      sourceBytes.set(source.file, bytes);
    }
  }

  return { plan, sourceBytes, sourceManifestBytes, approvedSources };
}

async function renderPng(sourceBytes, source, output, pngOptions) {
  let image = sharp(sourceBytes, { failOn: 'error', limitInputPixels: 64_000_000 });
  if (source.crop) image = image.extract(source.crop);

  const resized = await image
    .resize({
      width: output.contentBox.width,
      height: output.contentBox.height,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png(pngOptions)
    .toBuffer();

  const background = output.backgroundColor
    ? {
        r: output.backgroundColor.red,
        g: output.backgroundColor.green,
        b: output.backgroundColor.blue,
        alpha: output.backgroundColor.alpha,
      }
    : { r: 0, g: 0, b: 0, alpha: 0 };
  return sharp({
    create: {
      width: output.width,
      height: output.height,
      channels: 4,
      background,
    },
  })
    .composite([{ input: resized, left: output.contentBox.x, top: output.contentBox.y }])
    .png(pngOptions)
    .toBuffer();
}

async function convertToAndroidAlphaMask(pngBytes, pngOptions) {
  const { data, info } = await sharp(pngBytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = 255;
    data[offset + 1] = 255;
    data[offset + 2] = 255;
  }
  return sharp(data, {
    raw: { channels: 4, height: info.height, width: info.width },
  })
    .png(pngOptions)
    .toBuffer();
}

function scaleContentBox(asset, size) {
  const width = Math.max(1, Math.round((asset.contentBox.width / asset.width) * size));
  const height = Math.max(1, Math.round((asset.contentBox.height / asset.height) * size));
  return {
    x: Math.floor((size - width) / 2),
    y: Math.floor((size - height) / 2),
    width,
    height,
  };
}

function fittedBoxFor(source, approvedSource, contentBox) {
  const sourceWidth = source.crop?.width ?? approvedSource.width;
  const sourceHeight = source.crop?.height ?? approvedSource.height;
  const sourceAspect = sourceWidth / sourceHeight;
  const boxAspect = contentBox.width / contentBox.height;
  const width =
    sourceAspect >= boxAspect ? contentBox.width : Math.round(contentBox.height * sourceAspect);
  const height =
    sourceAspect >= boxAspect ? Math.round(contentBox.width / sourceAspect) : contentBox.height;
  return {
    x: contentBox.x + Math.floor((contentBox.width - width) / 2),
    y: contentBox.y + Math.floor((contentBox.height - height) / 2),
    width,
    height,
  };
}

function visibleBoundsFor(source, approvedSource, contentBox) {
  const box = fittedBoxFor(source, approvedSource, contentBox);
  return {
    maxX: box.x + box.width - 1,
    maxY: box.y + box.height - 1,
    minX: box.x,
    minY: box.y,
  };
}

function createIco(pngFrames) {
  const directoryLength = 6 + pngFrames.length * 16;
  const header = Buffer.alloc(directoryLength);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngFrames.length, 4);

  let offset = directoryLength;
  for (let index = 0; index < pngFrames.length; index += 1) {
    const { bytes, size } = pngFrames[index];
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(bytes.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += bytes.length;
  }

  return Buffer.concat([header, ...pngFrames.map(({ bytes }) => bytes)]);
}

export function parseAndValidateIco(bytes, expectedSizes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 22) throw new Error('ICO is truncated');
  if (bytes.readUInt16LE(0) !== 0) throw new Error('ICO reserved header must be zero');
  if (bytes.readUInt16LE(2) !== 1) throw new Error('ICO type must be icon');
  const count = bytes.readUInt16LE(4);
  if (count === 0) throw new Error('ICO must contain at least one frame');
  const directoryEnd = 6 + count * 16;
  if (directoryEnd > bytes.length) throw new Error('ICO directory is truncated');

  const frames = [];
  let expectedOffset = directoryEnd;
  let previousSize = 0;
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    const width = bytes.readUInt8(entry) || 256;
    const height = bytes.readUInt8(entry + 1) || 256;
    const colorCount = bytes.readUInt8(entry + 2);
    const reserved = bytes.readUInt8(entry + 3);
    const planes = bytes.readUInt16LE(entry + 4);
    const bitDepth = bytes.readUInt16LE(entry + 6);
    const length = bytes.readUInt32LE(entry + 8);
    const offset = bytes.readUInt32LE(entry + 12);
    if (width !== height || width <= previousSize) {
      throw new Error('ICO frame sizes must be square, unique, and strictly ascending');
    }
    if (colorCount !== 0 || reserved !== 0)
      throw new Error('ICO entry reserved fields must be zero');
    if (planes !== 1) throw new Error('ICO frame planes must equal one');
    if (bitDepth !== 32) throw new Error('ICO frames must use 32-bit depth');
    if (length < 24 || offset !== expectedOffset || offset + length > bytes.length) {
      throw new Error('ICO frame offsets must be ordered, contiguous, and within bounds');
    }
    const frameBytes = bytes.subarray(offset, offset + length);
    if (!frameBytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
      throw new Error('ICO frame must contain PNG bytes');
    }
    if (
      frameBytes.subarray(12, 16).toString('ascii') !== 'IHDR' ||
      frameBytes.readUInt32BE(16) !== width ||
      frameBytes.readUInt32BE(20) !== height
    ) {
      throw new Error('ICO frame PNG dimensions must match its directory entry');
    }
    frames.push({ bytes: frameBytes, height, width });
    previousSize = width;
    expectedOffset = offset + length;
  }
  if (expectedOffset !== bytes.length) throw new Error('ICO must not contain trailing bytes');
  if (
    expectedSizes &&
    JSON.stringify(frames.map((frame) => frame.width)) !== JSON.stringify(expectedSizes)
  ) {
    throw new Error('ICO frame inventory does not match the derivative plan');
  }
  return frames;
}

async function visualHash(pngBytes) {
  const pixels = await sharp(pngBytes)
    .ensureAlpha()
    .resize({ width: 32, height: 32, fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer();
  return sha256(pixels);
}

async function inspectPathWithoutLinks(targetPath, { label, leafType = 'any' }) {
  const absolutePath = resolve(targetPath);
  const root = parse(absolutePath).root;
  const segments = relative(root, absolutePath).split(sep).filter(Boolean);
  let lexicalPath = root;
  let canonicalPath = await realpath(root);

  for (let index = 0; index < segments.length; index += 1) {
    lexicalPath = join(lexicalPath, segments[index]);
    let stats;
    try {
      stats = await lstat(lexicalPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      return {
        canonicalPath: resolve(canonicalPath, ...segments.slice(index)),
        exists: false,
      };
    }
    if (stats.isSymbolicLink()) {
      throw new Error(`${label} must not use symbolic link, junction, or reparse-point ancestry`);
    }
    const isLeaf = index === segments.length - 1;
    if (!isLeaf && !stats.isDirectory()) throw new Error(`${label} ancestry must be directories`);
    if (isLeaf && leafType === 'directory' && !stats.isDirectory()) {
      throw new Error(`${label} must be a directory`);
    }
    if (isLeaf && leafType === 'file' && !stats.isFile()) {
      throw new Error(`${label} must be a regular file`);
    }
    canonicalPath = await realpath(lexicalPath);
  }
  return { canonicalPath, exists: true };
}

function pathsEqual(left, right) {
  const normalize = (value) =>
    process.platform === 'win32' ? resolve(value).toLowerCase() : resolve(value);
  return normalize(left) === normalize(right);
}

let temporaryWriteSequence = 0;

async function writeFileSafely(targetPath, bytes, targetContext) {
  await validateOutputTargets(targetContext);
  await inspectPathWithoutLinks(targetPath, { label: 'Derivative write target', leafType: 'file' });
  const parentPath = dirname(targetPath);
  await inspectPathWithoutLinks(parentPath, {
    label: 'Derivative write parent',
    leafType: 'directory',
  });

  temporaryWriteSequence += 1;
  const temporaryPath = `${targetPath}.tmp-${process.pid}-${temporaryWriteSequence}`;
  let handle;
  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await validateOutputTargets(targetContext);
    await inspectPathWithoutLinks(targetPath, {
      label: 'Derivative write target',
      leafType: 'file',
    });
    await inspectPathWithoutLinks(parentPath, {
      label: 'Derivative write parent',
      leafType: 'directory',
    });
    await rename(temporaryPath, targetPath);
  } finally {
    if (handle) await handle.close();
    await rm(temporaryPath, { force: true });
  }
  await inspectPathWithoutLinks(targetPath, {
    label: 'Written derivative',
    leafType: 'file',
  });
}

async function ensureSafeDirectory(directoryPath, targetContext) {
  await validateOutputTargets(targetContext);
  await inspectPathWithoutLinks(directoryPath, {
    label: 'Derivative directory',
    leafType: 'directory',
  });
  await mkdir(directoryPath, { recursive: true });
  await inspectPathWithoutLinks(directoryPath, {
    label: 'Derivative directory',
    leafType: 'directory',
  });
  await validateOutputTargets(targetContext);
}

export async function generateBrandDerivatives({ outputDirectory, manifestPath }) {
  const { plan, sourceBytes, sourceManifestBytes, approvedSources } = await loadInputs();
  const assetFiles = plan.assets.map((asset) => asset.file);
  const targetContext = { assetFiles, manifestPath, outputDirectory };
  await validateOutputTargets(targetContext);
  const manifestAssets = [];

  for (const asset of plan.assets) {
    const source = plan.sources[asset.source];
    const approvedSource = approvedSources.get(source.file);
    const bytes = sourceBytes.get(source.file);
    let outputBytes;
    let visualBytes;

    if (asset.frames) {
      const frames = [];
      for (const size of asset.frames) {
        const frameAsset = {
          ...asset,
          width: size,
          height: size,
          contentBox: scaleContentBox(asset, size),
        };
        frames.push({
          bytes: await renderPng(bytes, source, frameAsset, plan.pipeline.png),
          size,
        });
      }
      outputBytes = createIco(frames);
      parseAndValidateIco(outputBytes, asset.frames);
      visualBytes = frames.at(-1).bytes;
    } else {
      outputBytes = await renderPng(bytes, source, asset, plan.pipeline.png);
      if (asset.outputMode === 'android-alpha-mask') {
        outputBytes = await convertToAndroidAlphaMask(outputBytes, plan.pipeline.png);
      }
      visualBytes = outputBytes;
    }

    const outputPath = join(outputDirectory, asset.file);
    await ensureSafeDirectory(dirname(outputPath), targetContext);
    await writeFileSafely(outputPath, outputBytes, targetContext);
    manifestAssets.push({
      adjacentProductNamePolicy: asset.adjacentProductNamePolicy,
      containsWordmark: asset.containsWordmark,
      contentBox: asset.contentBox,
      file: asset.file,
      fittedBox: fittedBoxFor(source, approvedSource, asset.contentBox),
      visibleBounds: visibleBoundsFor(source, approvedSource, asset.contentBox),
      ...(asset.frames ? { frames: asset.frames } : {}),
      ...(asset.backgroundColor ? { backgroundColor: asset.backgroundColor } : {}),
      height: asset.height,
      mediaType: asset.frames ? 'image/x-icon' : 'image/png',
      platform: asset.platform,
      purpose: asset.purpose,
      safeZone: asset.safeZone,
      sha256: sha256(outputBytes),
      source: {
        ...(source.crop ? { crop: source.crop } : {}),
        file: source.file,
        sha256: approvedSource.sha256,
      },
      transform:
        asset.outputMode === 'android-alpha-mask'
          ? 'alpha-mask-from-approved-geometry'
          : 'aspect-preserving-contain',
      ...(asset.outputMode ? { outputMode: asset.outputMode } : {}),
      visualSha256: await visualHash(visualBytes),
      width: asset.width,
    });
  }

  const manifest = {
    schemaVersion: 1,
    approval: plan.approval,
    generator: {
      engine: plan.pipeline.engine,
      engineVersion: plan.pipeline.engineVersion,
      icoContainer: 'png-frame-ico-v1',
      png: plan.pipeline.png,
      runtime: {
        libvips: sharp.versions.vips,
        png: sharp.versions.png,
        sharp: sharp.versions.sharp,
      },
    },
    sourceManifestSha256: sha256(sourceManifestBytes),
    assets: manifestAssets,
  };
  await ensureSafeDirectory(dirname(manifestPath), targetContext);
  await writeFileSafely(manifestPath, stableJson(manifest), targetContext);
  return manifest;
}

async function listGeneratedTree(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  const directories = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const entryPath = join(directory, entry.name);
    const stats = await lstat(entryPath);
    if (stats.isSymbolicLink()) {
      throw new Error(`Unexpected generated asset entry: ${relativePath}`);
    }
    if (stats.isDirectory()) {
      directories.push(relativePath);
      const child = await listGeneratedTree(entryPath, relativePath);
      files.push(...child.files);
      directories.push(...child.directories);
    } else if (stats.isFile()) {
      files.push(relativePath);
    } else {
      throw new Error(`Unexpected generated asset entry: ${relativePath}`);
    }
  }
  return { directories, files };
}

async function assertSameFile(expectedPath, actualPath, label) {
  const [expected, actual] = await Promise.all([readFile(expectedPath), readFile(actualPath)]);
  if (!expected.equals(actual)) throw new Error(`Brand derivative drift detected: ${label}`);
}

export async function validateOutputTargets({ assetFiles = [], manifestPath, outputDirectory }) {
  if (!Array.isArray(assetFiles)) throw new Error('Generated asset inventory must be an array');
  if (
    isWithin(sourceDirectory, outputDirectory) ||
    isWithin(outputDirectory, sourceDirectory) ||
    resolve(outputDirectory) === resolve(brandDirectory)
  ) {
    throw new Error(
      'Derivative output directory must not contain or overwrite immutable brand sources',
    );
  }
  if (
    isWithin(sourceDirectory, manifestPath) ||
    resolve(manifestPath) === resolve(sourceManifestPath)
  ) {
    throw new Error('Derivative manifest must not contain or overwrite immutable brand sources');
  }
  for (const file of assetFiles) {
    if (pathsEqual(manifestPath, join(outputDirectory, file))) {
      throw new Error(`Derivative manifest must not collide with generated asset ${file}`);
    }
  }
  if (isWithin(outputDirectory, manifestPath)) {
    throw new Error('Derivative manifest must not be nested inside the generated output');
  }

  const [sourceResult, sourceManifestResult, outputResult, manifestResult] = await Promise.all([
    inspectPathWithoutLinks(sourceDirectory, {
      label: 'Immutable brand source directory',
      leafType: 'directory',
    }),
    inspectPathWithoutLinks(sourceManifestPath, {
      label: 'Immutable brand source manifest',
      leafType: 'file',
    }),
    inspectPathWithoutLinks(outputDirectory, {
      label: 'Derivative output directory',
      leafType: 'directory',
    }),
    inspectPathWithoutLinks(manifestPath, {
      label: 'Derivative manifest',
      leafType: 'file',
    }),
  ]);
  if (
    isWithin(sourceResult.canonicalPath, outputResult.canonicalPath) ||
    isWithin(outputResult.canonicalPath, sourceResult.canonicalPath)
  ) {
    throw new Error(
      'Derivative output directory must not contain or overwrite immutable brand sources',
    );
  }
  if (
    isWithin(sourceResult.canonicalPath, manifestResult.canonicalPath) ||
    pathsEqual(sourceManifestResult.canonicalPath, manifestResult.canonicalPath)
  ) {
    throw new Error('Derivative manifest must not contain or overwrite immutable brand sources');
  }
  if (isWithin(outputResult.canonicalPath, manifestResult.canonicalPath)) {
    throw new Error('Derivative manifest must not be nested inside the generated output');
  }
}

export async function compareBrandDerivatives({
  expectedManifestPath = defaultManifestPath,
  expectedOutputDirectory = defaultOutputDirectory,
} = {}) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'databreeze-brand-check-'));
  try {
    const temporaryOutput = join(temporaryRoot, 'generated');
    const temporaryManifest = join(temporaryRoot, 'derivatives.json');
    await generateBrandDerivatives({
      outputDirectory: temporaryOutput,
      manifestPath: temporaryManifest,
    });

    const [committedTree, generatedTree] = await Promise.all([
      listGeneratedTree(expectedOutputDirectory),
      listGeneratedTree(temporaryOutput),
    ]);
    if (JSON.stringify(committedTree) !== JSON.stringify(generatedTree)) {
      throw new Error('Brand derivative inventory drift detected');
    }
    await Promise.all(
      generatedTree.files.map((file) =>
        assertSameFile(join(expectedOutputDirectory, file), join(temporaryOutput, file), file),
      ),
    );
    await assertSameFile(expectedManifestPath, temporaryManifest, 'derivatives.json');
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

export async function checkBrandDerivatives(options) {
  await compareBrandDerivatives(options);
}

function parseArguments(argv) {
  const options = {
    check: false,
    outputDirectory: defaultOutputDirectory,
    manifestPath: defaultManifestPath,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') {
      options.check = true;
    } else if (argument === '--output' || argument === '--manifest') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a path`);
      index += 1;
      if (argument === '--output') options.outputDirectory = resolve(value);
      else options.manifestPath = resolve(value);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.check) {
    await checkBrandDerivatives({
      expectedManifestPath: options.manifestPath,
      expectedOutputDirectory: options.outputDirectory,
    });
    process.stdout.write('Brand derivatives are reproducible and current.\n');
  } else {
    await generateBrandDerivatives(options);
    process.stdout.write(`Generated brand derivatives in ${options.outputDirectory}.\n`);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

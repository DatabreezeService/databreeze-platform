import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import sharp from 'sharp';

const packageDirectory = fileURLToPath(new URL('../', import.meta.url));
const brandDirectory = join(packageDirectory, 'brand');
const sourceDirectory = join(brandDirectory, 'source');
const sourceManifestPath = join(brandDirectory, 'manifest.json');
const planPath = join(brandDirectory, 'derivative-plan.json');
const defaultOutputDirectory = join(brandDirectory, 'generated');
const defaultManifestPath = join(brandDirectory, 'derivatives.json');

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

export function validateDerivativePlan(plan) {
  if (plan?.schemaVersion !== 1 || plan?.pipeline?.engine !== 'sharp') {
    throw new Error('Unsupported brand derivative plan');
  }

  if (plan.pipeline.engineVersion !== sharp.versions.sharp) {
    throw new Error(
      `Brand pipeline requires sharp ${plan.pipeline.engineVersion}; loaded ${sharp.versions.sharp}`,
    );
  }

  const seenFiles = new Set();
  for (const asset of plan.assets ?? []) {
    if (
      typeof asset.file !== 'string' ||
      isAbsolute(asset.file) ||
      asset.file.split(/[\\/]/u).includes('..')
    ) {
      throw new Error(`Unsafe derivative output path: ${String(asset.file)}`);
    }
    if (seenFiles.has(asset.file)) {
      throw new Error(`Duplicate derivative output path: ${asset.file}`);
    }
    seenFiles.add(asset.file);

    if (!plan.sources?.[asset.source]) {
      throw new Error(`Unknown derivative source "${String(asset.source)}" for ${asset.file}`);
    }

    assertInteger(asset.width, `${asset.file} width`, 1);
    assertInteger(asset.height, `${asset.file} height`, 1);
    for (const field of ['x', 'y', 'width', 'height']) {
      assertInteger(
        asset.contentBox?.[field],
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

    if (asset.containsWordmark && asset.adjacentProductNamePolicy !== 'forbidden') {
      throw new Error(`Wordmark ${asset.file} must forbid adjacent duplicate product text`);
    }
    if (!asset.containsWordmark && asset.adjacentProductNamePolicy !== 'accessible-context-only') {
      throw new Error(
        `Standalone mark ${asset.file} may add product text only for accessible context`,
      );
    }

    if (asset.frames) {
      if (!asset.file.endsWith('.ico') || asset.frames.length === 0) {
        throw new Error(`Only non-empty ICO frame lists are supported for ${asset.file}`);
      }
      for (const frame of asset.frames) assertInteger(frame, `${asset.file} frame`, 1);
    } else if (!asset.file.endsWith('.png')) {
      throw new Error(`PNG output required for ${asset.file}`);
    }
  }

  return plan;
}

async function loadInputs() {
  const [planBytes, sourceManifestBytes] = await Promise.all([
    readFile(planPath),
    readFile(sourceManifestPath),
  ]);
  const plan = validateDerivativePlan(JSON.parse(planBytes.toString('utf8')));
  const sourceManifest = JSON.parse(sourceManifestBytes.toString('utf8'));
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

  return sharp({
    create: {
      width: output.width,
      height: output.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, left: output.contentBox.x, top: output.contentBox.y }])
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

async function visualHash(pngBytes) {
  const pixels = await sharp(pngBytes)
    .ensureAlpha()
    .resize({ width: 32, height: 32, fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer();
  return sha256(pixels);
}

export async function generateBrandDerivatives({ outputDirectory, manifestPath }) {
  validateOutputTargets({ manifestPath, outputDirectory });

  const { plan, sourceBytes, sourceManifestBytes, approvedSources } = await loadInputs();
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
      visualBytes = frames.at(-1).bytes;
    } else {
      outputBytes = await renderPng(bytes, source, asset, plan.pipeline.png);
      visualBytes = outputBytes;
    }

    const outputPath = join(outputDirectory, asset.file);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, outputBytes);
    manifestAssets.push({
      adjacentProductNamePolicy: asset.adjacentProductNamePolicy,
      containsWordmark: asset.containsWordmark,
      contentBox: asset.contentBox,
      file: asset.file,
      fittedBox: fittedBoxFor(source, approvedSource, asset.contentBox),
      ...(asset.frames ? { frames: asset.frames } : {}),
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
      transform: 'aspect-preserving-contain',
      visualSha256: await visualHash(visualBytes),
      width: asset.width,
    });
  }

  const manifest = {
    schemaVersion: 1,
    generator: {
      engine: plan.pipeline.engine,
      engineVersion: plan.pipeline.engineVersion,
      icoContainer: 'png-frame-ico-v1',
      png: plan.pipeline.png,
    },
    sourceManifestSha256: sha256(sourceManifestBytes),
    assets: manifestAssets,
  };
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, stableJson(manifest));
  return manifest;
}

async function listFilesRecursively(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(join(directory, entry.name), relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    } else {
      throw new Error(`Unexpected generated asset entry: ${relativePath}`);
    }
  }
  return files;
}

async function assertSameFile(expectedPath, actualPath, label) {
  const [expected, actual] = await Promise.all([readFile(expectedPath), readFile(actualPath)]);
  if (!expected.equals(actual)) throw new Error(`Brand derivative drift detected: ${label}`);
}

export function validateOutputTargets({ manifestPath, outputDirectory }) {
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

    const [committedFiles, generatedFiles] = await Promise.all([
      listFilesRecursively(expectedOutputDirectory),
      listFilesRecursively(temporaryOutput),
    ]);
    if (JSON.stringify(committedFiles) !== JSON.stringify(generatedFiles)) {
      throw new Error('Brand derivative inventory drift detected');
    }
    await Promise.all(
      generatedFiles.map((file) =>
        assertSameFile(join(expectedOutputDirectory, file), join(temporaryOutput, file), file),
      ),
    );
    await assertSameFile(expectedManifestPath, temporaryManifest, 'derivatives.json');
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

export async function checkBrandDerivatives() {
  await compareBrandDerivatives();
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
    await checkBrandDerivatives();
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

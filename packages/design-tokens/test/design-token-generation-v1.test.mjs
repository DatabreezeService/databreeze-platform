import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatorPath = resolve(packageRoot, 'scripts/generate-design-tokens.mjs');
const expectedInventory = [
  'android/values/databreeze_tokens_v1.xml',
  'css/v1.css',
  'manifest-v1.json',
  'typescript/v1.ts',
];
const sourcePath = resolve(packageRoot, 'tokens/source/v1.json');

function filesUnder(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = resolve(directory, entry.name);
      return entry.isDirectory() ? filesUnder(root, entryPath) : [relative(root, entryPath)];
    })
    .map((file) => file.replaceAll('\\', '/'))
    .sort();
}

function runGenerator(outputRoot) {
  return spawnSync(process.execPath, [generatorPath, '--output', outputRoot], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
}

function checkGenerator(outputRoot) {
  return spawnSync(process.execPath, [generatorPath, '--check', '--output', outputRoot], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
}

function tokenMap() {
  const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
  return new Map(source.tokens.map((token) => [token.name, token]));
}

function luminance(hex) {
  const channels = [1, 3, 5]
    .map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('[WEB-014, DSK-021, AND-017 partial] generation emits a deterministic closed v1 inventory', () => {
  const firstRoot = mkdtempSync(resolve(tmpdir(), 'databreeze-tokens-first-'));
  const secondRoot = mkdtempSync(resolve(tmpdir(), 'databreeze-tokens-second-'));

  try {
    const first = runGenerator(firstRoot);
    const second = runGenerator(secondRoot);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(filesUnder(firstRoot), expectedInventory);
    assert.deepEqual(filesUnder(secondRoot), expectedInventory);
    for (const file of expectedInventory) {
      assert.deepEqual(
        readFileSync(resolve(firstRoot, file)),
        readFileSync(resolve(secondRoot, file)),
      );
    }
  } finally {
    rmSync(firstRoot, { force: true, recursive: true });
    rmSync(secondRoot, { force: true, recursive: true });
  }
});

test('the v1 contract publishes every required platform-neutral token family', () => {
  const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
  const names = source.tokens.map((token) => token.name);
  const requiredNames = [
    'color.background',
    'color.border',
    'color.focus',
    'color.onPrimary',
    'color.primary',
    'color.status.danger.surface',
    'color.status.danger.text',
    'color.status.info.surface',
    'color.status.info.text',
    'color.status.success.surface',
    'color.status.success.text',
    'color.status.warning.surface',
    'color.status.warning.text',
    'color.surface',
    'color.text',
    'color.textMuted',
    'elevation.level1',
    'focus.ringOffset',
    'focus.ringWidth',
    'logo.mark.accessibleNamePolicy',
    'logo.preserveAspectRatio',
    'logo.recolorPolicy',
    'logo.wordmark.adjacentProductNamePolicy',
    'logo.wordmark.minimumWidth',
    'motion.duration.fast',
    'motion.duration.instant',
    'motion.duration.normal',
    'motion.easing.standard',
    'radius.medium',
    'sizing.controlMinimum',
    'sizing.touchTargetMinimum',
    'spacing.2',
    'spacing.4',
    'status.danger.icon',
    'status.info.icon',
    'status.success.icon',
    'status.warning.icon',
    'typography.fontFamily.body',
    'typography.fontSize.body',
    'typography.fontWeight.regular',
    'typography.lineHeight.body',
    'typography.numericFeature',
  ];

  assert.equal(source.version, 1);
  assert.deepEqual(source.requirements, ['WEB-014', 'DSK-021', 'AND-017']);
  assert.deepEqual(names, [...names].sort(), 'token names must remain deterministic');
  assert.equal(new Set(names).size, names.length, 'token names must be unique');
  assert.deepEqual(
    [...new Set(names.map((name) => name.split('.')[0]))],
    [
      'color',
      'elevation',
      'focus',
      'logo',
      'motion',
      'radius',
      'sizing',
      'spacing',
      'status',
      'typography',
    ],
  );
  for (const name of requiredNames) assert.ok(names.includes(name), `missing ${name}`);
});

test('[WEB-014, DSK-021, AND-017 partial] semantic color pairs meet WCAG 2.2 AA', () => {
  const tokens = tokenMap();
  const textPairs = [
    ['color.text', 'color.background'],
    ['color.textMuted', 'color.background'],
    ['color.onPrimary', 'color.primary'],
    ['color.status.success.text', 'color.status.success.surface'],
    ['color.status.warning.text', 'color.status.warning.surface'],
    ['color.status.danger.text', 'color.status.danger.surface'],
    ['color.status.info.text', 'color.status.info.surface'],
  ];
  for (const [foregroundName, backgroundName] of textPairs) {
    const ratio = contrastRatio(tokens.get(foregroundName).value, tokens.get(backgroundName).value);
    assert.ok(ratio >= 4.5, `${foregroundName} on ${backgroundName} has contrast ${ratio}`);
  }
  assert.ok(
    contrastRatio(tokens.get('color.border').value, tokens.get('color.background').value) >= 3,
    'component boundaries must reach 3:1',
  );
  assert.ok(
    contrastRatio(tokens.get('color.focus').value, tokens.get('color.background').value) >= 3,
    'focus indication must reach 3:1',
  );
});

test('[DSK-021, WEB-014 partial] CSS exposes a complete reduced-motion override', () => {
  const outputRoot = mkdtempSync(resolve(tmpdir(), 'databreeze-tokens-motion-'));
  try {
    const result = runGenerator(outputRoot);
    assert.equal(result.status, 0, result.stderr);
    const css = readFileSync(resolve(outputRoot, 'css/v1.css'), 'utf8');
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
    assert.match(css, /--db-motion-duration-fast: 0ms;/u);
    assert.match(css, /--db-motion-duration-normal: 0ms;/u);
    assert.match(css, /--db-motion-duration-slow: 0ms;/u);
  } finally {
    rmSync(outputRoot, { force: true, recursive: true });
  }
});

test('[WEB-014, DSK-021, AND-017 partial] TypeScript CSS and Android publish every semantic token', async () => {
  const outputRoot = mkdtempSync(resolve(tmpdir(), 'databreeze-tokens-parity-'));
  try {
    const result = runGenerator(outputRoot);
    assert.equal(result.status, 0, result.stderr);
    const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
    const typeScriptPath = resolve(outputRoot, 'typescript/v1.ts');
    const css = readFileSync(resolve(outputRoot, 'css/v1.css'), 'utf8');
    const android = readFileSync(
      resolve(outputRoot, 'android/values/databreeze_tokens_v1.xml'),
      'utf8',
    );
    const { designTokenEntriesV1: typeScriptEntries } = await import(
      pathToFileURL(typeScriptPath).href
    );
    const typeScriptNames = typeScriptEntries.map((token) => token.name);
    const expectedNames = source.tokens.map((token) => token.name);
    assert.deepEqual(typeScriptNames, expectedNames);
    assert.deepEqual(typeScriptEntries, source.tokens);
    for (const token of source.tokens) {
      const { name } = token;
      const slug = name
        .replaceAll('.', '-')
        .replaceAll(/([a-z])([A-Z])/g, '$1-$2')
        .toLowerCase();
      const androidName = `db_${slug.replaceAll('-', '_')}`;
      const cssExpected =
        token.type === 'color'
          ? String(token.value).toLowerCase()
          : token.type === 'dimension'
            ? `${token.value}px`
            : token.type === 'duration'
              ? `${token.value}ms`
              : token.type === 'string' &&
                  !String(token.value).includes('(') &&
                  !token.name.includes('fontFamily')
                ? JSON.stringify(token.value)
                : String(token.value);
      const androidExpected =
        token.type === 'dimension' ? `${token.value}${token.unit}` : String(token.value);
      const cssActual = new RegExp(`--db-${slug}:\\s*([^;]+);`, 'u').exec(css)?.[1];
      assert.ok(cssActual, `CSS missing ${name}`);
      const compactCssActual = cssActual.trim().replaceAll(/\s+/g, ' ');
      const compactCssExpected = cssExpected.trim().replaceAll(/\s+/g, ' ');
      const normalizedCssActual = /^(['"])(.*)\1$/u.exec(compactCssActual)?.[2] ?? compactCssActual;
      const normalizedCssExpected =
        /^(['"])(.*)\1$/u.exec(compactCssExpected)?.[2] ?? compactCssExpected;
      assert.equal(normalizedCssActual, normalizedCssExpected, `CSS differs for ${name}`);
      assert.match(
        android,
        new RegExp(
          `name="${androidName}"(?: translatable="false")?>${androidExpected.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`,
          'u',
        ),
        `Android differs for ${name}`,
      );
    }
  } finally {
    rmSync(outputRoot, { force: true, recursive: true });
  }
});

test('generation drift is detected without rewriting the expected outputs', () => {
  const outputRoot = mkdtempSync(resolve(tmpdir(), 'databreeze-tokens-drift-'));
  try {
    const generated = runGenerator(outputRoot);
    assert.equal(generated.status, 0, generated.stderr);
    const clean = checkGenerator(outputRoot);
    assert.equal(clean.status, 0, clean.stderr);

    const cssPath = resolve(outputRoot, 'css/v1.css');
    const changed = `${readFileSync(cssPath, 'utf8')}/* drift */\n`;
    writeFileSync(cssPath, changed, 'utf8');
    const drift = checkGenerator(outputRoot);
    assert.equal(drift.status, 1);
    assert.match(drift.stderr, /Design token drift detected: css\/v1\.css/u);
    assert.equal(readFileSync(cssPath, 'utf8'), changed);
  } finally {
    rmSync(outputRoot, { force: true, recursive: true });
  }
});

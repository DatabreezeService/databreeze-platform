import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(packageRoot, 'tokens/source/v1.json');
const defaultOutputRoot = resolve(packageRoot, 'tokens/generated');
const prettierOptions = {
  endOfLine: 'lf',
  printWidth: 100,
  proseWrap: 'always',
  singleQuote: true,
  trailingComma: 'all',
};
const requiredFamilies = [
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
];
const requiredRequirements = ['WEB-014', 'DSK-021', 'AND-017'];
const supportedTypes = new Set([
  'boolean',
  'color',
  'dimension',
  'duration',
  'integer',
  'number',
  'string',
]);

function parseOptions(argumentsList) {
  const options = { check: false, outputRoot: defaultOutputRoot, sourcePath };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--check') {
      options.check = true;
    } else if (argument === '--output') {
      const value = argumentsList[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--output requires a directory');
      options.outputRoot = resolve(value);
      index += 1;
    } else if (argument === '--source') {
      const value = argumentsList[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--source requires a file');
      options.sourcePath = resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireExactKeys(value, allowedKeys, label) {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...allowedKeys].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`${label} keys must be exactly ${expectedKeys.join(', ')}`);
  }
}

function validateTokenValue(token, label) {
  const hasUnit = Object.hasOwn(token, 'unit');
  if (token.type === 'dimension') {
    if (!hasUnit || !['dp', 'sp'].includes(token.unit)) {
      throw new Error(`${label}.unit must be dp or sp`);
    }
    if (typeof token.value !== 'number' || !Number.isFinite(token.value) || token.value < 0) {
      throw new Error(`${label}.value must be a finite non-negative number`);
    }
    return;
  }
  if (token.type === 'duration') {
    if (!hasUnit || token.unit !== 'ms') throw new Error(`${label}.unit must be ms`);
    if (!Number.isInteger(token.value) || token.value < 0) {
      throw new Error(`${label}.value must be a non-negative integer`);
    }
    return;
  }
  if (hasUnit) throw new Error(`${label}.unit is forbidden for ${token.type}`);
  if (token.type === 'color') {
    if (typeof token.value !== 'string' || !/^#[0-9A-F]{6}$/u.test(token.value)) {
      throw new Error(`${label}.value must be an uppercase #RRGGBB color`);
    }
  } else if (token.type === 'string') {
    const containsControl =
      typeof token.value === 'string' &&
      [...token.value].some((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
      });
    if (
      typeof token.value !== 'string' ||
      token.value.length === 0 ||
      token.value.length > 512 ||
      containsControl
    ) {
      throw new Error(`${label}.value must be bounded non-empty text without controls`);
    }
  } else if (token.type === 'boolean') {
    if (typeof token.value !== 'boolean') throw new Error(`${label}.value must be boolean`);
  } else if (token.type === 'integer') {
    if (!Number.isInteger(token.value) || token.value < 0) {
      throw new Error(`${label}.value must be a non-negative integer`);
    }
  } else if (typeof token.value !== 'number' || !Number.isFinite(token.value) || token.value < 0) {
    throw new Error(`${label}.value must be a finite non-negative number`);
  }
}

function validateSource(source) {
  requireExactKeys(source, ['requirements', 'tokens', 'version'], 'root');
  if (source.version !== 1) throw new Error('version must be 1');
  if (
    !Array.isArray(source.requirements) ||
    JSON.stringify(source.requirements) !== JSON.stringify(requiredRequirements)
  ) {
    throw new Error(`requirements must be exactly ${requiredRequirements.join(', ')}`);
  }
  if (!Array.isArray(source.tokens) || source.tokens.length === 0) {
    throw new Error('tokens must be a non-empty array');
  }

  const names = [];
  const cssNames = new Set();
  const androidNames = new Set();
  for (const [index, token] of source.tokens.entries()) {
    const label = `tokens[${index}]`;
    if (!isRecord(token)) throw new Error(`${label} must be an object`);
    if (typeof token.type !== 'string' || !supportedTypes.has(token.type)) {
      throw new Error(`${label}.type is unsupported`);
    }
    requireExactKeys(
      token,
      token.type === 'dimension' || token.type === 'duration'
        ? ['name', 'type', 'unit', 'value']
        : ['name', 'type', 'value'],
      label,
    );
    if (
      typeof token.name !== 'string' ||
      !/^[a-z][A-Za-z0-9]*(?:\.(?:[a-z][A-Za-z0-9]*|[0-9]+))+$/u.test(token.name)
    ) {
      throw new Error(`${label}.name is not a supported semantic name`);
    }
    validateTokenValue(token, label);
    names.push(token.name);
    const cssName = slug(token.name);
    const androidName = cssName.replaceAll('-', '_');
    if (cssNames.has(cssName) || androidNames.has(androidName)) {
      throw new Error(`${label}.name collides after platform normalization`);
    }
    cssNames.add(cssName);
    androidNames.add(androidName);
  }

  if (new Set(names).size !== names.length) throw new Error('token names must be unique');
  if (JSON.stringify(names) !== JSON.stringify([...names].sort())) {
    throw new Error('token names must be sorted');
  }
  const families = [...new Set(names.map((name) => name.split('.')[0]))];
  if (JSON.stringify(families) !== JSON.stringify(requiredFamilies)) {
    throw new Error(`token families must be exactly ${requiredFamilies.join(', ')}`);
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex').toUpperCase();
}

function slug(name) {
  return name
    .replaceAll('.', '-')
    .replaceAll(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function cssValue(token) {
  if (token.type === 'dimension') return `${token.value}px`;
  if (token.type === 'duration') return `${token.value}ms`;
  if (
    token.type === 'string' &&
    !String(token.value).includes('(') &&
    !token.name.includes('fontFamily')
  ) {
    return JSON.stringify(token.value);
  }
  return String(token.value);
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function androidResource(token) {
  const name = `db_${slug(token.name).replaceAll('-', '_')}`;
  if (token.type === 'color') return `  <color name="${name}">${token.value}</color>`;
  if (token.type === 'dimension') {
    return `  <dimen name="${name}">${token.value}${token.unit}</dimen>`;
  }
  if (token.type === 'duration' || token.type === 'integer') {
    return `  <integer name="${name}">${token.value}</integer>`;
  }
  if (token.type === 'boolean') return `  <bool name="${name}">${token.value}</bool>`;
  return `  <string name="${name}" translatable="false">${xmlEscape(token.value)}</string>`;
}

function renderTypeScript(source) {
  return (
    `type DeepReadonly<Value> = Value extends object\n` +
    `  ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }\n` +
    `  : Value;\n\n` +
    `function deepFreeze<const Value>(value: Value): DeepReadonly<Value> {\n` +
    `  if (value !== null && typeof value === 'object') {\n` +
    `    for (const nested of Object.values(value)) deepFreeze(nested);\n` +
    `    Object.freeze(value);\n` +
    `  }\n` +
    `  return value as DeepReadonly<Value>;\n` +
    `}\n\n` +
    `export const designTokenVersion = ${JSON.stringify(source.version)} as const;\n` +
    `export const designTokenEntriesV1 = deepFreeze(${JSON.stringify(source.tokens, null, 2)} as const);\n` +
    'export type DesignTokenV1 = (typeof designTokenEntriesV1)[number];\n'
  );
}

function renderCss(tokens) {
  const declarations = tokens.map((token) => `  --db-${slug(token.name)}: ${cssValue(token)};`);
  const reducedMotion = tokens
    .filter((token) => token.type === 'duration' && token.value !== 0)
    .map((token) => `    --db-${slug(token.name)}: 0ms;`);
  return (
    `:root {\n${declarations.join('\n')}\n}\n\n` +
    `@media (prefers-reduced-motion: reduce) {\n  :root {\n${reducedMotion.join('\n')}\n  }\n}\n`
  );
}

function renderAndroid(tokens) {
  return `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${tokens.map(androidResource).join('\n')}\n</resources>\n`;
}

async function buildFiles(source, sourceBytes) {
  const files = {
    'android/values/databreeze_tokens_v1.xml': renderAndroid(source.tokens),
    'css/v1.css': await format(renderCss(source.tokens), { ...prettierOptions, parser: 'css' }),
    'typescript/v1.ts': await format(renderTypeScript(source), {
      ...prettierOptions,
      parser: 'typescript',
    }),
  };
  const manifest = {
    version: source.version,
    requirements: source.requirements,
    sourceSha256: sha256(sourceBytes),
    tokenCount: source.tokens.length,
    files: Object.fromEntries(
      Object.entries(files).map(([file, contents]) => [file, sha256(contents)]),
    ),
  };
  files['manifest-v1.json'] = await format(JSON.stringify(manifest), {
    ...prettierOptions,
    parser: 'json',
  });
  return files;
}

async function listFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = resolve(directory, entry.name);
      return entry.isDirectory()
        ? listFiles(root, entryPath)
        : [relative(root, entryPath).replaceAll('\\', '/')];
    }),
  );
  return files.flat().sort();
}

async function checkFiles(outputRoot, files) {
  const expectedInventory = Object.keys(files).sort();
  let actualInventory;
  try {
    actualInventory = await listFiles(outputRoot);
  } catch {
    actualInventory = [];
  }
  const inventoryDrift =
    JSON.stringify(actualInventory) === JSON.stringify(expectedInventory)
      ? undefined
      : (expectedInventory.find((file) => !actualInventory.includes(file)) ??
        actualInventory.find((file) => !expectedInventory.includes(file)));
  if (inventoryDrift) throw new Error(`Design token drift detected: ${inventoryDrift}`);

  for (const [file, contents] of Object.entries(files)) {
    const actual = await readFile(resolve(outputRoot, file), 'utf8');
    if (actual !== contents) throw new Error(`Design token drift detected: ${file}`);
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const sourceBytes = await readFile(options.sourcePath);
  let source;
  try {
    source = JSON.parse(sourceBytes.toString('utf8'));
    validateSource(source);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown validation failure';
    throw new Error(`Invalid design token source: ${reason}`);
  }
  const files = await buildFiles(source, sourceBytes);
  if (options.check) {
    await checkFiles(options.outputRoot, files);
    process.stdout.write('Design token outputs are current.\n');
    return;
  }

  for (const [file, contents] of Object.entries(files)) {
    const outputPath = resolve(options.outputRoot, file);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, contents, 'utf8');
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

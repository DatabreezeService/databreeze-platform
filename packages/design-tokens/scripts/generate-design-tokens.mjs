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

function parseOptions(argumentsList) {
  const options = { check: false, outputRoot: defaultOutputRoot };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--check') {
      options.check = true;
    } else if (argument === '--output') {
      const value = argumentsList[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--output requires a directory');
      options.outputRoot = resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
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
    `export const designTokenVersion = ${JSON.stringify(source.version)};\n` +
    `export const designTokenEntriesV1 = Object.freeze(${JSON.stringify(source.tokens, null, 2)});\n` +
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
  const sourceBytes = await readFile(sourcePath);
  const source = JSON.parse(sourceBytes.toString('utf8'));
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

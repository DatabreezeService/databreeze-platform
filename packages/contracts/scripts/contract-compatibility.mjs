import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publishedRegistryPath = 'compatibility/published.json';

function fail(message) {
  throw new Error(message);
}

function compareStrings(left, right) {
  return left.localeCompare(right, 'en');
}

function toPosix(path) {
  return path.replaceAll('\\', '/');
}

function parseJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function listFiles(root, directory = root) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? listFiles(root, path) : [toPosix(relative(root, path))];
    })
    .sort(compareStrings);
}

function versionSchemaEntries(root, version) {
  const manifestPath = resolve(root, 'manifest.json');
  if (!existsSync(manifestPath)) fail('Canonical contract manifest is missing: manifest.json');
  const manifest = parseJson(manifestPath, 'Canonical contract manifest');
  if (!Array.isArray(manifest.schemas))
    fail('Canonical contract manifest schemas must be an array');

  const versionPrefix = `schemas/v${version}/`;
  const entries = manifest.schemas
    .filter((entry) => typeof entry.path === 'string' && entry.path.startsWith(versionPrefix))
    .sort((left, right) => compareStrings(left.name, right.name));
  if (entries.length === 0) fail(`No canonical schemas found for v${version}`);
  return entries;
}

function versionGeneratedOutputs(root, version) {
  const generatedRoot = resolve(root, 'generated');
  const versionSegment = `/v${version}/`;
  return listFiles(generatedRoot).filter((path) => `/${path}`.includes(versionSegment));
}

function buildBaseline(root, version) {
  const expectedIdPrefix = `https://schemas.databreeze.dev/contracts/v${version}/`;
  const schemaEntries = versionSchemaEntries(root, version);
  const registeredPaths = new Set(schemaEntries.map((entry) => entry.path));
  const schemaDirectory = resolve(root, `schemas/v${version}`);
  const unregisteredSchemas = listFiles(schemaDirectory)
    .map((path) => `schemas/v${version}/${path}`)
    .filter((path) => !registeredPaths.has(path));
  if (unregisteredSchemas.length > 0) {
    fail(`Unregistered schema in published v${version}: ${unregisteredSchemas[0]}`);
  }

  const schemas = schemaEntries.map((entry) => {
    if (!entry.id.startsWith(expectedIdPrefix)) {
      fail(`Schema ID must use the v${version} namespace: ${entry.id}`);
    }
    const schemaPath = resolve(root, entry.path);
    if (!existsSync(schemaPath)) fail(`Published schema is missing: ${entry.path}`);
    const schema = parseJson(schemaPath, `Schema ${entry.name}`);
    if (schema.$id !== entry.id) fail(`Manifest ID does not match ${entry.path}`);
    return {
      name: entry.name,
      id: entry.id,
      path: entry.path,
      sha256: sha256File(schemaPath),
    };
  });

  const outputPaths = versionGeneratedOutputs(root, version);
  if (outputPaths.length === 0) fail(`No generated public outputs found for v${version}`);
  const generatedPublicOutputs = outputPaths.map((path) => ({
    path,
    sha256: sha256File(resolve(root, 'generated', ...path.split('/'))),
  }));

  return {
    baselineFormat: 1,
    contractVersion: version,
    schemaIdPrefix: expectedIdPrefix,
    schemas,
    generatedPublicOutputs,
  };
}

function readPublishedRegistry(root) {
  const path = resolve(root, publishedRegistryPath);
  if (!existsSync(path)) {
    fail(`Published compatibility registry is missing: ${publishedRegistryPath}`);
  }
  const registry = parseJson(path, 'Published compatibility registry');
  if (registry.policyVersion !== 1 || !Array.isArray(registry.versions)) {
    fail('Published compatibility registry has an unsupported shape');
  }
  return registry;
}

function verifySchemaBaseline(root, version, baseline) {
  const currentEntries = versionSchemaEntries(root, version);
  const currentByName = new Map(currentEntries.map((entry) => [entry.name, entry]));
  const baselineNames = new Set(baseline.schemas.map((entry) => entry.name));

  for (const expected of baseline.schemas) {
    const current = currentByName.get(expected.name);
    if (!current) fail(`Published schema was removed from v${version}: ${expected.name}`);
    if (current.id !== expected.id) {
      fail(`Published schema ID changed in place: ${expected.name}`);
    }
    if (current.path !== expected.path) {
      fail(`Published schema path changed in place: ${expected.name}`);
    }
    const sourcePath = resolve(root, expected.path);
    if (!existsSync(sourcePath)) fail(`Published schema is missing: ${expected.path}`);
    if (sha256File(sourcePath) !== expected.sha256) {
      fail(`Published schema bytes changed in place: ${expected.name}`);
    }
  }

  const added = currentEntries.find((entry) => !baselineNames.has(entry.name));
  if (added) fail(`Schema added to published v${version}: ${added.name}`);

  const registeredPaths = new Set(currentEntries.map((entry) => entry.path));
  const schemaRoot = resolve(root, `schemas/v${version}`);
  const unregistered = listFiles(schemaRoot)
    .map((path) => `schemas/v${version}/${path}`)
    .find((path) => !registeredPaths.has(path));
  if (unregistered) fail(`Unregistered schema in published v${version}: ${unregistered}`);
}

function verifyGeneratedBaseline(root, version, baseline) {
  const baselinePaths = new Set(baseline.generatedPublicOutputs.map((entry) => entry.path));
  for (const expected of baseline.generatedPublicOutputs) {
    const outputPath = resolve(root, 'generated', ...expected.path.split('/'));
    if (!existsSync(outputPath)) {
      fail(`Published generated output is missing: ${expected.path}`);
    }
    if (sha256File(outputPath) !== expected.sha256) {
      fail(`Published generated output changed in place: ${expected.path}`);
    }
  }
  const added = versionGeneratedOutputs(root, version).find((path) => !baselinePaths.has(path));
  if (added) fail(`Generated public output added to published v${version}: ${added}`);
}

function checkCompatibility(root) {
  const registry = readPublishedRegistry(root);
  if (registry.versions.length === 0) fail('Published compatibility registry has no versions');

  for (const published of [...registry.versions].sort(
    (left, right) => left.contractVersion - right.contractVersion,
  )) {
    const version = published.contractVersion;
    const baselinePath = resolve(root, ...published.baseline.split('/'));
    if (!existsSync(baselinePath)) {
      fail(`Published baseline is missing: ${published.baseline}`);
    }
    if (sha256File(baselinePath) !== published.sha256) {
      fail(`Published baseline drift detected for v${version}`);
    }
    const baseline = parseJson(baselinePath, `Published v${version} baseline`);
    if (baseline.contractVersion !== version) {
      fail(`Published baseline version mismatch for v${version}`);
    }
    verifySchemaBaseline(root, version, baseline);
    verifyGeneratedBaseline(root, version, baseline);
  }
}

function updateBaseline(root, version, approved) {
  const baseline = buildBaseline(root, version);
  const baselineContent = formatJson(baseline);
  const registryPath = resolve(root, publishedRegistryPath);
  const registry = existsSync(registryPath)
    ? readPublishedRegistry(root)
    : { policyVersion: 1, versions: [] };
  const published = registry.versions.find((entry) => entry.contractVersion === version);

  if (published) {
    const baselinePath = resolve(root, ...published.baseline.split('/'));
    if (!existsSync(baselinePath)) {
      fail(`Published baseline is missing: ${published.baseline}`);
    }
    if (
      sha256File(baselinePath) !== published.sha256 ||
      readFileSync(baselinePath, 'utf8') !== baselineContent
    ) {
      fail(`Refusing to rewrite published v${version}; publish new schema IDs and a new version`);
    }
    return false;
  }

  if (!approved) {
    fail(`Creating v${version} requires --approve-new-version after review`);
  }

  const relativeBaselinePath = `compatibility/v${version}/baseline.json`;
  const baselinePath = resolve(root, ...relativeBaselinePath.split('/'));
  if (existsSync(baselinePath)) {
    fail(`Unregistered baseline already exists: ${relativeBaselinePath}`);
  }
  mkdirSync(dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, baselineContent, 'utf8');

  const nextRegistry = {
    policyVersion: 1,
    versions: [
      ...registry.versions,
      {
        contractVersion: version,
        baseline: relativeBaselinePath,
        sha256: sha256Bytes(baselineContent),
      },
    ].sort((left, right) => left.contractVersion - right.contractVersion),
  };
  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, formatJson(nextRegistry), 'utf8');
  return true;
}

function readArguments(argumentsList) {
  const command = argumentsList[0];
  if (!['check', 'update'].includes(command)) {
    fail('Usage: contract-compatibility.mjs <check|update> [--root PATH] [--version N]');
  }
  const options = {
    approved: false,
    command,
    root: defaultRoot,
    version: undefined,
  };
  for (let index = 1; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--approve-new-version') {
      options.approved = true;
    } else if (argument === '--root' || argument === '--version') {
      const value = argumentsList[index + 1];
      if (!value) fail(`${argument} requires a value`);
      if (argument === '--root') options.root = resolve(value);
      else options.version = Number(value);
      index += 1;
    } else {
      fail(`Unknown argument: ${argument}`);
    }
  }
  if (options.command === 'update') {
    if (!Number.isSafeInteger(options.version) || options.version < 1) {
      fail('update requires a positive integer --version');
    }
  }
  return options;
}

try {
  const options = readArguments(process.argv.slice(2));
  if (options.command === 'check') {
    checkCompatibility(options.root);
    console.log('Published contract compatibility baseline is unchanged.');
  } else {
    const created = updateBaseline(options.root, options.version, options.approved);
    console.log(
      created
        ? `Created reviewed compatibility baseline for v${options.version}.`
        : `Published v${options.version} baseline is already up to date.`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

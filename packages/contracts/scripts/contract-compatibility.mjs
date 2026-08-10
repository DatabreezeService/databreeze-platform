import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publishedRegistryPath = 'compatibility/published.json';
const publicOutputInventoryPath = 'public-outputs.json';

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
      const relativePath = toPosix(relative(root, path));
      // uv/hatch editable-install metadata is not a public contract artifact.
      if (
        relativePath === 'python/build' ||
        relativePath.startsWith('python/build/') ||
        /^python\/[^/]+\.egg-info(?:\/|$)/u.test(relativePath)
      ) {
        return [];
      }
      return entry.isDirectory() ? listFiles(root, path) : [relativePath];
    })
    .sort(compareStrings);
}

function resolveInventoryPath(root, path, label) {
  if (typeof path !== 'string' || !path || path.includes('\\')) {
    fail(`${label} must be a non-empty POSIX path`);
  }
  const packageRoot = resolve(root);
  const destination = resolve(packageRoot, ...path.split('/'));
  const relativePath = relative(packageRoot, destination);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    fail(`${label} escapes the contract package: ${path}`);
  }
  return destination;
}

function assertSortedUniqueStrings(values, label) {
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    !values.every((value) => typeof value === 'string')
  ) {
    fail(`${label} must be a non-empty array of strings`);
  }
  const sorted = [...values].sort(compareStrings);
  if (new Set(values).size !== values.length || JSON.stringify(values) !== JSON.stringify(sorted)) {
    fail(`${label} must contain unique values in stable order`);
  }
}

function readPublicOutputInventory(root) {
  const path = resolve(root, publicOutputInventoryPath);
  if (!existsSync(path)) fail(`Public-output inventory is missing: ${publicOutputInventoryPath}`);
  const inventory = parseJson(path, 'Public-output inventory');
  if (inventory.inventoryFormat !== 1 || !Array.isArray(inventory.versions)) {
    fail('Public-output inventory has an unsupported shape');
  }
  const versions = new Set();
  for (const entry of inventory.versions) {
    if (!Number.isInteger(entry.contractVersion) || entry.contractVersion < 1) {
      fail('Public-output inventory contractVersion must be a positive integer');
    }
    if (versions.has(entry.contractVersion)) {
      fail(`Duplicate public-output inventory entry for v${entry.contractVersion}`);
    }
    versions.add(entry.contractVersion);
    assertSortedUniqueStrings(
      entry.generatedFiles,
      `Public-output inventory v${entry.contractVersion} generatedFiles`,
    );
    for (const generatedFile of entry.generatedFiles) {
      if (!generatedFile.startsWith('generated/')) {
        fail(`Generated public output must be below generated/: ${generatedFile}`);
      }
      resolveInventoryPath(root, generatedFile, 'Generated public output');
    }
    if (!Array.isArray(entry.jsonSurfaces) || entry.jsonSurfaces.length === 0) {
      fail(`Public-output inventory v${entry.contractVersion} jsonSurfaces must be non-empty`);
    }
    const surfacePaths = entry.jsonSurfaces.map((surface) => surface.path);
    assertSortedUniqueStrings(
      surfacePaths,
      `Public-output inventory v${entry.contractVersion} json surface paths`,
    );
    for (const surface of entry.jsonSurfaces) {
      resolveInventoryPath(root, surface.path, 'Public JSON surface');
      assertSortedUniqueStrings(
        surface.pointers,
        `Public-output inventory ${surface.path} pointers`,
      );
      if (!surface.pointers.every((pointer) => pointer.startsWith('/'))) {
        fail(`Public JSON surface pointers must use JSON Pointer syntax: ${surface.path}`);
      }
    }
  }
  return inventory;
}

function versionPublicOutputEntry(root, version, published = false) {
  const inventory = readPublicOutputInventory(root);
  const entry = inventory.versions.find((candidate) => candidate.contractVersion === version);
  if (!entry) {
    fail(
      published
        ? `Published public-output inventory changed in place for v${version}`
        : `Public-output inventory has no v${version} entry`,
    );
  }
  return { entry, inventory };
}

function verifyAllGeneratedFilesAreDeclared(root, inventory) {
  const declared = new Set(inventory.versions.flatMap((entry) => entry.generatedFiles));
  const generatedRoot = resolve(root, 'generated');
  const undeclared = listFiles(generatedRoot)
    .map((path) => `generated/${path}`)
    .find((path) => !declared.has(path));
  if (undeclared) {
    fail(`Generated output is not declared in public-output inventory: ${undeclared}`);
  }
}

function jsonPointerValue(document, pointer, label) {
  let current = document;
  for (const token of pointer.slice(1).split('/')) {
    const key = token.replaceAll('~1', '/').replaceAll('~0', '~');
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, key)) {
      fail(`${label} is missing JSON pointer ${pointer}`);
    }
    current = current[key];
  }
  return current;
}

function buildPublicPackageSurfaces(root, entry) {
  return entry.jsonSurfaces.map((surface) => {
    const path = resolveInventoryPath(root, surface.path, 'Public JSON surface');
    if (!existsSync(path)) fail(`Published package surface is missing: ${surface.path}`);
    const document = parseJson(path, `Public package surface ${surface.path}`);
    return {
      path: surface.path,
      values: surface.pointers.map((pointer) => ({
        pointer,
        value: jsonPointerValue(document, pointer, surface.path),
      })),
    };
  });
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

  const { entry: publicOutputEntry, inventory } = versionPublicOutputEntry(root, version);
  verifyAllGeneratedFilesAreDeclared(root, inventory);
  const outputPaths = publicOutputEntry.generatedFiles;
  if (outputPaths.length === 0) fail(`No generated public outputs found for v${version}`);
  const generatedPublicOutputs = outputPaths.map((path) => ({
    path,
    sha256: sha256File(resolveInventoryPath(root, path, 'Generated public output')),
  }));

  return {
    baselineFormat: 2,
    contractVersion: version,
    schemaIdPrefix: expectedIdPrefix,
    schemas,
    publicOutputInventory: {
      path: publicOutputInventoryPath,
      versionEntrySha256: sha256Bytes(formatJson(publicOutputEntry)),
    },
    generatedPublicOutputs,
    publicPackageSurfaces: buildPublicPackageSurfaces(root, publicOutputEntry),
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
  const { entry: publicOutputEntry, inventory } = versionPublicOutputEntry(root, version, true);
  verifyAllGeneratedFilesAreDeclared(root, inventory);
  if (
    baseline.publicOutputInventory?.path !== publicOutputInventoryPath ||
    baseline.publicOutputInventory?.versionEntrySha256 !==
      sha256Bytes(formatJson(publicOutputEntry))
  ) {
    fail(`Published public-output inventory changed in place for v${version}`);
  }

  const baselinePaths = new Set(baseline.generatedPublicOutputs.map((entry) => entry.path));
  for (const expected of baseline.generatedPublicOutputs) {
    const outputPath = resolveInventoryPath(root, expected.path, 'Generated public output');
    if (!existsSync(outputPath)) {
      fail(`Published public output is missing: ${expected.path}`);
    }
    if (sha256File(outputPath) !== expected.sha256) {
      fail(`Published public output changed in place: ${expected.path}`);
    }
  }
  const added = publicOutputEntry.generatedFiles.find((path) => !baselinePaths.has(path));
  if (added) fail(`Public output added to published v${version}: ${added}`);
  const removed = baseline.generatedPublicOutputs.find(
    ({ path }) => !publicOutputEntry.generatedFiles.includes(path),
  );
  if (removed) fail(`Public output removed from published v${version}: ${removed.path}`);

  const currentSurfaces = buildPublicPackageSurfaces(root, publicOutputEntry);
  assertCompatiblePackageSurfaces(baseline.publicPackageSurfaces, currentSurfaces, version);
}

/**
 * Newer contract versions may add sibling package export keys. Published baselines still require
 * every previously locked key/value to remain byte-identical; removals and in-place mutations fail.
 */
function assertCompatiblePackageSurfaces(baselineSurfaces, currentSurfaces, version) {
  if (!Array.isArray(baselineSurfaces) || !Array.isArray(currentSurfaces)) {
    fail(`Published package surface changed in place for v${version}`);
  }
  if (baselineSurfaces.length !== currentSurfaces.length) {
    fail(`Published package surface changed in place for v${version}`);
  }
  for (let index = 0; index < baselineSurfaces.length; index += 1) {
    const expected = baselineSurfaces[index];
    const actual = currentSurfaces[index];
    if (expected.path !== actual.path) {
      fail(`Published package surface changed in place for v${version}`);
    }
    if (expected.values.length !== actual.values.length) {
      fail(`Published package surface changed in place for v${version}`);
    }
    for (let valueIndex = 0; valueIndex < expected.values.length; valueIndex += 1) {
      const expectedValue = expected.values[valueIndex];
      const actualValue = actual.values[valueIndex];
      if (expectedValue.pointer !== actualValue.pointer) {
        fail(`Published package surface changed in place for v${version}`);
      }
      if (!surfaceValueCompatible(expectedValue.value, actualValue.value)) {
        fail(`Published package surface changed in place for v${version}`);
      }
    }
  }
}

function surfaceValueCompatible(expected, actual) {
  if (
    expected !== null &&
    actual !== null &&
    typeof expected === 'object' &&
    typeof actual === 'object' &&
    !Array.isArray(expected) &&
    !Array.isArray(actual)
  ) {
    for (const key of Object.keys(expected).sort(compareStrings)) {
      if (!Object.hasOwn(actual, key)) return false;
      if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) return false;
    }
    return true;
  }
  return JSON.stringify(expected) === JSON.stringify(actual);
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
    if (baseline.baselineFormat !== 2 || baseline.contractVersion !== version) {
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
      if (!value || value.startsWith('--')) fail(`${argument} requires a value`);
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

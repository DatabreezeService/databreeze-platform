import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

function fail(message) {
  throw new Error(message);
}

function parseJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function readArguments(argumentsList) {
  const options = { fixtureManifest: undefined, output: undefined };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--fixture-manifest' || argument === '--output') {
      const value = argumentsList[index + 1];
      if (!value) fail(`${argument} requires a path`);
      options[argument === '--output' ? 'output' : 'fixtureManifest'] = resolve(value);
      index += 1;
    } else {
      fail(`Unknown argument: ${argument}`);
    }
  }
  if (!options.fixtureManifest || !options.output) {
    fail('--fixture-manifest and --output are required');
  }
  return options;
}

function buildCanonicalRegistry(fixtureManifestPath, fixtureManifest) {
  const fixtureRoot = dirname(fixtureManifestPath);
  const schemaManifestPath = resolve(fixtureRoot, fixtureManifest.schemaManifest);
  const contractRoot = dirname(schemaManifestPath);
  const schemaManifest = parseJson(schemaManifestPath, 'Canonical schema manifest');
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const entry of schemaManifest.schemas) {
    const schema = parseJson(resolve(contractRoot, entry.path), `Canonical schema ${entry.name}`);
    if (schema.$id !== entry.id) fail(`Manifest ID does not match ${entry.path}`);
    ajv.addSchema(schema);
  }
  return ajv;
}

try {
  const options = readArguments(process.argv.slice(2));
  const fixtureManifest = parseJson(options.fixtureManifest, 'Fixture manifest');
  const fixtureRoot = dirname(options.fixtureManifest);
  const ajv = buildCanonicalRegistry(options.fixtureManifest, fixtureManifest);
  const results = fixtureManifest.cases.map((fixtureCase) => {
    const validate = ajv.getSchema(fixtureCase.schemaId);
    if (!validate) fail(`Canonical registry has no schema for ${fixtureCase.schemaId}`);
    const payload = parseJson(
      resolve(fixtureRoot, fixtureCase.source),
      `Fixture ${fixtureCase.id}`,
    );
    return { caseId: fixtureCase.id, accepted: validate(payload) };
  });
  writeFileSync(options.output, `${JSON.stringify({ runtime: 'typescript', results })}\n`, 'utf8');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

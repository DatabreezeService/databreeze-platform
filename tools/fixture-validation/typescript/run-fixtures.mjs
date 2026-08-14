import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { parseV1Contract } from '@databreeze/contracts/v1';
import { parseV2Contract } from '@databreeze/contracts/v2';
import { parseV3Contract } from '@databreeze/contracts/v3';
import { parseV4Contract } from '@databreeze/contracts/v4';

function fail(message) {
  throw new Error(message);
}

function parseContract(schemaId, payload) {
  if (schemaId.includes('/contracts/v2/')) {
    return parseV2Contract(schemaId, payload);
  }
  if (schemaId.includes('/contracts/v3/')) {
    return parseV3Contract(schemaId, payload);
  }
  if (schemaId.includes('/contracts/v4/')) {
    return parseV4Contract(schemaId, payload);
  }
  return parseV1Contract(schemaId, payload);
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

try {
  const options = readArguments(process.argv.slice(2));
  const fixtureManifest = parseJson(options.fixtureManifest, 'Fixture manifest');
  const fixtureRoot = dirname(options.fixtureManifest);
  const results = fixtureManifest.cases.map((fixtureCase) => {
    const payload = parseJson(
      resolve(fixtureRoot, fixtureCase.source),
      `Fixture ${fixtureCase.id}`,
    );
    return {
      caseId: fixtureCase.id,
      accepted: parseContract(fixtureCase.schemaId, payload).accepted,
    };
  });
  writeFileSync(options.output, `${JSON.stringify({ runtime: 'typescript', results })}\n`, 'utf8');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

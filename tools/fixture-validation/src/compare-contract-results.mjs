import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const runtimeOrder = ['typescript', 'python', 'kotlin'];

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

export function compareContractResults(fixtureManifestPath, resultPaths) {
  const manifest = parseJson(fixtureManifestPath, 'Fixture manifest');
  if (!Array.isArray(manifest.cases)) fail('Fixture manifest cases must be an array');

  const resultDocuments = resultPaths.map((path) => parseJson(path, `Runtime result ${path}`));
  const byRuntime = new Map();
  for (const document of resultDocuments) {
    if (!runtimeOrder.includes(document.runtime)) fail(`Unexpected runtime: ${document.runtime}`);
    if (byRuntime.has(document.runtime)) fail(`Duplicate runtime result: ${document.runtime}`);
    if (!Array.isArray(document.results)) fail(`${document.runtime} results must be an array`);
    byRuntime.set(document.runtime, document.results);
  }
  for (const runtime of runtimeOrder) {
    if (!byRuntime.has(runtime)) fail(`Missing runtime result: ${runtime}`);
  }

  for (const runtime of runtimeOrder) {
    const results = byRuntime.get(runtime);
    if (results.length !== manifest.cases.length) {
      fail(`${runtime} emitted ${results.length} results for ${manifest.cases.length} cases`);
    }
    for (let index = 0; index < manifest.cases.length; index += 1) {
      const fixtureCase = manifest.cases[index];
      const result = results[index];
      if (result.caseId !== fixtureCase.id) {
        fail(`${runtime} result order changed at ${fixtureCase.id}`);
      }
      if (typeof result.accepted !== 'boolean') {
        fail(`${runtime} emitted a non-boolean result for ${fixtureCase.id}`);
      }
    }
  }

  for (let index = 0; index < manifest.cases.length; index += 1) {
    const fixtureCase = manifest.cases[index];
    const runtimeValues = runtimeOrder.map((runtime) => byRuntime.get(runtime)[index].accepted);
    if (!runtimeValues.every((accepted) => accepted === runtimeValues[0])) {
      const details = runtimeOrder
        .map((runtime, runtimeIndex) => `${runtime}=${runtimeValues[runtimeIndex]}`)
        .join(', ');
      fail(`Runtime disagreement for ${fixtureCase.id}: ${details}`);
    }
    if (runtimeValues[0] !== fixtureCase.expectedAcceptance) {
      fail(
        `Manifest disagreement for ${fixtureCase.id}: expected ${
          fixtureCase.expectedAcceptance ? 'accepted' : 'rejected'
        }, received ${runtimeValues[0] ? 'accepted' : 'rejected'}`,
      );
    }
  }

  const expectedAccepted = manifest.cases.filter(
    (fixtureCase) => fixtureCase.expectedAcceptance,
  ).length;
  return {
    caseCount: manifest.cases.length,
    expectedAccepted,
    expectedRejected: manifest.cases.length - expectedAccepted,
    runtimes: runtimeOrder,
  };
}

function readArguments(argumentsList) {
  const options = { fixtureManifest: undefined, results: [] };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--fixture-manifest' || argument === '--result') {
      const value = argumentsList[index + 1];
      if (!value) fail(`${argument} requires a path`);
      if (argument === '--fixture-manifest') options.fixtureManifest = resolve(value);
      else options.results.push(resolve(value));
      index += 1;
    } else {
      fail(`Unknown argument: ${argument}`);
    }
  }
  if (!options.fixtureManifest) fail('--fixture-manifest is required');
  return options;
}

function runCli() {
  try {
    const options = readArguments(process.argv.slice(2));
    const summary = compareContractResults(options.fixtureManifest, options.results);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) runCli();

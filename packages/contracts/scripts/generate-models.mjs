import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkContractDrift, writeContractFiles } from './contract-generator.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readArguments(argumentsList) {
  const options = {
    check: false,
    output: resolve(packageRoot, 'generated'),
    source: packageRoot,
  };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--check') {
      options.check = true;
    } else if (argument === '--source' || argument === '--output') {
      const value = argumentsList[index + 1];
      if (!value) throw new Error(`${argument} requires a path`);
      options[argument.slice(2)] = resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

try {
  const options = readArguments(process.argv.slice(2));
  if (options.check) {
    checkContractDrift(options.source, options.output);
    console.log('Generated contract files are up to date.');
  } else {
    const count = writeContractFiles(options.source, options.output);
    console.log(`Generated ${count} contract files.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

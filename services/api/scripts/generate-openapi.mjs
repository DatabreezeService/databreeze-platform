import { readFile, mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';

import { format, resolveConfig } from 'prettier';

import { createApiApplication } from '../dist/bootstrap.js';

const artifactUrl = new URL('../openapi/v1.json', import.meta.url);
const artifactPath = fileURLToPath(artifactUrl);
const check = process.argv.includes('--check');
const { app, openApi } = await createApiApplication();

try {
  const prettierConfig = (await resolveConfig(artifactPath)) ?? {};
  const generated = await format(JSON.stringify(openApi), {
    ...prettierConfig,
    filepath: artifactPath,
    parser: 'json',
  });
  if (check) {
    const current = await readFile(artifactUrl, 'utf8').catch(() => undefined);
    if (current !== generated) {
      process.stderr.write(
        'services/api/openapi/v1.json is out of date; run pnpm openapi:generate.\n',
      );
      process.exitCode = 1;
    }
  } else {
    await mkdir(new URL('./', artifactUrl), { recursive: true });
    await writeFile(artifactUrl, generated, 'utf8');
  }
} finally {
  await app.close();
}

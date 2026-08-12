import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../tools/fixture-validation/fixtures/dda/unified-workspace',
);

describe('Desktop unified workspace journey fixture', () => {
  it('loads the golden synthetic fixture without external provider calls', () => {
    const manifest = JSON.parse(readFileSync(path.join(fixtureDir, 'manifest.json'), 'utf8')) as {
      expectations: { providerCalls: number };
    };
    expect(manifest.expectations.providerCalls).toBe(0);
  });
});

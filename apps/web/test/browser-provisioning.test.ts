import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly scripts?: Readonly<Record<string, string>>;
}

function readManifest(path: string): PackageManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest;
}

describe('clean CI browser provisioning', () => {
  it('installs Chromium with its system dependencies before the CI browser suite', () => {
    const webManifest = readManifest(resolve(process.cwd(), 'package.json'));
    const rootManifest = readManifest(resolve(process.cwd(), '../../package.json'));

    expect(webManifest.scripts?.['browser:install:ci']).toBe(
      'playwright install --with-deps chromium',
    );
    expect(rootManifest.scripts?.['web:test:e2e:ci']).toBe(
      'corepack pnpm web:browser:install:ci && corepack pnpm web:test:e2e',
    );
  });

  it('does not install a persistence or service-worker integration', () => {
    const webManifest = readManifest(resolve(process.cwd(), 'package.json'));
    const installedPackages = new Set([
      ...Object.keys(webManifest.dependencies ?? {}),
      ...Object.keys(webManifest.devDependencies ?? {}),
    ]);

    for (const forbiddenPackage of [
      '@tanstack/react-query-persist-client',
      'idb',
      'localforage',
      'vite-plugin-pwa',
      'workbox-window',
    ]) {
      expect(installedPackages.has(forbiddenPackage)).toBe(false);
    }
  });
});

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts']);
const ignoredDirectories = new Set(['node_modules', 'dist', 'build', 'coverage', 'out']);

function parseRoot(argumentsList) {
  const rootFlagIndex = argumentsList.indexOf('--root');

  if (rootFlagIndex === -1) {
    return path.resolve(import.meta.dirname, '..', '..', '..');
  }

  const specifiedRoot = argumentsList[rootFlagIndex + 1];
  if (specifiedRoot === undefined) {
    throw new Error('The --root option requires a repository path.');
  }

  return path.resolve(specifiedRoot);
}

function listFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...listFiles(entryPath));
      }
    } else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files;
}

function listPackageManifests(packagesDirectory) {
  if (!existsSync(packagesDirectory)) {
    return [];
  }

  return readdirSync(packagesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesDirectory, entry.name, 'package.json'))
    .filter(existsSync);
}

function readPackageManifest(manifestPath) {
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

function sourceFileKind(filePath) {
  if (filePath.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }
  return ts.ScriptKind.TS;
}

function importedModules(filePath) {
  const sourceFile = ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    sourceFileKind(filePath),
  );
  const moduleSpecifiers = [];

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      moduleSpecifiers.push(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return moduleSpecifiers;
}

function isWithin(candidatePath, parentPath) {
  const relativePath = path.relative(parentPath, candidatePath);
  return relativePath !== '' && !relativePath.startsWith(`..${path.sep}`) && relativePath !== '..';
}

function featureName(filePath, apiDirectory) {
  const relativePath = path.relative(apiDirectory, filePath).split(path.sep).join('/');
  return /^src\/features\/([^/]+)\//.exec(relativePath)?.[1];
}

function relativePath(repositoryRoot, filePath) {
  return path.relative(repositoryRoot, filePath).split(path.sep).join('/');
}

function diagnostic(rule, repositoryRoot, filePath, detail) {
  return `${relativePath(repositoryRoot, filePath)}: rule=${rule} ${detail}`;
}

function servicePackageNames(apiDirectory) {
  const manifestPath = path.join(apiDirectory, 'package.json');
  if (!existsSync(manifestPath)) {
    return [];
  }
  const manifest = readPackageManifest(manifestPath);
  return typeof manifest.name === 'string' ? [manifest.name] : [];
}

function matchesPackageSpecifier(moduleSpecifier, packageName) {
  return moduleSpecifier === packageName || moduleSpecifier.startsWith(`${packageName}/`);
}

function checkClientImports(repositoryRoot, apiDirectory) {
  const diagnostics = [];
  const clientDirectories = ['web', 'desktop'].map((name) =>
    path.join(repositoryRoot, 'apps', name),
  );
  const apiPackageNames = servicePackageNames(apiDirectory);

  for (const clientDirectory of clientDirectories) {
    for (const filePath of listFiles(clientDirectory)) {
      for (const moduleSpecifier of importedModules(filePath)) {
        const relativeTarget = moduleSpecifier.startsWith('.')
          ? path.resolve(path.dirname(filePath), moduleSpecifier)
          : undefined;
        const importsServiceDirectory =
          relativeTarget !== undefined && isWithin(relativeTarget, apiDirectory);
        const importsServicePackage = apiPackageNames.some((packageName) =>
          matchesPackageSpecifier(moduleSpecifier, packageName),
        );

        if (importsServiceDirectory || importsServicePackage) {
          diagnostics.push(
            diagnostic(
              'clients-must-not-import-service-implementations',
              repositoryRoot,
              filePath,
              `import=${moduleSpecifier}`,
            ),
          );
        }
      }
    }
  }

  return diagnostics;
}

function checkFeaturePersistenceImports(repositoryRoot, apiDirectory) {
  const diagnostics = [];

  for (const filePath of listFiles(path.join(apiDirectory, 'src', 'features'))) {
    const importingFeature = featureName(filePath, apiDirectory);
    if (importingFeature === undefined) {
      continue;
    }

    for (const moduleSpecifier of importedModules(filePath)) {
      const resolvedTarget = moduleSpecifier.startsWith('.')
        ? path.resolve(path.dirname(filePath), moduleSpecifier)
        : undefined;
      const importedFeature =
        resolvedTarget === undefined ? undefined : featureName(resolvedTarget, apiDirectory);
      const importsOtherFeaturePersistence =
        importedFeature !== undefined &&
        importedFeature !== importingFeature &&
        relativePath(apiDirectory, resolvedTarget).includes(
          `/features/${importedFeature}/persistence/`,
        );
      const aliasedFeaturePersistence = /(?:^|\/)features\/([^/]+)\/persistence(?:\/|$)/.exec(
        moduleSpecifier,
      );
      const importsAliasedFeaturePersistence =
        !moduleSpecifier.startsWith('.') &&
        aliasedFeaturePersistence?.[1] !== undefined &&
        aliasedFeaturePersistence[1] !== importingFeature;

      if (importsOtherFeaturePersistence || importsAliasedFeaturePersistence) {
        diagnostics.push(
          diagnostic(
            'features-must-not-import-other-feature-persistence',
            repositoryRoot,
            filePath,
            `import=${moduleSpecifier}`,
          ),
        );
      }
    }
  }

  return diagnostics;
}

function checkPackageExports(repositoryRoot) {
  const diagnostics = [];
  for (const manifestPath of listPackageManifests(path.join(repositoryRoot, 'packages'))) {
    const manifest = readPackageManifest(manifestPath);
    const hasPublicExports =
      (typeof manifest.exports === 'string' && manifest.exports.length > 0) ||
      (typeof manifest.exports === 'object' &&
        manifest.exports !== null &&
        !Array.isArray(manifest.exports) &&
        Object.keys(manifest.exports).length > 0);
    if (!hasPublicExports) {
      diagnostics.push(
        diagnostic(
          'workspace-packages-must-declare-public-exports',
          repositoryRoot,
          manifestPath,
          'missing-or-empty=exports',
        ),
      );
    }
  }
  return diagnostics;
}

function checkRepository(repositoryRoot) {
  const apiDirectory = path.join(repositoryRoot, 'services', 'api');
  return [
    ...checkClientImports(repositoryRoot, apiDirectory),
    ...checkFeaturePersistenceImports(repositoryRoot, apiDirectory),
    ...checkPackageExports(repositoryRoot),
  ].sort();
}

try {
  const repositoryRoot = parseRoot(process.argv.slice(2));
  if (!statSync(repositoryRoot).isDirectory()) {
    throw new Error(`Repository root is not a directory: ${repositoryRoot}`);
  }

  const diagnostics = checkRepository(repositoryRoot);
  if (diagnostics.length > 0) {
    process.stderr.write(`${diagnostics.join('\n')}\n`);
    process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}

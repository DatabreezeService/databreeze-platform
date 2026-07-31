import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const requirementHeader = ['ID', 'Priority', 'Requirement'];
const requirementIdPattern = /^([A-Z][A-Z0-9]*)-(\d{3})$/;
const normativeDirectories = ['foundation', 'features', 'platforms'];

function parseOptions(argumentsList) {
  const options = {
    check: false,
    output: undefined,
    root: path.resolve(import.meta.dirname, '..', '..', '..'),
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--check') {
      options.check = true;
    } else if (argument === '--root' || argument === '--output') {
      const value = argumentsList[index + 1];
      if (value === undefined) {
        throw new Error(`The ${argument} option requires a value.`);
      }
      options[argument.slice(2)] = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (options.output === undefined) {
    options.output = path.join(options.root, 'docs', 'specs', 'requirement-index.json');
  }

  return options;
}

function listMarkdownFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listMarkdownFiles(entryPath);
      }
      return entry.isFile() && path.extname(entry.name) === '.md' ? [entryPath] : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

function isNormativeDocument(filePath) {
  const fileName = path.basename(filePath);
  return (
    fileName !== 'README.md' && fileName !== 'spec-template.md' && !fileName.endsWith('.index.md')
  );
}

function sourcePath(repositoryRoot, filePath) {
  return path.relative(repositoryRoot, filePath).split(path.sep).join('/');
}

function tableCells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
    return undefined;
  }
  return trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

function isRequirementHeader(cells) {
  return (
    cells !== undefined &&
    cells.length === requirementHeader.length &&
    cells.every((cell, index) => cell === requirementHeader[index])
  );
}

function isTableSeparator(cells) {
  return (
    cells !== undefined && cells.length === 3 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
  );
}

function parseRequirements(repositoryRoot, filePath) {
  const requirements = [];
  const diagnostics = [];
  const relativeFilePath = sourcePath(repositoryRoot, filePath);
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    if (!isRequirementHeader(tableCells(lines[index]))) {
      continue;
    }

    const separatorLineNumber = index + 2;
    if (!isTableSeparator(tableCells(lines[index + 1] ?? ''))) {
      diagnostics.push(
        `${relativeFilePath}:${separatorLineNumber}: malformed requirement table separator; expected | --- | --- | --- |`,
      );
      continue;
    }

    index += 1;
    while (index + 1 < lines.length && lines[index + 1].trim().startsWith('|')) {
      index += 1;
      const lineNumber = index + 1;
      const cells = tableCells(lines[index]);
      if (cells === undefined || cells.length !== 3 || cells.some((cell) => cell === '')) {
        diagnostics.push(
          `${relativeFilePath}:${lineNumber}: malformed requirement row; expected | ID | Priority | Requirement |`,
        );
        continue;
      }

      const [id, priority, requirement] = cells;
      const idMatch = requirementIdPattern.exec(id);
      if (idMatch === null) {
        diagnostics.push(
          `${relativeFilePath}:${lineNumber}: malformed requirement ID ${id}; expected PREFIX-NNN`,
        );
        continue;
      }
      if (!['P0', 'P1', 'P2'].includes(priority)) {
        diagnostics.push(
          `${relativeFilePath}:${lineNumber}: malformed priority ${priority} for requirement ${id}; expected P0, P1, or P2`,
        );
        continue;
      }

      requirements.push({
        id,
        prefix: idMatch[1],
        priority,
        requirement,
        sequence: Number(idMatch[2]),
        source: { line: lineNumber, path: relativeFilePath },
      });
    }
  }

  return { diagnostics, requirements };
}

function compareSource(left, right) {
  return left.source.path.localeCompare(right.source.path) || left.source.line - right.source.line;
}

function validationDiagnostics(requirements) {
  const diagnostics = [];
  const requirementsById = new Map();

  for (const requirement of requirements) {
    const first = requirementsById.get(requirement.id);
    if (first === undefined) {
      requirementsById.set(requirement.id, requirement);
    } else {
      diagnostics.push(
        `${requirement.source.path}:${requirement.source.line}: duplicate requirement ID ${requirement.id}; first declared at ${first.source.path}:${first.source.line}`,
      );
    }
  }

  const byPrefix = new Map();
  for (const requirement of requirementsById.values()) {
    const entries = byPrefix.get(requirement.prefix) ?? [];
    entries.push(requirement);
    byPrefix.set(requirement.prefix, entries);
  }
  for (const [prefix, entries] of [...byPrefix.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    let expectedSequence = 1;
    for (const requirement of entries.sort(
      (left, right) => left.sequence - right.sequence || compareSource(left, right),
    )) {
      if (requirement.sequence !== expectedSequence) {
        diagnostics.push(
          `${requirement.source.path}:${requirement.source.line}: prefix ${prefix} has a gap: expected ${prefix}-${String(expectedSequence).padStart(3, '0')} before ${requirement.id}`,
        );
        expectedSequence = requirement.sequence + 1;
      } else {
        expectedSequence += 1;
      }
    }
  }

  return diagnostics.sort((left, right) => left.localeCompare(right));
}

function buildIndex(repositoryRoot) {
  const files = normativeDirectories
    .flatMap((directory) =>
      listMarkdownFiles(path.join(repositoryRoot, 'docs', 'specs', directory)),
    )
    .filter(isNormativeDocument);
  const parsed = files.map((filePath) => parseRequirements(repositoryRoot, filePath));
  const diagnostics = [
    ...parsed.flatMap(({ diagnostics: documentDiagnostics }) => documentDiagnostics),
    ...validationDiagnostics(parsed.flatMap(({ requirements }) => requirements)),
  ].sort((left, right) => left.localeCompare(right));

  if (diagnostics.length > 0) {
    return { diagnostics };
  }

  return {
    index: {
      requirements: parsed
        .flatMap(({ requirements }) => requirements)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(({ id, priority, requirement, source }) => ({ id, priority, requirement, source })),
      version: 1,
    },
  };
}

function run(argumentsList) {
  const options = parseOptions(argumentsList);
  const result = buildIndex(options.root);
  if (result.diagnostics !== undefined) {
    process.stderr.write(`${result.diagnostics.join('\n')}\n`);
    return 1;
  }

  const contents = `${JSON.stringify(result.index, null, 2)}\n`;
  if (options.check) {
    if (!existsSync(options.output) || readFileSync(options.output, 'utf8') !== contents) {
      process.stderr.write(
        `requirement index drift: ${options.output} is missing or differs; run node tools/repo-cli/src/generate-requirement-index.mjs --output ${options.output}\n`,
      );
      return 1;
    }
    return 0;
  }

  mkdirSync(path.dirname(options.output), { recursive: true });
  writeFileSync(options.output, contents);
  return 0;
}

try {
  process.exitCode = run(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}

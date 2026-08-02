import { spawnSync } from 'node:child_process';

const defaultCandidates =
  process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];

export function resolvePythonInterpreter(candidates = defaultCandidates) {
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (result.status === 0 && /^Python 3\./u.test(`${result.stdout}${result.stderr}`)) {
      return candidate;
    }
  }

  throw new Error(`Python 3 interpreter is required; tried: ${candidates.join(', ')}`);
}

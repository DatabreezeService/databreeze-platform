import { describe, expect, it } from 'vitest';
import { createSidecarLaunchPlan } from '../src/application/sidecar-lifecycle.port.ts';

function validPlan() {
  return {
    argv: ['--stdio', '--protocol', '1'],
    attemptDirectoryHandle: 'attempt_01JZZZZZZZZZZZZZZZZZZZZZZZ',
    environment: [
      { name: 'LANG', value: 'vi_VN.UTF-8' },
      { name: 'PYTHONUTF8', value: '1' },
    ],
    executable: {
      path: 'C:\\Program Files\\DataBreeze\\engine\\databreeze-engine.exe',
      sha256: 'a'.repeat(64),
    },
    protocol: { maxFrameBytes: 16 * 1024 * 1024, version: '1' },
    resources: { maxMemoryMiB: 512, maxStderrBytes: 64 * 1024, timeoutMs: 60_000 },
    workDirectoryHandle: 'work_01JZZZZZZZZZZZZZZZZZZZZZZZ',
  } as const;
}

describe('DSK-008 partial sidecar launch-plan contract', () => {
  it('freezes an explicit trusted executable, argv, shell false, scrubbed env, and bounds', () => {
    const plan = createSidecarLaunchPlan(validPlan());

    expect(plan).toMatchObject({ shell: false });
    expect(plan.executable.path).toMatch(/databreeze-engine\.exe$/);
    expect(plan.argv).toEqual(['--stdio', '--protocol', '1']);
    expect(plan.environment).toEqual({ LANG: 'vi_VN.UTF-8', PYTHONUTF8: '1' });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.argv)).toBe(true);
    expect(Object.isFrozen(plan.environment)).toBe(true);
  });

  it('rejects relative executables, command strings, unsafe env, secrets, and unbounded metadata', () => {
    expect(() =>
      createSidecarLaunchPlan({
        ...validPlan(),
        executable: { ...validPlan().executable, path: '.\\engine.exe' },
      }),
    ).toThrow('SIDECAR_PLAN_REJECTED');
    expect(() =>
      createSidecarLaunchPlan({ ...validPlan(), command: 'engine.exe --stdio' } as never),
    ).toThrow('SIDECAR_PLAN_REJECTED');
    expect(() =>
      createSidecarLaunchPlan({
        ...validPlan(),
        environment: [{ name: 'DATABASE_URL', value: 'secret' }],
      } as never),
    ).toThrow('SIDECAR_PLAN_REJECTED');
    expect(() =>
      createSidecarLaunchPlan({
        ...validPlan(),
        argv: new Array(65).fill('--argument'),
      }),
    ).toThrow('SIDECAR_PLAN_REJECTED');
    expect(() =>
      createSidecarLaunchPlan({
        ...validPlan(),
        protocol: { maxFrameBytes: 16 * 1024 * 1024 + 1, version: '1' },
      }),
    ).toThrow('SIDECAR_PLAN_REJECTED');
  });
});

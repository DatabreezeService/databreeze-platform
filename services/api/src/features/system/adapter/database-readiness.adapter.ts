import type { ReadinessPort } from '../application/readiness.port.js';

const DEFAULT_DATABASE_READINESS_DEADLINE_MS = 1_000;

export class DatabaseReadinessAdapter implements ReadinessPort {
  constructor(
    private readonly probe: () => Promise<unknown>,
    private readonly deadlineMs = DEFAULT_DATABASE_READINESS_DEADLINE_MS,
  ) {}

  async check(): Promise<boolean> {
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve()
          .then(this.probe)
          .then(
            () => true,
            () => false,
          ),
        new Promise<false>((resolve) => {
          deadline = setTimeout(() => resolve(false), this.deadlineMs);
        }),
      ]);
    } finally {
      if (deadline !== undefined) clearTimeout(deadline);
    }
  }
}

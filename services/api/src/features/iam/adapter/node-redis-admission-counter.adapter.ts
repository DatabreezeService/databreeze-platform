import type { RedisEvalClientPortV1 } from './redis-recovery-admission.adapter.js';

export interface NodeRedisEvalPortV1 {
  eval(
    script: string,
    options: { readonly keys: readonly string[]; readonly arguments: readonly string[] },
  ): Promise<unknown>;
}

/** Adapts node-redis's explicit options object to the shared atomic admission counter port. */
export class NodeRedisEvalClientAdapter implements RedisEvalClientPortV1 {
  public constructor(private readonly client: NodeRedisEvalPortV1) {}

  public async eval(
    script: string,
    keys: readonly string[],
    arguments_: readonly string[],
  ): Promise<unknown> {
    if (
      typeof script !== 'string' ||
      script.length === 0 ||
      script.length > 4_096 ||
      keys.length !== 1 ||
      keys[0] === undefined ||
      keys[0].length === 0 ||
      keys[0].length > 256 ||
      arguments_.length !== 1 ||
      arguments_[0] === undefined ||
      !/^\d{1,8}$/u.test(arguments_[0])
    ) {
      throw new Error('IAM_REDIS_ADMISSION_INPUT_INVALID');
    }
    return this.client.eval(script, {
      keys: [keys[0]],
      arguments: [arguments_[0]],
    });
  }
}

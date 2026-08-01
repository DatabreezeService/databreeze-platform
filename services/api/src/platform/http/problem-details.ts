import type { ProblemDetails } from '@databreeze/contracts/v1';

export interface ProblemInput {
  readonly code: string;
  readonly correlationId: string;
  readonly fieldErrors?: ProblemDetails['fieldErrors'];
  readonly messageKey: string;
  readonly retryable: boolean;
  readonly status: number;
}

export function createProblem(input: ProblemInput): ProblemDetails {
  return {
    type: `/problems/${input.code.toLowerCase().replaceAll('_', '-')}`,
    status: input.status,
    code: input.code,
    correlationId: input.correlationId,
    retryable: input.retryable,
    messageKey: input.messageKey,
    ...(input.fieldErrors === undefined ? {} : { fieldErrors: input.fieldErrors }),
  };
}

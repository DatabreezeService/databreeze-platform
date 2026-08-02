import { HttpException, HttpStatus } from '@nestjs/common';

export interface SafeFieldError {
  readonly code: string;
  readonly field: string;
}

export class InputValidationException extends HttpException {
  constructor(readonly fieldErrors: readonly SafeFieldError[]) {
    super('Input validation failed', HttpStatus.BAD_REQUEST);
  }
}

import { ValidationPipe, type ValidationError } from '@nestjs/common';

import { InputValidationException, type SafeFieldError } from './input-validation.exception.js';

const constraintCodes: Readonly<Record<string, string>> = {
  isDefined: 'REQUIRED',
  isIn: 'UNSUPPORTED_VALUE',
  isString: 'INVALID_TYPE',
  matches: 'INVALID_FORMAT',
  maxLength: 'TOO_LONG',
};
const constraintPriority = ['isString', 'isDefined', 'isIn', 'matches', 'maxLength'];

function fieldErrors(errors: readonly ValidationError[]): readonly SafeFieldError[] {
  if (errors.some((error) => error.constraints?.['whitelistValidation'] !== undefined)) {
    return [{ field: 'request', code: 'UNKNOWN_FIELD' }];
  }

  const safeErrors: SafeFieldError[] = [];
  const visit = (error: ValidationError, parent?: string): void => {
    const field = parent === undefined ? error.property : `${parent}.${error.property}`;
    const constraint = constraintPriority.find(
      (candidate) => error.constraints?.[candidate] !== undefined,
    );
    if (constraint !== undefined) {
      safeErrors.push({ field, code: constraintCodes[constraint] ?? 'INVALID_VALUE' });
      return;
    }
    for (const child of error.children ?? []) visit(child, field);
  };
  for (const error of errors) visit(error);
  return safeErrors.length > 0 ? safeErrors : [{ field: 'request', code: 'INVALID_VALUE' }];
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    exceptionFactory: (errors) => new InputValidationException(fieldErrors(errors)),
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    validationError: { target: false, value: false },
    whitelist: true,
  });
}

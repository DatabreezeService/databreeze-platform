/** Returns true for Prisma's bounded unique-constraint error shape. */
export function isPrismaUniqueConstraintViolationV1(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'P2002'
  );
}

export function prismaUniqueConstraintTargetV1(error: unknown): readonly string[] | undefined {
  if (!isPrismaUniqueConstraintViolationV1(error)) return undefined;
  const target =
    typeof error === 'object' && error !== null && 'meta' in error
      ? (error as { readonly meta?: { readonly target?: unknown } }).meta?.target
      : undefined;
  return Array.isArray(target) &&
    target.every((field): field is string => typeof field === 'string')
    ? target
    : undefined;
}

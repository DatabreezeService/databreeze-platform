/** Returns true for Prisma's bounded unique-constraint error shape. */
export function isPrismaUniqueConstraintViolationV1(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'P2002'
  );
}

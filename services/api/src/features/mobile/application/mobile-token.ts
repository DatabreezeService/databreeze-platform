import { createHash } from 'node:crypto';

export function sha256MobileToken(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

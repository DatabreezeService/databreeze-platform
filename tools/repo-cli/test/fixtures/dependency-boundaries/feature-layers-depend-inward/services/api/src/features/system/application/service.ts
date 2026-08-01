import { decide } from '../domain/decision.js';

export function execute(): boolean {
  return decide();
}

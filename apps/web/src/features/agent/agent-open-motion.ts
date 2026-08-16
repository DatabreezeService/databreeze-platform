export type AgentOpenMotionV1 = 'from-bubble' | 'fade';

export function resolveAgentOpenMotion(): AgentOpenMotionV1 {
  return typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'fade'
    : 'from-bubble';
}

/** IAM-023 platform-aware session duration policy. Access tokens remain ≤ 15 minutes. */
export type SessionClientPlatformV1 = 'android' | 'desktop' | 'web';

export interface SessionPolicyDurationsV1 {
  readonly accessTokenSeconds: number;
  readonly inactivitySeconds: number;
  readonly absoluteSeconds: number;
}

export const SESSION_ACCESS_TOKEN_SECONDS_V1 = 15 * 60;

export const SESSION_POLICY_V1: Readonly<Record<SessionClientPlatformV1, SessionPolicyDurationsV1>> =
  Object.freeze({
    web: Object.freeze({
      accessTokenSeconds: SESSION_ACCESS_TOKEN_SECONDS_V1,
      inactivitySeconds: 30 * 24 * 60 * 60,
      absoluteSeconds: 180 * 24 * 60 * 60,
    }),
    desktop: Object.freeze({
      accessTokenSeconds: SESSION_ACCESS_TOKEN_SECONDS_V1,
      inactivitySeconds: 90 * 24 * 60 * 60,
      absoluteSeconds: 365 * 24 * 60 * 60,
    }),
    android: Object.freeze({
      accessTokenSeconds: SESSION_ACCESS_TOKEN_SECONDS_V1,
      inactivitySeconds: 90 * 24 * 60 * 60,
      absoluteSeconds: 365 * 24 * 60 * 60,
    }),
  });

export function sessionPolicyForPlatformV1(
  clientPlatform: SessionClientPlatformV1,
): SessionPolicyDurationsV1 {
  return SESSION_POLICY_V1[clientPlatform];
}

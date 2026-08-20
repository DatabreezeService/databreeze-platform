import {
  hasOnlyKeysBrowser,
  isRecordBrowser,
  parseStableIdentifierBrowser,
  parseStrictUtcTimestampBrowser,
} from '../../lib/browser-validation.ts';
import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';

export type DeviceStatus = 'PENDING' | 'ACTIVE' | 'REVOKED';
export type DevicePlatform = 'WINDOWS' | 'ANDROID';

export interface DeviceRow {
  readonly id: string;
  readonly platform: DevicePlatform;
  readonly status: DeviceStatus;
  readonly enrolledAt: string;
  readonly activatedAt?: string;
  readonly revokedAt?: string;
  readonly securityEpoch: number;
  readonly revision: number;
}

export class DeviceReadError extends Error {
  public readonly code: 'UNAVAILABLE' | 'FORBIDDEN' | 'INVALID_RESPONSE';

  public constructor(code: DeviceReadError['code']) {
    super(`DEVICE_${code}`);
    this.name = 'DeviceReadError';
    this.code = code;
  }
}

function apiBaseUrl(): string {
  const configured: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
  return typeof configured === 'string' && configured.trim() !== ''
    ? configured.replace(/\/$/u, '')
    : '';
}

function optionalTimestamp(input: unknown): string | undefined {
  if (input === undefined) return undefined;
  const parsed = parseStrictUtcTimestampBrowser(input);
  return parsed.accepted ? parsed.value : undefined;
}

function parseDevice(input: unknown): DeviceRow | undefined {
  if (
    !isRecordBrowser(input) ||
    !hasOnlyKeysBrowser(input, [
      'schemaVersion',
      'id',
      'userId',
      'organizationId',
      'platform',
      'publicKey',
      'installationIdHash',
      'keyAlgorithm',
      'status',
      'securityEpoch',
      'enrolledAt',
      'activatedAt',
      'revokedAt',
      'revision',
    ]) ||
    input['schemaVersion'] !== 1 ||
    input['keyAlgorithm'] !== 'ED25519' ||
    !['WINDOWS', 'ANDROID'].includes(input['platform'] as string) ||
    !['PENDING', 'ACTIVE', 'REVOKED'].includes(input['status'] as string)
  )
    return undefined;
  const id = parseStableIdentifierBrowser(input['id']);
  const enrolledAt = parseStrictUtcTimestampBrowser(input['enrolledAt']);
  const activatedAt = optionalTimestamp(input['activatedAt']);
  const revokedAt = optionalTimestamp(input['revokedAt']);
  if (
    !id.accepted ||
    !enrolledAt.accepted ||
    (input['activatedAt'] !== undefined && activatedAt === undefined) ||
    (input['revokedAt'] !== undefined && revokedAt === undefined) ||
    typeof input['securityEpoch'] !== 'number' ||
    !Number.isSafeInteger(input['securityEpoch']) ||
    input['securityEpoch'] < 1 ||
    typeof input['revision'] !== 'number' ||
    !Number.isSafeInteger(input['revision']) ||
    input['revision'] < 1
  )
    return undefined;
  return Object.freeze({
    id: id.value,
    platform: input['platform'] as DevicePlatform,
    status: input['status'] as DeviceStatus,
    enrolledAt: enrolledAt.value,
    ...(activatedAt === undefined ? {} : { activatedAt }),
    ...(revokedAt === undefined ? {} : { revokedAt }),
    securityEpoch: input['securityEpoch'],
    revision: input['revision'],
  });
}

export async function listDevices(organizationId: string): Promise<readonly DeviceRow[]> {
  let response: Response;
  try {
    response = await createSessionAwareFetchV1({
      apiBaseUrl: apiBaseUrl(),
      fetcher: globalThis.fetch.bind(globalThis),
    })(`${apiBaseUrl()}/v1/organizations/${encodeURIComponent(organizationId)}/devices`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
  } catch {
    throw new DeviceReadError('UNAVAILABLE');
  }
  if (response.status === 403) throw new DeviceReadError('FORBIDDEN');
  if (!response.ok) throw new DeviceReadError('UNAVAILABLE');
  const payload: unknown = await response.json().catch(() => undefined);
  if (!isRecordBrowser(payload) || payload['accepted'] !== true || !Array.isArray(payload['value']))
    throw new DeviceReadError('INVALID_RESPONSE');
  const devices = payload['value'].map(parseDevice);
  if (devices.some((device) => device === undefined)) throw new DeviceReadError('INVALID_RESPONSE');
  return Object.freeze(devices as DeviceRow[]);
}

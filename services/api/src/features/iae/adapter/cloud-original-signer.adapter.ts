import { createHmac, createHash } from 'node:crypto';

import type {
  CloudOriginalSignerPortV1,
  CloudOriginalSignerResultV1,
  CloudOriginalSigningInputV1,
} from '../application/original-view.service.js';

export interface AwsSigV4CredentialsV1 {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
}

export interface AwsSigV4CredentialProviderV1 {
  resolve(): Promise<AwsSigV4CredentialsV1 | undefined>;
}

export interface S3OriginalSigningConfigV1 {
  readonly bucket: string;
  readonly region: string;
  readonly endpoint?: string;
  readonly maxExpiresSeconds?: number;
}

const safeBucket = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u;
const safeReference = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,255}$/u;

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalQuery(parameters: ReadonlyMap<string, string>): string {
  return [...parameters.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encode(key)}=${encode(value)}`)
    .join('&');
}

function awsTimestamp(input: Date): { readonly date: string; readonly shortDate: string } {
  const iso = input
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}Z$/u, 'Z');
  return { date: iso, shortDate: iso.slice(0, 8) };
}

function canonicalHost(url: URL): string {
  return url.port === '' ? url.hostname : `${url.hostname}:${url.port}`;
}

/** Fail-closed adapter used when cloud signing has not been provisioned. */
export class UnavailableCloudOriginalSignerAdapter implements CloudOriginalSignerPortV1 {
  public sign(_input: CloudOriginalSigningInputV1): Promise<CloudOriginalSignerResultV1> {
    void _input;
    return Promise.resolve({ accepted: false, code: 'SIGNING_UNAVAILABLE' });
  }
}

/**
 * IAE-owned AWS S3 SigV4 adapter. The caller supplies credentials through a provider; this
 * class never reads or logs secrets and never returns an unsigned/fake URL.
 */
export class S3CloudOriginalSignerAdapter implements CloudOriginalSignerPortV1 {
  public constructor(
    private readonly config: S3OriginalSigningConfigV1,
    private readonly credentials: AwsSigV4CredentialProviderV1,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async sign(input: CloudOriginalSigningInputV1): Promise<CloudOriginalSignerResultV1> {
    if (
      !safeBucket.test(this.config.bucket) ||
      !/^[a-z0-9-]+$/u.test(this.config.region) ||
      !safeReference.test(input.placementReference) ||
      input.placementReference.includes('..') ||
      input.disposition !== 'ORIGINAL'
    )
      return { accepted: false, code: 'SIGNING_REJECTED' };
    const expiresSeconds = Math.floor(
      (Date.parse(input.expiresAt) - Date.parse(input.issuedAt)) / 1000,
    );
    const maxExpiresSeconds = this.config.maxExpiresSeconds ?? 300;
    if (expiresSeconds < 1 || expiresSeconds > maxExpiresSeconds)
      return { accepted: false, code: 'SIGNING_REJECTED' };
    let credential: AwsSigV4CredentialsV1 | undefined;
    try {
      credential = await this.credentials.resolve();
    } catch {
      return { accepted: false, code: 'SIGNING_UNAVAILABLE' };
    }
    if (
      !credential ||
      !/^[A-Z0-9]{8,128}$/u.test(credential.accessKeyId) ||
      credential.secretAccessKey.length < 16
    )
      return { accepted: false, code: 'SIGNING_UNAVAILABLE' };

    const endpoint = this.config.endpoint ?? `https://s3.${this.config.region}.amazonaws.com`;
    let base: URL;
    try {
      base = new URL(endpoint);
    } catch {
      return { accepted: false, code: 'SIGNING_REJECTED' };
    }
    if (base.protocol !== 'https:') return { accepted: false, code: 'SIGNING_REJECTED' };
    const host = canonicalHost(base);
    const pathPrefix = base.pathname.replace(/\/+$/u, '');
    const canonicalPath = `${pathPrefix}/${encode(this.config.bucket)}/${encode(input.placementReference)}`;
    const signedAt = this.clock();
    const { date, shortDate } = awsTimestamp(signedAt);
    const scope = `${shortDate}/${this.config.region}/s3/aws4_request`;
    const parameters = new Map<string, string>([
      ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
      ['X-Amz-Credential', `${credential.accessKeyId}/${scope}`],
      ['X-Amz-Date', date],
      ['X-Amz-Expires', String(expiresSeconds)],
      ['X-Amz-SignedHeaders', 'host'],
    ]);
    if (credential.sessionToken) parameters.set('X-Amz-Security-Token', credential.sessionToken);
    const query = canonicalQuery(parameters);
    const canonicalHeaders = `host:${host}\n`;
    const canonicalRequest = [
      'GET',
      canonicalPath,
      query,
      canonicalHeaders,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = ['AWS4-HMAC-SHA256', date, scope, hash(canonicalRequest)].join('\n');
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${credential.secretAccessKey}`, shortDate), this.config.region), 's3'),
      'aws4_request',
    );
    const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
    parameters.set('X-Amz-Signature', signature);
    const signedUrl = `${base.origin}${canonicalPath}?${canonicalQuery(parameters)}`;
    return {
      accepted: true,
      value: {
        signedDescriptor: signedUrl,
        expiresAt: input.expiresAt,
      },
    };
  }
}

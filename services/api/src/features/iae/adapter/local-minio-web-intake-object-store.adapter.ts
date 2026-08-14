import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import type { LocalWebIntakeObjectStorePortV1 } from '../application/local-web-intake.port.js';

const UUID_SEGMENT = '[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

/** Plan 408 local-only object store. It deliberately has no AWS KMS or public URL behavior. */
export class LocalMinioWebIntakeObjectStoreAdapter implements LocalWebIntakeObjectStorePortV1 {
  public constructor(
    private readonly options: {
      readonly client: S3Client;
      readonly bucket: string;
    },
  ) {}

  public async put(input: {
    readonly objectKey: string;
    readonly bytes: Uint8Array;
    readonly contentSha256: string;
    readonly mediaType: string;
  }): Promise<void> {
    this.validateKey(input.objectKey);
    if (!/^[a-f0-9]{64}$/u.test(input.contentSha256)) throw new Error('LOCAL_MINIO_HASH_INVALID');
    await this.options.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: input.objectKey,
        Body: Buffer.from(input.bytes),
        ContentLength: input.bytes.byteLength,
        ContentType: input.mediaType,
        ChecksumSHA256: Buffer.from(input.contentSha256, 'hex').toString('base64'),
      }),
    );
  }

  public async delete(objectKey: string): Promise<void> {
    this.validateKey(objectKey);
    await this.options.client.send(
      new DeleteObjectCommand({ Bucket: this.options.bucket, Key: objectKey }),
    );
  }

  private validateKey(value: string): void {
    const pattern = new RegExp(
      `^local/web-intake/${UUID_SEGMENT}/${UUID_SEGMENT}/${UUID_SEGMENT}$`,
    );
    if (!pattern.test(value)) throw new Error('LOCAL_MINIO_OBJECT_KEY_INVALID');
  }
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const payloadClasses = [
  'CONTROL_METADATA',
  'APPROVED_DERIVED_RESULT',
  'RECONSTRUCTABLE_DERIVED_CONTENT',
] as const;

export class CreateDeviceSyncOperationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  operationId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  deviceId!: string;

  @ApiProperty({ additionalProperties: true })
  @IsObject()
  tenantScope!: Record<string, unknown>;

  @ApiProperty({ minLength: 1, maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  entityType!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  entityId!: string;

  @ApiProperty({ enum: ['UPSERT', 'DELETE', 'ACKNOWLEDGE'] })
  @IsIn(['UPSERT', 'DELETE', 'ACKNOWLEDGE'])
  kind!: 'UPSERT' | 'DELETE' | 'ACKNOWLEDGE';

  @ApiProperty({ enum: payloadClasses })
  @IsIn(payloadClasses)
  payloadClass!: (typeof payloadClasses)[number];

  @ApiProperty({ minLength: 64, maxLength: 128 })
  @IsString()
  @MinLength(64)
  @MaxLength(128)
  payloadDigest!: string;

  @ApiPropertyOptional({ maxLength: 16_384 })
  @IsOptional()
  @IsString()
  @MaxLength(16_384)
  encryptedPayload?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 64 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsUUID(undefined, { each: true })
  dependencyIds?: string[];

  @ApiPropertyOptional({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  baseRevision?: number;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  createdAt!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  policyVersionId?: string;

  @ApiPropertyOptional({ enum: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'] })
  @IsOptional()
  @IsIn(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'])
  classification?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
}

export class TransitionDeviceSyncOperationDto {
  @ApiProperty({ enum: ['ACCEPT', 'APPLY', 'CONFLICT', 'QUARANTINE', 'REJECT'] })
  @IsIn(['ACCEPT', 'APPLY', 'CONFLICT', 'QUARANTINE', 'REJECT'])
  transition!: 'ACCEPT' | 'APPLY' | 'CONFLICT' | 'QUARANTINE' | 'REJECT';

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  at!: string;
}

export class CreateDeviceSyncConflictDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  conflictId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  operationId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  deviceId!: string;

  @ApiProperty({ additionalProperties: true })
  @IsObject()
  tenantScope!: Record<string, unknown>;

  @ApiProperty({ minLength: 1, maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  entityType!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  entityId!: string;

  @ApiProperty({
    enum: [
      'REVISION_MISMATCH',
      'POLICY_CHANGED',
      'DUPLICATE_EFFECT',
      'REVOKED_DEVICE',
      'DEPENDENCY_UNAVAILABLE',
      'PAYLOAD_NOT_ALLOWED',
    ],
  })
  @IsIn([
    'REVISION_MISMATCH',
    'POLICY_CHANGED',
    'DUPLICATE_EFFECT',
    'REVOKED_DEVICE',
    'DEPENDENCY_UNAVAILABLE',
    'PAYLOAD_NOT_ALLOWED',
  ])
  reason!: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedRevision?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  actualRevision?: number;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  detectedAt!: string;
}

export class CreateStrictLocalPackageDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  packageId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  deviceId!: string;

  @ApiProperty({ additionalProperties: true })
  @IsObject()
  tenantScope!: Record<string, unknown>;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  purpose!: string;

  @ApiProperty({ minLength: 1, maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  destinationClass!: string;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 64 })
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  itemDigests!: string[];

  @ApiProperty({ minLength: 64, maxLength: 128 })
  @IsString()
  @MinLength(64)
  @MaxLength(128)
  packageDigest!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  issuedAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  expiresAt!: string;
}

export class CreateDeviceTransferReceiptDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  receiptId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  packageId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  deviceId!: string;

  @ApiProperty({ minLength: 1, maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  destinationClass!: string;

  @ApiProperty({ minLength: 64, maxLength: 128 })
  @IsString()
  @MinLength(64)
  @MaxLength(128)
  packageDigest!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  receivedAt!: string;

  @ApiProperty()
  manifestVerified!: boolean;

  @ApiProperty({ enum: ['ACCEPTED', 'REJECTED', 'QUARANTINED'] })
  @IsIn(['ACCEPTED', 'REJECTED', 'QUARANTINED'])
  status!: 'ACCEPTED' | 'REJECTED' | 'QUARANTINED';
}

export class PullDeviceSyncDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  grantId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  deviceId!: string;

  @ApiProperty({ additionalProperties: true })
  @IsObject()
  cursor!: Record<string, unknown>;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  now!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  minimumRevision!: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  nextCursorId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 256 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(256)
  pageSize?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  policyVersionId?: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  policyDigest?: string;

  @ApiPropertyOptional({ enum: ['Local', 'Hybrid', 'Cloud'] })
  @IsOptional()
  @IsIn(['Local', 'Hybrid', 'Cloud'])
  dataMode?: 'Local' | 'Hybrid' | 'Cloud';

  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  protocolVersion?: string;
}

export class BootstrapDeviceSyncCursorDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() grantId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() deviceId!: string;
  @ApiProperty({ format: 'date-time' }) @IsISO8601() now!: string;
  @ApiPropertyOptional({ enum: ['Local', 'Hybrid', 'Cloud'] }) @IsOptional() @IsIn(['Local', 'Hybrid', 'Cloud']) dataMode?: 'Local' | 'Hybrid' | 'Cloud';
  @ApiPropertyOptional({ maxLength: 32 }) @IsOptional() @IsString() @MaxLength(32) protocolVersion?: string;
}

export class PushDeviceSyncDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  grantId!: string;

  @ApiProperty({ additionalProperties: true })
  @IsObject()
  batch!: Record<string, unknown>;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  now!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  minimumRevision!: number;
}

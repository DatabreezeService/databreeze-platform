import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

const unlockModes = ['LOCAL_SECRET_INPUT', 'DEVICE_KEYCHAIN'] as const;
const unlockOutcomes = ['UNLOCKED', 'FAILED'] as const;
const failureCodes = [
  'UNLOCK_REJECTED',
  'LOCAL_DEVICE_UNAVAILABLE',
  'UNSUPPORTED_DOCUMENT',
  'MAX_ATTEMPTS',
] as const;

export class CreateProtectedDocumentUnlockDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  requestId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  artifactVersionId!: string;

  @ApiProperty({ enum: unlockModes })
  @IsIn(unlockModes)
  mode!: (typeof unlockModes)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxAttempts?: number;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  expiresAt!: string;
}

export class RecordProtectedDocumentUnlockOutcomeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  handleId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @ApiProperty({ enum: unlockOutcomes })
  @IsIn(unlockOutcomes)
  outcome!: (typeof unlockOutcomes)[number];

  @ApiPropertyOptional({ enum: failureCodes })
  @IsOptional()
  @IsIn(failureCodes)
  failureCode?: (typeof failureCodes)[number];

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  occurredAt!: string;
}

export class ExpireProtectedDocumentUnlockDto {
  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  now!: string;
}

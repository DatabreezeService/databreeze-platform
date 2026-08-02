import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from 'class-validator';

const capabilityTypes = [
  'APPROVED_FOLDER',
  'LOCAL_PROCESSOR',
  'CAPTURE',
  'EVIDENCE_RENDER',
  'LOCAL_NOTIFICATION',
] as const;
const classifications = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'] as const;
const payloadClasses = [
  'CONTROL_METADATA',
  'APPROVED_DERIVED_RESULT',
  'RECONSTRUCTABLE_DERIVED_CONTENT',
  'ORIGINAL_CONTENT',
] as const;

export class ReportDeviceCapabilityDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  capabilityId!: string;

  @ApiProperty({ enum: capabilityTypes })
  @IsIn(capabilityTypes)
  type!: (typeof capabilityTypes)[number];

  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  opaqueLocalHandle?: string;

  @ApiProperty({ minLength: 64, maxLength: 128 })
  @Matches(/^[a-f0-9]{64,128}$/u)
  constraintDigest!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  reportedAt!: string;
}

export class IssueDeviceGrantDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  grantId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  deviceId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  capabilityId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workspaceId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  authorizationEpoch!: number;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 64 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(64)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(64, { each: true })
  allowedActionTypes!: string[];

  @ApiProperty({ enum: classifications, isArray: true, minItems: 1, maxItems: 4 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsIn(classifications, { each: true })
  allowedDataClassifications!: (typeof classifications)[number][];

  @ApiProperty({ enum: payloadClasses, isArray: true, minItems: 1, maxItems: 4 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsIn(payloadClasses, { each: true })
  synchronizationPayloadClasses!: (typeof payloadClasses)[number][];

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  issuedAt!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

export class DeviceCapabilityRevisionDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRevision!: number;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  at!: string;
}

export class DeviceGrantRevisionDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRevision!: number;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type {
  JraWorkerResultFinalizeAccepted,
  JraWorkerResultPrepareAccepted,
  PreparedOutput,
} from '@databreeze/contracts/v4';

// eslint-disable-next-line no-control-regex
const leaseTokenPattern = /^[^\u0000-\u001f\u007f-\u009f]{1,512}$/u;
const strictTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const opaqueReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,255}$/u;

abstract class WorkerAttemptRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  attemptId!: string;

  @ApiProperty({ minLength: 1, maxLength: 512, writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  @Matches(leaseTokenPattern)
  leaseToken!: string;

  @ApiProperty({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRevision!: number;
}

export class WorkerClaimDto extends WorkerAttemptRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  descriptorId!: string;

  @ApiProperty({ minLength: 64, maxLength: 64 })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  descriptorHash!: string;

  @ApiProperty({ minLength: 64, maxLength: 64 })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  attemptBindingHash!: string;
}

export class WorkerHeartbeatDto extends WorkerAttemptRequestDto {
  @ApiProperty({ format: 'date-time', pattern: strictTimestampPattern.source })
  @IsString()
  @Matches(strictTimestampPattern)
  nextLeaseExpiresAt!: string;
}

export class WorkerPrepareResultDto extends WorkerAttemptRequestDto {
  @ApiProperty({ enum: [4] })
  @IsIn([4])
  schemaVersion!: 4;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u)
  idempotencyKey!: string;

  @ApiProperty({ type: () => [WorkerOutputDeclarationDto], minItems: 1, maxItems: 32 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => WorkerOutputDeclarationDto)
  outputs!: WorkerOutputDeclarationDto[];
}

export class WorkerOutputDeclarationDto {
  @ApiProperty({ enum: ['JSON_RESULT', 'BINARY_RESULT'] })
  @IsIn(['JSON_RESULT', 'BINARY_RESULT'])
  kind!: 'JSON_RESULT' | 'BINARY_RESULT';

  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @Matches(/^[a-z][a-z0-9_.-]{0,127}$/u)
  outputName!: string;

  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @Matches(/^[a-z][a-z0-9_.-]{0,127}$/u)
  schemaId!: string;

  @ApiProperty({ minLength: 3, maxLength: 255 })
  @IsString()
  @Matches(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u)
  mediaType!: string;

  @ApiProperty({ minLength: 64, maxLength: 64 })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  contentSha256!: string;

  @ApiProperty({ minimum: 1, maximum: 1_073_741_824 })
  @IsInt()
  @Min(1)
  @Max(1_073_741_824)
  byteLength!: number;

  @ApiProperty({ minLength: 64, maxLength: 64 })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  sourceLineageHash!: string;
}

export class WorkerResultBindingDto {
  @ApiProperty({ enum: ['OUTPUT_SET'] })
  @IsIn(['OUTPUT_SET'])
  kind!: 'OUTPUT_SET';

  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @Matches(/^[a-z][a-z0-9_.-]{0,127}$/u)
  outputSchemaId!: string;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 32 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @Matches(/^[a-z][a-z0-9_.-]{0,127}$/u, { each: true })
  outputNames!: string[];
}

export class WorkerResultAttestationDto {
  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @Matches(/^[a-z][a-z0-9_.-]{0,127}$/u)
  outputName!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  attestationId!: string;
}

export class WorkerFinalizeResultDto extends WorkerAttemptRequestDto {
  @ApiProperty({ enum: [4] })
  @IsIn([4])
  schemaVersion!: 4;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  submissionId!: string;

  @ApiProperty({ minLength: 64, maxLength: 64 })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  descriptorBindingHash!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u)
  idempotencyKey!: string;

  @ApiProperty({ type: () => [WorkerResultAttestationDto], minItems: 1, maxItems: 32 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => WorkerResultAttestationDto)
  attestations!: WorkerResultAttestationDto[];

  @ApiProperty({ type: () => WorkerResultBindingDto })
  @ValidateNested()
  @Type(() => WorkerResultBindingDto)
  resultBinding!: WorkerResultBindingDto;
}

export class WorkerPreparedOutputDto implements PreparedOutput {
  @ApiProperty({ minLength: 1, maxLength: 128 })
  outputName!: string;

  @ApiProperty({ format: 'uuid' })
  capabilityId!: string;

  @ApiProperty({ format: 'uuid' })
  objectId!: string;

  @ApiProperty({ minimum: 1, maximum: 1_073_741_824 })
  maxBytes!: number;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 16, uniqueItems: true })
  allowedMediaTypes!: string[];

  @ApiProperty({ minLength: 16, maxLength: 4096 })
  writeCapability!: string;
}

export class WorkerPrepareResultAcceptedDto implements JraWorkerResultPrepareAccepted {
  @ApiProperty({ enum: [4] })
  schemaVersion!: 4;

  @ApiProperty({ enum: [true] })
  accepted!: true;

  @ApiProperty({ format: 'uuid' })
  submissionId!: string;

  @ApiProperty({ format: 'uuid' })
  attemptId!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  descriptorBindingHash!: string;

  @ApiProperty({ format: 'date-time', pattern: strictTimestampPattern.source })
  expiresAt!: string;

  @ApiProperty({ type: () => [WorkerPreparedOutputDto], minItems: 1, maxItems: 32 })
  outputs!: WorkerPreparedOutputDto[];
}

export class WorkerFinalizeResultAcceptedDto implements JraWorkerResultFinalizeAccepted {
  @ApiProperty({ enum: [4] })
  schemaVersion!: 4;

  @ApiProperty({ enum: [true] })
  accepted!: true;

  @ApiProperty({ format: 'uuid' })
  submissionId!: string;

  @ApiProperty({ format: 'uuid' })
  attemptId!: string;

  @ApiProperty({ format: 'uuid' })
  resultManifestId!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  resultManifestHash!: string;

  @ApiProperty({ enum: ['SUCCEEDED'] })
  outcome!: 'SUCCEEDED';

  @ApiProperty({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  revision!: number;
}

export class WorkerCompleteDto extends WorkerAttemptRequestDto {
  @ApiProperty({ enum: ['SUCCEEDED', 'FAILED', 'CANCELLED'] })
  @IsIn(['SUCCEEDED', 'FAILED', 'CANCELLED'])
  outcome!: 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

  @ApiPropertyOptional({ minLength: 64, maxLength: 64 })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  resultManifestHash?: string;

  @ApiProperty({ type: [String], maxItems: 128 })
  @IsArray()
  @ArrayMaxSize(128)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(256, { each: true })
  @Matches(opaqueReferencePattern, { each: true })
  resultReferences!: string[];
}

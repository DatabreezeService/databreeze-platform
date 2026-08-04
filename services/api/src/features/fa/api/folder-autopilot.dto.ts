import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';

const sha256Pattern = '^[0-9a-f]{64}$';
const strictUtcTimestampPattern = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$';

export class CreateFolderAutopilotProfileDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  profileId!: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 10000 })
  @IsInt()
  @Min(1)
  @Max(10_000)
  version!: number;

  @ApiProperty({ pattern: sha256Pattern })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  payloadHash!: string;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 86400000 })
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  stabilizationDelayMs!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 100000 })
  @IsInt()
  @Min(1)
  @Max(100_000)
  maxFilesPerScan!: number;

  @ApiProperty({ enum: ['REVIEW', 'SKIP', 'UNIQUE_NAME'] })
  @IsIn(['REVIEW', 'SKIP', 'UNIQUE_NAME'])
  collisionPolicy!: 'REVIEW' | 'SKIP' | 'UNIQUE_NAME';

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 604800 })
  @IsInt()
  @Min(0)
  @Max(604_800)
  undoWindowSeconds!: number;

  @ApiProperty()
  @IsBoolean()
  outputLineageEnabled!: boolean;

  @ApiProperty({ format: 'date-time', pattern: strictUtcTimestampPattern })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
  createdAt!: string;
}

export class CreateAutopilotFolderBindingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  bindingId!: string;

  @ApiProperty({ format: 'uuid', description: 'Opaque DSO DeviceGrant identifier.' })
  @IsUUID()
  deviceGrantId!: string;

  @ApiProperty({ enum: ['INPUT', 'OUTPUT'] })
  @IsIn(['INPUT', 'OUTPUT'])
  role!: 'INPUT' | 'OUTPUT';

  @ApiProperty({ pattern: sha256Pattern })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  expectedCapabilityDigest!: string;

  @ApiProperty({ format: 'date-time', pattern: strictUtcTimestampPattern })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
  createdAt!: string;
}

export class CreateRecipeAssignmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  assignmentId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  profileId!: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 10000 })
  @IsInt()
  @Min(1)
  @Max(10_000)
  profileVersion!: number;

  @ApiProperty({ pattern: sha256Pattern })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  profileHash!: string;

  @ApiProperty({ format: 'uuid', description: 'Opaque JRA RecipeVersion identifier.' })
  @IsUUID()
  jraRecipeVersionId!: string;

  @ApiProperty({ pattern: sha256Pattern })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  jraRecipeVersionHash!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  deviceId!: string;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 32, format: 'uuid' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(32)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  inputBindingIds!: string[];

  @ApiProperty({ type: [String], minItems: 1, maxItems: 32, format: 'uuid' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(32)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  outputBindingIds!: string[];

  @ApiPropertyOptional({ enum: ['LOCAL', 'HYBRID', 'CLOUD'] })
  @IsOptional()
  @IsIn(['LOCAL', 'HYBRID', 'CLOUD'])
  dataModeConstraint?: 'LOCAL' | 'HYBRID' | 'CLOUD';

  @ApiProperty({ format: 'date-time', pattern: strictUtcTimestampPattern })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
  createdAt!: string;
}

export class UpdateRecipeAssignmentDto {
  @ApiProperty({ type: 'integer', minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @ApiProperty({ enum: ['DRAFT', 'ACTIVE', 'PAUSED', 'RETIRED'] })
  @IsIn(['DRAFT', 'ACTIVE', 'PAUSED', 'RETIRED'])
  state!: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'RETIRED';
}

export class PauseRecipeAssignmentDto {
  @ApiProperty({ type: 'integer', minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class FolderAutopilotApprovalDecisionDto {
  @ApiProperty({ format: 'uuid', description: 'JRA-owned approval request identifier.' })
  @IsUUID()
  jraApprovalRequestId!: string;

  @ApiProperty({ pattern: sha256Pattern })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  subjectHash!: string;

  @ApiProperty({ pattern: sha256Pattern })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  planHash!: string;

  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  decisionReason!: string;
}

export class FolderAutopilotUndoRequestDto {
  @ApiProperty({ type: 'integer', minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @ApiProperty({ pattern: sha256Pattern })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  planHash!: string;
}

export class FolderAutopilotRejectedResponseDto {
  @ApiProperty({ enum: [false], example: false })
  accepted!: false;

  @ApiProperty({
    enum: [
      'INVALID_IDENTIFIER',
      'INVALID_SCOPE',
      'INVALID_HASH',
      'INVALID_TIMESTAMP',
      'INVALID_VERSION',
      'INVALID_REVISION',
      'INVALID_ROLE',
      'INVALID_COLLISION_POLICY',
      'INVALID_SETTINGS',
      'INVALID_BINDINGS',
      'INVALID_DATA_MODE',
      'INVALID_POLICY_REFERENCE',
      'INVALID_IDEMPOTENCY_KEY',
      'INVALID_STATE',
      'FA_PROFILE_NOT_FOUND',
      'FA_BINDING_NOT_FOUND',
      'FA_ASSIGNMENT_NOT_FOUND',
      'FA_SCOPE_NARROWING_REQUIRED',
      'FA_IMMUTABLE_PROFILE',
      'FA_IMMUTABLE_BINDING',
      'FA_IMMUTABLE_ASSIGNMENT',
      'FA_PROFILE_HASH_MISMATCH',
      'FA_BINDING_ROLE_MISMATCH',
      'FA_ASSIGNMENT_REVISION_CONFLICT',
      'FA_PERSISTENCE_UNAVAILABLE',
      'DATA_MODE_BROADENS_WORKSPACE',
      'DATA_MODE_POLICY_UNAVAILABLE',
    ],
  })
  code!: string;
}

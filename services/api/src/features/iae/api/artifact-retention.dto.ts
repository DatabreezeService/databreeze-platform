import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsInt, IsOptional, IsUUID, Matches, Min } from 'class-validator';

const strictUtcTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const strictUtcTimestampPattern = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$';

export class RetentionEvaluationDto {
  @ApiProperty({ format: 'date-time', pattern: strictUtcTimestampPattern })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(strictUtcTimestamp)
  evaluatedAt!: string;

  @ApiProperty({ format: 'date-time', pattern: strictUtcTimestampPattern })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(strictUtcTimestamp)
  workspaceRetentionUntil!: string;

  @ApiProperty({ format: 'date-time', pattern: strictUtcTimestampPattern })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(strictUtcTimestamp)
  resourceRetentionUntil!: string;

  @ApiProperty({ format: 'date-time', pattern: strictUtcTimestampPattern })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(strictUtcTimestamp)
  auditRetentionUntil!: string;

  @ApiProperty({ format: 'date-time', pattern: strictUtcTimestampPattern })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(strictUtcTimestamp)
  recoveryWindowUntil!: string;

  @ApiProperty()
  @IsBoolean()
  activeApproval!: boolean;

  @ApiProperty()
  @IsBoolean()
  legalHold!: boolean;
}

export class CreateArtifactDeletionRequestDto extends RetentionEvaluationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  requestId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    deprecated: true,
    description: 'Ignored. Attribution always uses the authenticated actor.',
  })
  @IsOptional()
  @IsUUID()
  requestedBy?: string;

  @ApiProperty({ format: 'date-time', pattern: strictUtcTimestampPattern })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(strictUtcTimestamp)
  requestedAt!: string;
}

export class AuthorizeArtifactDeletionRequestDto extends RetentionEvaluationDto {
  @ApiProperty({ format: 'date-time', pattern: strictUtcTimestampPattern })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(strictUtcTimestamp)
  approvedAt!: string;

  @ApiProperty()
  @IsBoolean()
  mfaSatisfied!: boolean;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

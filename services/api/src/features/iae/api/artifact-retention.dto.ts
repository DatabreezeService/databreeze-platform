import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsInt, IsUUID, Min } from 'class-validator';

export class RetentionEvaluationDto {
  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  evaluatedAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  workspaceRetentionUntil!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  resourceRetentionUntil!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  auditRetentionUntil!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
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

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  requestedBy!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  requestedAt!: string;
}

export class AuthorizeArtifactDeletionRequestDto extends RetentionEvaluationDto {
  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  approvedAt!: string;

  @ApiProperty()
  @IsBoolean()
  mfaSatisfied!: boolean;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

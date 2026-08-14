import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsInt, IsNumber, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

export class CreateArtifactUploadSessionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  intakeId!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @Matches(/^[0-9a-f]{64}$/u)
  expectedSha256!: string;

  @ApiProperty({ minimum: 1, maximum: 21474836480 })
  @IsNumber()
  @Min(1)
  @Max(21474836480)
  expectedByteSize!: number;

  @ApiProperty()
  @IsString()
  mediaType!: string;

  @ApiProperty({ minimum: 8388608, maximum: 67108864 })
  @IsInt()
  @Min(8388608)
  @Max(67108864)
  requestedPartSize!: number;
}

export class RecordArtifactUploadPartDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  transferId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  partNumber!: number;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @Matches(/^[0-9a-f]{64}$/u)
  contentSha256!: string;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  byteSize!: number;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  uploadedAt!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class IssueArtifactUploadTransferDto {
  @ApiProperty({ minimum: 1, maximum: 1000000 })
  @IsInt()
  @Min(1)
  @Max(1000000)
  partNumber!: number;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @Matches(/^[0-9a-f]{64}$/u)
  contentSha256!: string;

  @ApiProperty({ minimum: 0, maximum: 1073741824 })
  @IsInt()
  @Min(0)
  @Max(1073741824)
  byteSize!: number;
}

export class CompleteArtifactUploadDto {
  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @Matches(/^[0-9a-f]{64}$/u)
  assembledSha256!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class AbortArtifactUploadDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

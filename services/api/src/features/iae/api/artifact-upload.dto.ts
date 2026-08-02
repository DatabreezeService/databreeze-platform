import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsInt, IsNumber, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

export class CreateArtifactUploadSessionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sessionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  artifactId!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @Matches(/^[0-9a-f]{64}$/u)
  expectedSha256!: string;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  expectedByteSize!: number;

  @ApiProperty()
  @IsString()
  mediaType!: string;

  @ApiProperty({ minimum: 1, maximum: 1073741824 })
  @IsInt()
  @Min(1)
  @Max(1073741824)
  partSize!: number;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  expiresAt!: string;
}

export class RecordArtifactUploadPartDto {
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

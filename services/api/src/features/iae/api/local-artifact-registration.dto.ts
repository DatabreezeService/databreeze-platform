import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Closed coordinate input: callers can identify a cell/row/page, never send a source excerpt. */
export class LocalArtifactEvidenceCoordinateDto {
  @ApiProperty({ enum: ['CELL', 'PAGE', 'ROW'] })
  @IsIn(['CELL', 'PAGE', 'ROW'])
  kind!: 'CELL' | 'PAGE' | 'ROW';

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sheet?: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  address?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10000000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000000)
  page?: number;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  label?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 1000000000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000000)
  row?: number;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  field?: string;
}

export class LocalArtifactEvidenceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  evidenceId!: string;

  @ApiProperty({ type: LocalArtifactEvidenceCoordinateDto })
  @ValidateNested()
  @Type(() => LocalArtifactEvidenceCoordinateDto)
  coordinate!: LocalArtifactEvidenceCoordinateDto;
}

/** IAE-001/004/006/019: local registration carries metadata and opaque handles only. */
export class RegisterLocalArtifactDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  artifactId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  versionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  placementId!: string;

  @ApiPropertyOptional({ type: LocalArtifactEvidenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalArtifactEvidenceDto)
  evidence?: LocalArtifactEvidenceDto;

  @ApiProperty({ enum: ['FILE', 'FOLDER', 'CAPTURE', 'GENERATED'] })
  @IsIn(['FILE', 'FOLDER', 'CAPTURE', 'GENERATED'])
  sourceKind!: 'FILE' | 'FOLDER' | 'CAPTURE' | 'GENERATED';

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @Matches(/^[0-9a-f]{64}$/u)
  contentSha256!: string;

  @ApiProperty({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  byteSize!: number;

  @ApiProperty({ pattern: '^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/iu)
  mediaType!: string;

  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString()
  @MaxLength(255)
  displayName!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  createdAt!: string;

  @ApiProperty({ pattern: '^[A-Za-z0-9_-]{16,512}$' })
  @Matches(/^[A-Za-z0-9_-]{16,512}$/u)
  opaqueReference!: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class GovernedDatasetFieldDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  fieldId!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @ApiProperty({ enum: ['TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE'] })
  @IsIn(['TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE'])
  type!: 'TEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'DATE';

  @ApiProperty()
  @IsBoolean()
  nullable!: boolean;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  unit?: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  semanticRole?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aliases?: string[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  localizedLabels?: Record<string, string>;

  @ApiPropertyOptional({ enum: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'] })
  @IsOptional()
  @IsIn(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'])
  sensitivity?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';

  @ApiPropertyOptional({ enum: ['MISSING', 'NULL', 'STATIC', 'NONE'] })
  @IsOptional()
  @IsIn(['MISSING', 'NULL', 'STATIC', 'NONE'])
  defaultBehavior?: 'MISSING' | 'NULL' | 'STATIC' | 'NONE';
}

export class CreateGovernedDatasetDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  datasetId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  versionId!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ type: [GovernedDatasetFieldDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GovernedDatasetFieldDto)
  fields!: GovernedDatasetFieldDto[];

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  createdAt!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  canonicalHash!: string;
}

export class PublishGovernedDatasetDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  nextVersionId!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  publishedAt!: string;
}

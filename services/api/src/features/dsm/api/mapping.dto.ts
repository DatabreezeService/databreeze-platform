import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class MappingStepDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sourceFieldId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetFieldId!: string;

  @ApiProperty({
    enum: ['IDENTITY', 'TRIM', 'LOWERCASE', 'UPPERCASE', 'PARSE_DECIMAL', 'PARSE_DATE', 'LOOKUP'],
  })
  @IsIn(['IDENTITY', 'TRIM', 'LOWERCASE', 'UPPERCASE', 'PARSE_DECIMAL', 'PARSE_DATE', 'LOOKUP'])
  transform!:
    | 'IDENTITY'
    | 'TRIM'
    | 'LOWERCASE'
    | 'UPPERCASE'
    | 'PARSE_DECIMAL'
    | 'PARSE_DATE'
    | 'LOOKUP';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  lookupVersionId?: string;
}

export class CreateMappingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  versionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sourceSchemaVersionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetSchemaVersionId!: string;

  @ApiProperty({ type: [MappingStepDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MappingStepDto)
  steps!: MappingStepDto[];

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  createdAt!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  canonicalHash!: string;
}

export class CreateRuleSetDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  versionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  schemaVersionId!: string;

  @ApiProperty({ type: [Object] })
  @IsArray()
  @IsObject({ each: true })
  rules!: Record<string, unknown>[];

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  createdAt!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  canonicalHash!: string;
}

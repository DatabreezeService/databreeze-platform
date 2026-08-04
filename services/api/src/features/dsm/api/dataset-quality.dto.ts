import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  IsOptional,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isDatasetQualityScalar', async: false })
class DatasetQualityScalarConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    );
  }
}

export class DatasetQualitySafeValueDto {
  @ApiProperty({
    enum: [
      'TEXT',
      'INTEGER',
      'DECIMAL',
      'BOOLEAN',
      'DATE',
      'MISSING',
      'NULL',
      'BLANK',
      'INVALID',
      'ZERO',
      'NOT_APPLICABLE',
      'REDACTED',
    ],
  })
  @IsIn([
    'TEXT',
    'INTEGER',
    'DECIMAL',
    'BOOLEAN',
    'DATE',
    'MISSING',
    'NULL',
    'BLANK',
    'INVALID',
    'ZERO',
    'NOT_APPLICABLE',
    'REDACTED',
  ])
  kind!: string;

  @ApiProperty({
    required: false,
    oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
  })
  @ValidateIf((_object, value) => value !== undefined)
  @Validate(DatasetQualityScalarConstraint)
  value?: string | number | boolean;
}

export class DatasetQualityFindingSubjectDto {
  @ApiProperty({ enum: ['DATASET', 'ROW', 'FIELD', 'CELL'] })
  @IsIn(['DATASET', 'ROW', 'FIELD', 'CELL'])
  type!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  keyHash!: string;

  @ApiProperty({ format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  fieldId?: string;
}

export class DatasetQualityFindingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  findingId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  ruleId!: string;

  @ApiProperty({ enum: ['INFO', 'WARNING', 'ERROR'] })
  @IsIn(['INFO', 'WARNING', 'ERROR'])
  severity!: 'INFO' | 'WARNING' | 'ERROR';

  @ApiProperty({ minLength: 1, maxLength: 96 })
  @IsString()
  @MinLength(1)
  @MaxLength(96)
  messageCode!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  occurrenceCount!: number;

  @ApiProperty({ type: [String], format: 'uuid', maxItems: 128 })
  @IsArray()
  @ArrayMaxSize(128)
  @IsUUID('4', { each: true })
  evidenceIds!: string[];

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  detailHash!: string;

  @ApiProperty({ type: DatasetQualityFindingSubjectDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => DatasetQualityFindingSubjectDto)
  subject?: DatasetQualityFindingSubjectDto;

  @ApiProperty({ type: DatasetQualitySafeValueDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => DatasetQualitySafeValueDto)
  actual?: DatasetQualitySafeValueDto;

  @ApiProperty({ type: DatasetQualitySafeValueDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => DatasetQualitySafeValueDto)
  expected?: DatasetQualitySafeValueDto;
}

export class RegisterDatasetQualityResultDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  resultId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  datasetId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  datasetVersionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  ruleSetVersionId!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  profileFingerprint!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  rowCountScanned!: number;

  @ApiProperty({ enum: ['PASS', 'PASS_WITH_WARNINGS', 'BLOCKED', 'INCOMPLETE'] })
  @IsIn(['PASS', 'PASS_WITH_WARNINGS', 'BLOCKED', 'INCOMPLETE'])
  qualityState!: 'PASS' | 'PASS_WITH_WARNINGS' | 'BLOCKED' | 'INCOMPLETE';

  @ApiProperty({ type: [DatasetQualityFindingDto], maxItems: 512 })
  @IsArray()
  @ArrayMaxSize(512)
  @ValidateNested({ each: true })
  @Type(() => DatasetQualityFindingDto)
  findings!: DatasetQualityFindingDto[];

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  resultFingerprint!: string;

  @ApiProperty({ format: 'date-time' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
  createdAt!: string;
}

import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

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

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(128)
  @IsUUID('4', { each: true })
  evidenceIds!: string[];

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  detailHash!: string;
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

  @ApiProperty({ type: [DatasetQualityFindingDto] })
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

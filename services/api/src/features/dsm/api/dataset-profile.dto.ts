import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
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

export class DatasetProfileResourceLimitsDto {
  @ApiProperty({ minimum: 1, maximum: 10000000 })
  @IsInt()
  @Min(1)
  @Max(10000000)
  maxRows!: number;

  @ApiProperty({ minimum: 1, maximum: 1099511627776 })
  @IsInt()
  @Min(1)
  @Max(1099511627776)
  maxBytes!: number;

  @ApiProperty({ minimum: 1, maximum: 86400000 })
  @IsInt()
  @Min(1)
  @Max(86400000)
  maxDurationMs!: number;
}

export class RegisterDatasetProfileDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  profileId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  datasetVersionId!: string;

  @ApiProperty({ enum: ['COMPLETE', 'DETERMINISTIC_SAMPLE'] })
  @IsIn(['COMPLETE', 'DETERMINISTIC_SAMPLE'])
  completeness!: 'COMPLETE' | 'DETERMINISTIC_SAMPLE';

  @ApiProperty({ maxLength: 96 })
  @IsString()
  @MaxLength(96)
  samplingMethod!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$', required: false })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  samplingSeed?: string;

  @ApiProperty({ type: [String], maxItems: 64, required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  excludedScopes?: string[];

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  rowCountScanned!: number;

  @ApiProperty({ minimum: 0, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  rowCountAvailable?: number;

  @ApiProperty({ type: DatasetProfileResourceLimitsDto })
  @ValidateNested()
  @Type(() => DatasetProfileResourceLimitsDto)
  resourceLimits!: DatasetProfileResourceLimitsDto;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  profileFingerprint!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  createdAt!: string;
}

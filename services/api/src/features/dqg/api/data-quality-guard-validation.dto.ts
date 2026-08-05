import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

type DataQualityRequestScalar = string | number | boolean | null;

const sha256Pattern = /^[0-9a-f]{64}$/u;
const ruleKinds = ['required', 'unique', 'range', 'allowed-set', 'type'] as const;
const severities = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const;
const expectedTypes = ['string', 'number', 'boolean', 'date'] as const;

function scalar(value: unknown): value is DataQualityRequestScalar {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function row(value: unknown): value is Readonly<Record<string, DataQualityRequestScalar>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > 64) return false;
  return entries.every(
    ([key, fieldValue]) =>
      key.length > 0 &&
      key.length <= 128 &&
      !/\p{Cc}/u.test(key) &&
      key !== '__proto__' &&
      key !== 'constructor' &&
      (typeof fieldValue !== 'string' || fieldValue.length <= 4096) &&
      scalar(fieldValue),
  );
}

@ValidatorConstraint({ name: 'areDataQualityRows', async: false })
class DataQualityRowsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return Array.isArray(value) && value.every(row);
  }
}

@ValidatorConstraint({ name: 'areDataQualityScalars', async: false })
class DataQualityScalarsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      Array.isArray(value) &&
      value.every((item) => (typeof item !== 'string' || item.length <= 4096) && scalar(item))
    );
  }
}

export class DataQualityGuardDatasetDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  datasetId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  datasetVersionId!: string;

  @ApiProperty({ pattern: sha256Pattern.source })
  @IsString()
  @Matches(sha256Pattern)
  contentSha256!: string;

  @ApiProperty({
    type: 'array',
    maxItems: 256,
    items: {
      type: 'object',
      additionalProperties: {
        oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' }],
      },
    },
  })
  @IsArray()
  @ArrayMaxSize(256)
  @Validate(DataQualityRowsConstraint)
  rows!: Array<Readonly<Record<string, DataQualityRequestScalar>>>;
}

export class DataQualityGuardRuleDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  ruleId!: string;

  @ApiProperty({ enum: ruleKinds })
  @IsIn(ruleKinds)
  kind!: (typeof ruleKinds)[number];

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MaxLength(128)
  field!: string;

  @ApiProperty({ enum: severities })
  @IsIn(severities)
  severity!: (typeof severities)[number];

  @ApiPropertyOptional({ type: 'number' })
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  min?: number;

  @ApiPropertyOptional({ type: 'number' })
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  max?: number;

  @ApiPropertyOptional({
    type: 'array',
    maxItems: 256,
    items: {
      oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' }],
    },
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(256)
  @Validate(DataQualityScalarsConstraint)
  values?: DataQualityRequestScalar[];

  @ApiPropertyOptional({ enum: expectedTypes })
  @IsOptional()
  @IsIn(expectedTypes)
  expectedType?: (typeof expectedTypes)[number];

  @ApiProperty()
  @IsBoolean()
  allowNull!: boolean;
}

export class DataQualityGuardContractDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  contractId!: string;

  @ApiProperty({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  contractVersion!: number;

  @ApiProperty({ pattern: sha256Pattern.source })
  @IsString()
  @Matches(sha256Pattern)
  contractSha256!: string;

  @ApiProperty({ type: () => [DataQualityGuardRuleDto], maxItems: 128 })
  @IsArray()
  @ArrayMaxSize(128)
  @ValidateNested({ each: true })
  @Type(() => DataQualityGuardRuleDto)
  rules!: DataQualityGuardRuleDto[];
}

/**
 * Bounded transient input only. Raw row values are allowed only in the request
 * body so deterministic validation can run; the API never stores or returns them.
 */
export class ValidateDataQualityGuardDto {
  @ApiProperty({ type: () => DataQualityGuardDatasetDto })
  @IsObject()
  @ValidateNested()
  @Type(() => DataQualityGuardDatasetDto)
  dataset!: DataQualityGuardDatasetDto;

  @ApiProperty({ type: () => DataQualityGuardContractDto })
  @IsObject()
  @ValidateNested()
  @Type(() => DataQualityGuardContractDto)
  contract!: DataQualityGuardContractDto;
}

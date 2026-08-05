import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
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

const currencyPattern = /^[A-Z]{3}$/u;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const evidenceLocatorPattern =
  /^(?:page|table|sheet|cell|row|record|field):[A-Za-z0-9._,!:-]{1,240}$/u;
const directions = ['HIGHER_BETTER', 'LOWER_BETTER'] as const;

function isSafeBusinessText(value: unknown, maxLength: number): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) return false;
  const normalized = value.normalize('NFC').trim();
  if (normalized.length === 0 || /\p{Cc}/u.test(normalized)) return false;
  if (normalized.includes('\\') || normalized.includes('/') || normalized.startsWith('.'))
    return false;
  return !/^[A-Za-z]:/u.test(normalized);
}

function isScoreValues(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length > 0 &&
    entries.length <= 500 &&
    entries.every(
      ([supplierId, score]) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          supplierId,
        ) &&
        typeof score === 'number' &&
        Number.isFinite(score) &&
        Math.abs(score) <= 1_000_000_000_000,
    )
  );
}

@ValidatorConstraint({ name: 'isQuoteIntelligenceSafeBusinessText', async: false })
class QuoteIntelligenceSafeBusinessTextConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isSafeBusinessText(value, 256);
  }
}

@ValidatorConstraint({ name: 'areQuoteIntelligenceScoreValues', async: false })
class QuoteIntelligenceScoreValuesConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isScoreValues(value);
  }
}

export class QuoteIntelligenceEvidenceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sourceId!: string;

  /** Structured coordinate only; never source text, a path, or a URL. */
  @ApiProperty({ maxLength: 256, pattern: evidenceLocatorPattern.source, example: 'page:1' })
  @IsString()
  @MaxLength(256)
  @Matches(evidenceLocatorPattern)
  locator!: string;
}

export class QuoteIntelligenceLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  lineId!: string;

  /** Bounded normalized label only; original extraction text is not accepted. */
  @ApiProperty({ maxLength: 256 })
  @IsString()
  @MaxLength(256)
  @Validate(QuoteIntelligenceSafeBusinessTextConstraint)
  description!: string;

  @ApiProperty({ minimum: Number.MIN_VALUE, maximum: 1_000_000_000 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(Number.MIN_VALUE)
  @Max(1_000_000_000)
  quantity!: number;

  @ApiProperty({ minimum: 0, maximum: 1_000_000_000_000 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(1_000_000_000_000)
  unitPrice!: number;

  @ApiProperty({ pattern: currencyPattern.source })
  @IsString()
  @Matches(currencyPattern)
  currency!: string;

  @ApiProperty({ minimum: 0, maximum: 1 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(1)
  taxRate!: number;

  @ApiProperty({ type: () => [QuoteIntelligenceEvidenceDto], maxItems: 32 })
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => QuoteIntelligenceEvidenceDto)
  evidence!: QuoteIntelligenceEvidenceDto[];
}

export class QuoteIntelligenceQuoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  supplierId!: string;

  /** Bounded normalized label only; original artifact text is not accepted. */
  @ApiProperty({ maxLength: 256 })
  @IsString()
  @MaxLength(256)
  @Validate(QuoteIntelligenceSafeBusinessTextConstraint)
  supplierName!: string;

  @ApiProperty({ minimum: 0, maximum: 1_000_000_000_000 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(1_000_000_000_000)
  freight!: number;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 36_500 })
  @IsInt()
  @Min(0)
  @Max(36_500)
  leadDays!: number;

  @ApiProperty({ type: () => [QuoteIntelligenceLineDto], maxItems: 256 })
  @IsArray()
  @ArrayMaxSize(256)
  @ValidateNested({ each: true })
  @Type(() => QuoteIntelligenceLineDto)
  lines!: QuoteIntelligenceLineDto[];

  @ApiProperty({ type: () => [QuoteIntelligenceEvidenceDto], maxItems: 32 })
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => QuoteIntelligenceEvidenceDto)
  evidence!: QuoteIntelligenceEvidenceDto[];
}

export class QuoteIntelligenceExchangeRateDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  rateId!: string;

  @ApiProperty({ pattern: currencyPattern.source })
  @IsString()
  @Matches(currencyPattern)
  from!: string;

  @ApiProperty({ pattern: currencyPattern.source })
  @IsString()
  @Matches(currencyPattern)
  to!: string;

  @ApiProperty({ minimum: Number.MIN_VALUE, maximum: 1_000_000_000 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(Number.MIN_VALUE)
  @Max(1_000_000_000)
  rate!: number;

  @ApiProperty({ pattern: datePattern.source, example: '2026-08-05' })
  @IsString()
  @Matches(datePattern)
  effectiveDate!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MaxLength(128)
  @Validate(QuoteIntelligenceSafeBusinessTextConstraint)
  provenance!: string;
}

export class QuoteIntelligenceScoringCriterionDto {
  @ApiProperty({ maxLength: 64 })
  @IsString()
  @MaxLength(64)
  @Validate(QuoteIntelligenceSafeBusinessTextConstraint)
  key!: string;

  @ApiProperty({ enum: directions })
  @IsIn(directions)
  direction!: (typeof directions)[number];

  @ApiProperty({ minimum: Number.MIN_VALUE, maximum: 100 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(Number.MIN_VALUE)
  @Max(100)
  weight!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    description: 'Bounded map keyed by supplier UUID. No raw source text is accepted.',
  })
  @IsObject()
  @Validate(QuoteIntelligenceScoreValuesConstraint)
  values!: Record<string, number>;
}

export class QuoteIntelligenceScoringDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  policyVersion!: number;

  @ApiProperty({ type: () => [QuoteIntelligenceScoringCriterionDto], maxItems: 32 })
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => QuoteIntelligenceScoringCriterionDto)
  criteria!: QuoteIntelligenceScoringCriterionDto[];
}

/**
 * Transient, bounded normalized values only. The request deliberately has no
 * tenant scope, artifact path, raw extraction, credential, or approval field.
 */
export class CompareQuoteIntelligenceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  comparisonId!: string;

  @ApiProperty({ pattern: currencyPattern.source })
  @IsString()
  @Matches(currencyPattern)
  targetCurrency!: string;

  @ApiPropertyOptional({ type: () => [QuoteIntelligenceExchangeRateDto], maxItems: 64 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => QuoteIntelligenceExchangeRateDto)
  exchangeRates?: QuoteIntelligenceExchangeRateDto[];

  @ApiProperty({ type: () => [QuoteIntelligenceQuoteDto], minItems: 1, maxItems: 500 })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => QuoteIntelligenceQuoteDto)
  quotes!: QuoteIntelligenceQuoteDto[];

  @ApiPropertyOptional({ type: () => QuoteIntelligenceScoringDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => QuoteIntelligenceScoringDto)
  scoring?: QuoteIntelligenceScoringDto;
}

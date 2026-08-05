import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
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

const sha256Pattern = /^[0-9a-f]{64}$/u;
const currencyPattern = /^[A-Z]{3}$/u;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const evidenceLocatorPattern =
  /^(?:page|table|sheet|cell|row|record|field):[A-Za-z0-9._,!:-]{1,240}$/u;

function isSafeBusinessText(value: unknown, maxLength: number): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) return false;
  const normalized = value.normalize('NFC').trim();
  if (normalized.length === 0 || /\p{Cc}/u.test(normalized)) return false;
  if (normalized.includes('\\') || normalized.includes('/') || normalized.startsWith('.'))
    return false;
  return !/^[A-Za-z]:/u.test(normalized);
}

@ValidatorConstraint({ name: 'isInvoiceLeakDetectorSafeBusinessText', async: false })
class InvoiceLeakDetectorSafeBusinessTextConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isSafeBusinessText(value, 256);
  }
}

export class InvoiceLeakDetectorEvidenceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sourceId!: string;

  /** Structured coordinate only; original source text and paths are not accepted. */
  @ApiProperty({ maxLength: 256, pattern: evidenceLocatorPattern.source, example: 'page:1' })
  @IsString()
  @MaxLength(256)
  @Matches(evidenceLocatorPattern)
  locator!: string;
}

export class InvoiceLeakDetectorLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  lineId!: string;

  @ApiProperty({ maxLength: 256 })
  @IsString()
  @MaxLength(256)
  @Validate(InvoiceLeakDetectorSafeBusinessTextConstraint)
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

  @ApiProperty({ type: () => [InvoiceLeakDetectorEvidenceDto], maxItems: 32 })
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLeakDetectorEvidenceDto)
  evidence!: InvoiceLeakDetectorEvidenceDto[];
}

export class InvoiceLeakDetectorInvoiceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  invoiceId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  artifactVersionId!: string;

  @ApiProperty({ pattern: sha256Pattern.source })
  @IsString()
  @Matches(sha256Pattern)
  contentSha256!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  supplierId!: string;

  /** Bounded normalized identifier only; raw invoice source data is not accepted. */
  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MaxLength(128)
  @Validate(InvoiceLeakDetectorSafeBusinessTextConstraint)
  invoiceNumber!: string;

  @ApiProperty({ pattern: datePattern.source, example: '2026-08-05' })
  @IsString()
  @Matches(datePattern)
  invoiceDate!: string;

  @ApiProperty({ pattern: currencyPattern.source })
  @IsString()
  @Matches(currencyPattern)
  currency!: string;

  @ApiProperty({ minimum: 0, maximum: 1_000_000_000_000 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(1_000_000_000_000)
  total!: number;

  @ApiProperty({ type: () => [InvoiceLeakDetectorLineDto], minItems: 1, maxItems: 256 })
  @IsArray()
  @ArrayMaxSize(256)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLeakDetectorLineDto)
  lines!: InvoiceLeakDetectorLineDto[];

  @ApiProperty({ type: () => [InvoiceLeakDetectorEvidenceDto], maxItems: 32 })
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLeakDetectorEvidenceDto)
  evidence!: InvoiceLeakDetectorEvidenceDto[];
}

export class InvoiceLeakDetectorGoverningLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  governingLineId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  supplierId!: string;

  @ApiProperty({ maxLength: 256 })
  @IsString()
  @MaxLength(256)
  @Validate(InvoiceLeakDetectorSafeBusinessTextConstraint)
  description!: string;

  @ApiProperty({ minimum: 0, maximum: 1_000_000_000_000 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(1_000_000_000_000)
  unitPrice!: number;

  @ApiProperty({ pattern: currencyPattern.source })
  @IsString()
  @Matches(currencyPattern)
  currency!: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000_000 })
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(1_000_000_000)
  maxQuantity?: number;

  @ApiProperty({ type: () => [InvoiceLeakDetectorEvidenceDto], maxItems: 32 })
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLeakDetectorEvidenceDto)
  evidence!: InvoiceLeakDetectorEvidenceDto[];
}

export class InvoiceLeakDetectorHistoricalInvoiceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  invoiceId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  supplierId!: string;

  @ApiProperty({ pattern: sha256Pattern.source })
  @IsString()
  @Matches(sha256Pattern)
  contentSha256!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MaxLength(128)
  @Validate(InvoiceLeakDetectorSafeBusinessTextConstraint)
  invoiceNumber!: string;

  @ApiProperty({ pattern: datePattern.source, example: '2026-08-05' })
  @IsString()
  @Matches(datePattern)
  invoiceDate!: string;

  @ApiProperty({ type: () => [InvoiceLeakDetectorEvidenceDto], maxItems: 32 })
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLeakDetectorEvidenceDto)
  evidence!: InvoiceLeakDetectorEvidenceDto[];
}

export class InvoiceLeakDetectorToleranceDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000_000_000 })
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(1_000_000_000_000)
  amount?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(100)
  percent?: number;
}

/**
 * Transient normalized values only. Tenant scope is server-derived and raw
 * artifact content, URLs, file paths, credentials, and approval fields reject.
 */
export class AuditInvoiceLeakDetectorDto {
  @ApiProperty({ type: () => InvoiceLeakDetectorInvoiceDto })
  @IsObject()
  @ValidateNested()
  @Type(() => InvoiceLeakDetectorInvoiceDto)
  invoice!: InvoiceLeakDetectorInvoiceDto;

  @ApiProperty({ type: () => [InvoiceLeakDetectorGoverningLineDto], maxItems: 512 })
  @IsArray()
  @ArrayMaxSize(512)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLeakDetectorGoverningLineDto)
  governingLines!: InvoiceLeakDetectorGoverningLineDto[];

  @ApiPropertyOptional({ type: () => [InvoiceLeakDetectorHistoricalInvoiceDto], maxItems: 128 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(128)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLeakDetectorHistoricalInvoiceDto)
  historicalInvoices?: InvoiceLeakDetectorHistoricalInvoiceDto[];

  @ApiPropertyOptional({ type: () => InvoiceLeakDetectorToleranceDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => InvoiceLeakDetectorToleranceDto)
  tolerance?: InvoiceLeakDetectorToleranceDto;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Validate(InvoiceLeakDetectorSafeBusinessTextConstraint)
  calculationVersion?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from 'class-validator';

const modes = ['LOCAL', 'HYBRID', 'CLOUD'] as const;
const payloadClasses = [
  'CONTROL_METADATA',
  'APPROVED_DERIVED_RESULT',
  'RECONSTRUCTABLE_DERIVED_CONTENT',
  'ORIGINAL_CONTENT',
] as const;

export class PublishDataModePolicyDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  policyId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  policyVersionId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  revision!: number;

  @ApiProperty({ enum: modes })
  @IsIn(modes)
  mode!: (typeof modes)[number];

  @ApiProperty({ additionalProperties: { type: 'array', items: { enum: [...payloadClasses] } } })
  @IsObject()
  allowedPayloadClasses!: Record<string, unknown>;

  @ApiProperty({ type: [String], maxItems: 32 })
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(64, { each: true })
  allowedPlacementKinds!: string[];

  @ApiProperty({ type: [String], maxItems: 32 })
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(64, { each: true })
  allowedExecutorClasses!: string[];

  @ApiProperty({ type: [String], maxItems: 32 })
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(64, { each: true })
  allowedDestinationClasses!: string[];

  @ApiProperty({ minLength: 64, maxLength: 64 })
  @Matches(/^[a-f0-9]{64}$/u)
  canonicalHash!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  publishedAt!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  parentVersionId?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateServiceAccountDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Optional workspace narrowing for the identity' })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 64 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(64)
  @IsString({ each: true })
  permissions!: string[];

  @ApiPropertyOptional({ format: 'date-time', description: 'Optional expiry, at most 365 days after issue' })
  @IsOptional()
  @IsISO8601()
  secretExpiresAt?: string;
}

export class ServiceAccountRevisionDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRevision!: number;
}

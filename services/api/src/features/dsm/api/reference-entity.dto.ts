import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateReferenceEntityDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  entityId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  versionId!: string;

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  displayName!: string;

  @ApiProperty({ enum: ['SUPPLIER', 'CUSTOMER', 'CARRIER', 'OTHER'], isArray: true })
  @IsArray()
  @IsIn(['SUPPLIER', 'CUSTOMER', 'CARRIER', 'OTHER'], { each: true })
  roles!: ('SUPPLIER' | 'CUSTOMER' | 'CARRIER' | 'OTHER')[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aliases?: string[];

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  externalIdentifiers?: { namespace: string; value: string }[];

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  canonicalHash!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  createdAt!: string;
}

export class MergeReferenceEntityDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sourceEntityId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetEntityId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  resolutionId!: string;

  @ApiProperty({ maxLength: 512 })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  reason!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  evidenceId!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  resolvedAt!: string;
}

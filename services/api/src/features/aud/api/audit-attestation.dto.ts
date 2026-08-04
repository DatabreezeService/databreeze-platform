import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAuditAttestationDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Server-generated when omitted' })
  @IsOptional()
  @IsUUID()
  attestationId?: string;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  signerKeyId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  firstSequence!: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  lastSequence!: number;

  @ApiProperty({ minLength: 1, maxLength: 512 })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  rootDigest!: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsIn, IsInt, IsOptional, IsString, Min, Matches } from 'class-validator';

export class AdmitArtifactDto {
  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @Matches(/^[0-9a-f]{64}$/u)
  actualSha256!: string;

  @ApiProperty({ type: 'integer', minimum: 0 })
  @IsInt()
  @Min(0)
  actualByteSize!: number;

  @ApiProperty()
  @IsString()
  detectedMediaType!: string;

  @ApiProperty({ enum: ['PENDING', 'CLEAN', 'MALICIOUS', 'FAILED'] })
  @IsIn(['PENDING', 'CLEAN', 'MALICIOUS', 'FAILED'])
  scanState!: 'PENDING' | 'CLEAN' | 'MALICIOUS' | 'FAILED';

  @ApiProperty({ type: 'integer', minimum: 0 })
  @IsInt()
  @Min(0)
  maxByteSize!: number;

  @ApiProperty({ format: 'date-time', required: false })
  @IsOptional()
  @IsISO8601()
  scannedAt?: string;
}

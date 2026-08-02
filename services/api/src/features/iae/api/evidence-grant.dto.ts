import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CreateEvidenceGrantDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  grantId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  recipientDeviceId!: string;

  @ApiProperty({ enum: ['COORDINATE', 'EXCERPT', 'OPEN_ON_DEVICE'] })
  @IsIn(['COORDINATE', 'EXCERPT', 'OPEN_ON_DEVICE'])
  action!: 'COORDINATE' | 'EXCERPT' | 'OPEN_ON_DEVICE';

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  issuedAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  expiresAt!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  authorizationEpoch!: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 4096 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4096)
  maxExcerptBytes?: number;
}

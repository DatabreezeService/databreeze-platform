import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsInt, IsOptional, Max, Min } from 'class-validator';

export class IssueEntitlementLeaseDto {
  @ApiProperty({ format: 'date-time', description: 'UTC expiry no more than 24 hours after issue' })
  @IsISO8601()
  expiresAt!: string;
}

export class VerifyEntitlementLeaseDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  snapshotRevision!: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  securityEpoch!: number;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Verification time; server clock is used when omitted',
  })
  @IsOptional()
  @IsISO8601()
  now?: string;
}

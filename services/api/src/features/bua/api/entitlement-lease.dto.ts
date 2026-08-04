import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsInt, Max, Min } from 'class-validator';

export class IssueEntitlementLeaseDto {
  @ApiProperty({ format: 'date-time', description: 'UTC expiry no more than 24 hours after issue' })
  @IsISO8601()
  expiresAt!: string;
}

export class VerifyEntitlementLeaseDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  snapshotRevision!: number;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  securityEpoch!: number;
}

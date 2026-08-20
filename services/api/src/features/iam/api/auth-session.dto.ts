import { ApiProperty } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/** IAM-005, IAM-006, IAM-012: public response shape for browser and native clients. */
export class AuthSessionDto {
  @ApiProperty({ enum: [4] })
  @Equals(4)
  schemaVersion!: 4;

  @ApiProperty({ enum: ['TENANT', 'PLATFORM'] })
  @IsString()
  scopeType!: 'TENANT' | 'PLATFORM';

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sessionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiProperty({ format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @ApiProperty({ minLength: 1, maxLength: 4096 })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  accessToken!: string;

  @ApiProperty({ minLength: 1, maxLength: 4096, required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  refreshToken?: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  accessExpiresAt!: string;

  @ApiProperty({ minimum: 1 })
  securityEpoch!: number;

  @ApiProperty()
  @IsBoolean()
  mfaRequired!: boolean;

  @ApiProperty()
  @IsBoolean()
  mfaReenrollmentRequired!: boolean;
}

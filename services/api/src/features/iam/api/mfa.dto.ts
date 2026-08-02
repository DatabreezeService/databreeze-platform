import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class EnrollMfaFactorDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiProperty({ enum: ['TOTP', 'WEBAUTHN'] })
  @IsIn(['TOTP', 'WEBAUTHN'])
  method!: 'TOTP' | 'WEBAUTHN';

  @ApiProperty({ maxLength: 512, writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  secretReference!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  enrolledAt!: string;

  @ApiProperty({ minimum: 1, required: false })
  @IsOptional()
  revision?: number;
}

export class VerifyMfaFactorDto {
  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  at!: string;
}

export class RedeemMfaRecoveryCodeDto {
  @ApiProperty({ maxLength: 256, writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  presentedDigest!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  at!: string;
}

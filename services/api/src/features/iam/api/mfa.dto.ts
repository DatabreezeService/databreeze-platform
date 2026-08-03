import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

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
}

export class VerifyMfaFactorDto {
  @ApiProperty({ minLength: 1, maxLength: 4096, writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  proof!: string;
}

export class RedeemMfaRecoveryCodeDto {
  @ApiProperty({ maxLength: 256, writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  presentedDigest!: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsIn, IsInt, IsString, IsUUID, Matches, Max, Min, MinLength } from 'class-validator';

export class IssueDeviceEnrollmentChallengeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  challengeId!: string;

  @ApiProperty({ enum: ['WINDOWS', 'ANDROID'] })
  @IsIn(['WINDOWS', 'ANDROID'])
  platform!: 'WINDOWS' | 'ANDROID';

  @ApiProperty({ minLength: 64, maxLength: 64 })
  @Matches(/^[a-f0-9]{64}$/u)
  installationIdHash!: string;

  @ApiProperty({ minLength: 64, maxLength: 64 })
  @Matches(/^[a-f0-9]{64}$/u)
  challengeDigest!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  issuedAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  expiresAt!: string;
}

export class EnrollDeviceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  challengeId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  deviceId!: string;

  @ApiProperty({ minLength: 1, maxLength: 2048 })
  @IsString()
  @MinLength(1)
  publicKey!: string;

  @ApiProperty({ minLength: 1, maxLength: 4096 })
  @IsString()
  @MinLength(1)
  proof!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  now!: string;
}

export class DeviceRevisionDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRevision!: number;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  at!: string;
}

export class RotateDeviceKeyDto extends DeviceRevisionDto {
  @ApiProperty({ minLength: 1, maxLength: 2048 })
  @IsString()
  @MinLength(1)
  nextPublicKey!: string;
}

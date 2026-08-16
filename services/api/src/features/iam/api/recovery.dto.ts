import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RecoveryRequestDto {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @IsEmail()
  @IsString()
  @MinLength(3)
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({ enum: ['vi-VN', 'en'], default: 'vi-VN' })
  @IsOptional()
  @IsIn(['vi-VN', 'en'])
  locale?: 'vi-VN' | 'en';
}

export class RecoveryCompleteDto {
  @ApiProperty({ minLength: 32, maxLength: 512, writeOnly: true })
  @IsString()
  @MinLength(32)
  @MaxLength(512)
  token!: string;

  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}

export class RecoveryRequestResponseDto {
  @ApiProperty({ enum: [true], example: true })
  requested!: true;
}

export class RecoveryCompleteResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ enum: [true], example: true })
  mfaReenrollmentRequired!: true;
}

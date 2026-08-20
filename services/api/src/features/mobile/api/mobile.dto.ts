import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class RegisterMobilePushDto {
  @ApiProperty({ enum: ['ANDROID'] }) @IsIn(['ANDROID']) platform!: 'ANDROID';
  @ApiProperty({ minLength: 1, maxLength: 4096, writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  providerToken!: string;
  @ApiProperty({ minLength: 64, maxLength: 64 })
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  installationIdHash!: string;
}

export class CreateMobileReportDto {
  @ApiProperty({ maxLength: 64 }) @IsString() @MinLength(1) @MaxLength(64) reportType!: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() subjectId?: string;
  @ApiProperty({ minLength: 64, maxLength: 64 })
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  payloadDigest!: string;
}

export class IssueMobileRouteTokenDto {
  @ApiProperty({ enum: ['tasks', 'evidence', 'billing'] })
  @IsIn(['tasks', 'evidence', 'billing'])
  route!: 'tasks' | 'evidence' | 'billing';
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsString() expiresAt?: string;
}

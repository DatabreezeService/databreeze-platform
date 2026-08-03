import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SessionRefreshResponseDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sessionId!: string;

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
}

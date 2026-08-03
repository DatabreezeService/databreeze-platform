import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegistrationDto {
  @ApiProperty({ example: 'ngu***@example.com', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName!: string;

  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ enum: ['vi-VN', 'en'], default: 'vi-VN' })
  @IsOptional()
  @IsIn(['vi-VN', 'en'])
  locale?: 'vi-VN' | 'en';
}

export class RegistrationResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ format: 'uuid' })
  workspaceId!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ format: 'uuid' })
  membershipId!: string;

  @ApiProperty({ enum: ['vi-VN', 'en'] })
  locale!: 'vi-VN' | 'en';
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegistrationDto {
  @ApiProperty({ enum: [4] })
  @Equals(4)
  schemaVersion!: 4;

  @ApiProperty({ format: 'email', example: 'nguyen@example.com', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;

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
  @ApiProperty({ enum: [4] })
  schemaVersion!: 4;

  @ApiProperty({ enum: [true], example: true })
  accepted!: true;

  @ApiProperty()
  value!: { readonly requested: true; readonly challengeId: string };
}

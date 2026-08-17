import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const ROLES = ['owner', 'analyst', 'accounting', 'operations', 'technology', 'other'] as const;
const EXPERIENCES = ['exploring', 'trial', 'active'] as const;
const CATEGORIES = ['product', 'feature', 'data-trust', 'design', 'performance', 'other'] as const;

export class LandingFeedbackCommandDto {
  @ApiProperty({ enum: [4] })
  @Equals(4)
  schemaVersion!: 4;

  @ApiProperty({ format: 'email', example: 'nguyen.van.an@example.vn', maxLength: 160 })
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  organization?: string;

  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES)
  role!: (typeof ROLES)[number];

  @ApiProperty({ enum: EXPERIENCES })
  @IsIn(EXPERIENCES)
  experience!: (typeof EXPERIENCES)[number];

  @ApiProperty({ enum: CATEGORIES })
  @IsIn(CATEGORIES)
  category!: (typeof CATEGORIES)[number];

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  rating!: number;

  @ApiProperty({ minLength: 10, maxLength: 1200 })
  @IsString()
  @MinLength(10)
  @MaxLength(1200)
  message!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  contactPermission!: boolean;
}

export class LandingFeedbackAcceptedDto {
  @ApiProperty({ enum: [4] })
  schemaVersion!: 4;

  @ApiProperty({ format: 'date-time' })
  receivedAt!: string;

  @ApiProperty({ format: 'uuid' })
  referenceId!: string;
}

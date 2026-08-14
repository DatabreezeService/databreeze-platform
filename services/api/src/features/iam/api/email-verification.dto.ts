import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsIn, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class VerifyEmailRegistrationDto {
  @ApiProperty({ enum: [4] })
  @Equals(4)
  schemaVersion!: 4;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  challengeId!: string;

  @ApiProperty({ pattern: '^[0-9]{6}$' })
  @Matches(/^\d{6}$/u)
  code!: string;

  @ApiProperty({ minLength: 8, maxLength: 200 })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u)
  idempotencyKey!: string;

  @ApiProperty({ enum: ['android', 'desktop', 'web'] })
  @IsIn(['android', 'desktop', 'web'])
  clientPlatform!: 'android' | 'desktop' | 'web';
}

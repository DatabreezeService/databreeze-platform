import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class SignInDto {
  @ApiProperty({ example: 'ngu***@example.com', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ enum: ['android', 'desktop', 'web'] })
  @IsIn(['android', 'desktop', 'web'])
  clientPlatform!: 'android' | 'desktop' | 'web';
}

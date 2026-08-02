import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SessionRefreshDto {
  @ApiProperty({ enum: ['android', 'desktop', 'web'] })
  @IsIn(['android', 'desktop', 'web'])
  clientPlatform!: 'android' | 'desktop' | 'web';

  @ApiProperty({ minLength: 1, maxLength: 4096, required: false, writeOnly: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  refreshToken?: string;
}

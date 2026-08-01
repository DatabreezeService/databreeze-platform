import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

const supportedPlatforms = ['android', 'desktop', 'web'] as const;

export class ClientCompatibilityDto {
  @ApiProperty({ enum: supportedPlatforms, example: 'web' })
  @IsIn(supportedPlatforms)
  clientPlatform!: (typeof supportedPlatforms)[number];

  @ApiProperty({ example: '1.2.3', maxLength: 32, pattern: '^\\d+\\.\\d+\\.\\d+' })
  @IsString()
  @MaxLength(32)
  @Matches(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
  clientVersion!: string;
}

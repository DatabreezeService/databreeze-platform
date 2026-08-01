import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

const supportedPlatforms = ['android', 'desktop', 'web'] as const;
export const CLIENT_VERSION_PATTERN_SOURCE =
  '^(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$';
const clientVersionPattern = new RegExp(CLIENT_VERSION_PATTERN_SOURCE);

export class ClientCompatibilityDto {
  @ApiProperty({ enum: supportedPlatforms, example: 'web' })
  @IsIn(supportedPlatforms)
  clientPlatform!: (typeof supportedPlatforms)[number];

  @ApiProperty({ example: '1.2.3', maxLength: 32, pattern: CLIENT_VERSION_PATTERN_SOURCE })
  @IsString()
  @MaxLength(32)
  @Matches(clientVersionPattern)
  clientVersion!: string;
}

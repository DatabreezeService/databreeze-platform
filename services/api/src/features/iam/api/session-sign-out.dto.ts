import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';

export class SessionSignOutDto {
  @ApiProperty({ enum: ['android', 'desktop', 'web'] })
  @IsIn(['android', 'desktop', 'web'])
  clientPlatform!: 'android' | 'desktop' | 'web';

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sessionId!: string;
}

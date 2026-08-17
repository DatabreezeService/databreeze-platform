import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsUUID } from 'class-validator';

export class ScopeSwitchDto {
  @ApiProperty({ enum: [4] })
  @Equals(4)
  schemaVersion!: 4;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workspaceId!: string;
}

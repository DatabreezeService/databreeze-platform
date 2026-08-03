import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Min } from 'class-validator';

export class UpdateContentPlacementDto {
  @ApiProperty()
  @IsBoolean()
  available!: boolean;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

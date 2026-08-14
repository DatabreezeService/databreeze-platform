import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class DashboardProposalRequestDtoV1 {
  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  question!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  analysisPlanVersionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetPageId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  targetWidgetId?: string;

  @ApiProperty({ enum: ['vi', 'en'] })
  @IsIn(['vi', 'en'])
  locale!: 'vi' | 'en';
}

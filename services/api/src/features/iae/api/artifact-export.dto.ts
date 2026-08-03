import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsISO8601, IsUUID, ArrayMaxSize, ArrayMinSize } from 'class-validator';

export class CreateArtifactExportDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  manifestId!: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1024)
  @IsUUID('4', { each: true })
  versionIds!: string[];

  @ApiProperty({ enum: ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'] })
  @IsIn(['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'])
  approvalState!: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  createdAt!: string;
}

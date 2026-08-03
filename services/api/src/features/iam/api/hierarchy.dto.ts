import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateWorkspaceDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

export class CreateProjectDto {
  @ApiProperty({ enum: ['INTERNAL', 'CLIENT', 'LOCATION', 'ENGAGEMENT'] })
  @IsIn(['INTERNAL', 'CLIENT', 'LOCATION', 'ENGAGEMENT'])
  kind!: 'INTERNAL' | 'CLIENT' | 'LOCATION' | 'ENGAGEMENT';

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

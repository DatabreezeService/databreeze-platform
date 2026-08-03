import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

const PROJECT_KINDS = ['INTERNAL', 'CLIENT', 'LOCATION', 'ENGAGEMENT'] as const;
type ProjectKindDtoV1 = (typeof PROJECT_KINDS)[number];

export class CreateWorkspaceDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

export class CreateProjectDto {
  @ApiProperty({ enum: PROJECT_KINDS })
  @IsIn(PROJECT_KINDS)
  kind!: ProjectKindDtoV1;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

const PROJECT_KINDS = ['INTERNAL', 'CLIENT', 'LOCATION', 'ENGAGEMENT'] as const;
type ProjectKindDtoV1 = (typeof PROJECT_KINDS)[number];

export class CreateWorkspaceDto {
  @ApiProperty({ enum: [4] })
  @Equals(4)
  schemaVersion!: 4;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

export class CreateWorkspaceAcceptedDto {
  @ApiProperty({ enum: [4] })
  schemaVersion!: 4;

  @ApiProperty()
  workspace!: {
    readonly id: string;
    readonly organizationId: string;
    readonly name: string;
    readonly status: string;
    readonly dataMode: 'LOCAL' | 'HYBRID' | 'CLOUD';
    readonly createdAt: string;
  };

  @ApiProperty()
  defaultProject!: { readonly id: string; readonly kind: string; readonly name: string };
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

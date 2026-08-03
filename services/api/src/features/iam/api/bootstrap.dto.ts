import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BootstrapUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({ enum: ['vi-VN', 'en'] })
  locale!: 'vi-VN' | 'en';

  @ApiProperty({ enum: ['ENABLED', 'NOT_CONFIGURED'] })
  mfaState!: 'ENABLED' | 'NOT_CONFIGURED';
}

export class BootstrapProjectDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['INTERNAL', 'CLIENT', 'LOCATION', 'ENGAGEMENT'] })
  kind!: 'INTERNAL' | 'CLIENT' | 'LOCATION' | 'ENGAGEMENT';

  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] })
  status!: 'ACTIVE' | 'ARCHIVED';
}

export class BootstrapWorkspaceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] })
  status!: 'ACTIVE' | 'ARCHIVED';

  @ApiProperty({ type: [BootstrapProjectDto] })
  projects!: BootstrapProjectDto[];
}

export class BootstrapOrganizationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  personal!: boolean;

  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'] })
  status!: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

  @ApiProperty({ type: [BootstrapWorkspaceDto] })
  workspaces!: BootstrapWorkspaceDto[];
}

export class BootstrapScopeDto {
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  workspaceId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  projectId?: string;
}

export class BootstrapSessionDto {
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  workspaceId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  projectId?: string;

  @ApiProperty({ minimum: 1 })
  authorizationEpoch!: number;
}

export class BootstrapPlatformDto {
  @ApiProperty({ enum: ['v1'] })
  apiVersion!: 'v1';
}

export class BootstrapValueDto {
  @ApiProperty({ type: BootstrapUserDto })
  user!: BootstrapUserDto;

  @ApiProperty({ type: [BootstrapOrganizationDto] })
  organizations!: BootstrapOrganizationDto[];

  @ApiProperty({ type: [BootstrapScopeDto] })
  recentScopes!: BootstrapScopeDto[];

  @ApiProperty({ type: BootstrapSessionDto })
  session!: BootstrapSessionDto;

  @ApiProperty({ type: BootstrapPlatformDto })
  platform!: BootstrapPlatformDto;
}

export class BootstrapResponseDto {
  @ApiProperty()
  accepted!: boolean;

  @ApiPropertyOptional({ type: BootstrapValueDto })
  value?: BootstrapValueDto;

  @ApiPropertyOptional({ enum: ['INVALID_IDENTIFIER', 'NOT_FOUND', 'UNAVAILABLE'] })
  code?: 'INVALID_IDENTIFIER' | 'NOT_FOUND' | 'UNAVAILABLE';
}

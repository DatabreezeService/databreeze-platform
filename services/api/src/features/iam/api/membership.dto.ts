import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsEmail,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
} from 'class-validator';
import type { ValidationArguments, ValidatorConstraintInterface } from 'class-validator';

const MEMBERSHIP_SCOPE_TYPES = ['organization', 'workspace', 'project'] as const;
const MEMBERSHIP_ROLE_IDS = [
  'owner',
  'admin',
  'analyst',
  'operator',
  'approver',
  'viewer',
] as const;
const MEMBERSHIP_ACCESS_PRESETS = ['OWNER', 'EDITOR', 'VIEWER'] as const;
const MEMBERSHIP_ERROR_CODES = [
  'INVALID_IDENTIFIER',
  'INVALID_SCOPE',
  'INVALID_ROLE',
  'INVALID_STATE',
  'SCOPE_DENIED',
  'NOT_FOUND',
  'CONFLICT',
  'EXPIRED',
  'LAST_OWNER',
  'UNAVAILABLE',
] as const;
type MembershipScopeTypeDtoV1 = (typeof MEMBERSHIP_SCOPE_TYPES)[number];
type MembershipRoleIdDtoV1 = (typeof MEMBERSHIP_ROLE_IDS)[number];
type MembershipErrorCodeDtoV1 = (typeof MEMBERSHIP_ERROR_CODES)[number];

@ValidatorConstraint({ name: 'membershipScopeShape', async: false })
class MembershipScopeShapeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const scope = args.object as Partial<MembershipScopeDto>;
    if (!MEMBERSHIP_SCOPE_TYPES.includes(scope.scopeType as MembershipScopeTypeDtoV1)) return true;
    if (scope.scopeType === 'organization')
      return scope.workspaceId === undefined && scope.projectId === undefined;
    if (typeof scope.workspaceId !== 'string') return false;
    if (scope.scopeType === 'workspace') return scope.projectId === undefined;
    return typeof scope.projectId === 'string';
  }

  defaultMessage(): string {
    return 'workspaceId and projectId must match scopeType';
  }
}

export class MembershipScopeDto {
  @ApiProperty({ enum: MEMBERSHIP_SCOPE_TYPES })
  @IsIn(MEMBERSHIP_SCOPE_TYPES)
  @Validate(MembershipScopeShapeConstraint)
  scopeType!: MembershipScopeTypeDtoV1;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  organizationId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}

export class InviteMembershipDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Existing principal id. Prefer recipientEmail for the UI.',
  })
  @IsOptional()
  @IsUUID()
  principalId?: string;

  @ApiPropertyOptional({ format: 'email', maxLength: 254 })
  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  @ApiPropertyOptional({
    type: MembershipScopeDto,
    description:
      'Legacy compatibility only. When omitted, the server uses the authenticated request scope.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => MembershipScopeDto)
  scope?: MembershipScopeDto;

  @ApiPropertyOptional({ enum: MEMBERSHIP_ROLE_IDS })
  @IsOptional()
  @IsIn(MEMBERSHIP_ROLE_IDS)
  roleId?: MembershipRoleIdDtoV1;

  @ApiPropertyOptional({ enum: MEMBERSHIP_ACCESS_PRESETS })
  @IsOptional()
  @IsIn(MEMBERSHIP_ACCESS_PRESETS)
  accessPreset?: (typeof MEMBERSHIP_ACCESS_PRESETS)[number];
}

export class SetMembershipAccessPresetDto {
  @ApiProperty({ enum: MEMBERSHIP_ACCESS_PRESETS })
  @IsIn(MEMBERSHIP_ACCESS_PRESETS)
  accessPreset!: (typeof MEMBERSHIP_ACCESS_PRESETS)[number];

  @ApiProperty({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRevision!: number;
}

export class MembershipRejectedResponseDto {
  @ApiProperty({ enum: [false], example: false })
  accepted!: false;

  @ApiProperty({ enum: MEMBERSHIP_ERROR_CODES })
  code!: MembershipErrorCodeDtoV1;
}

export class TransitionMembershipDto {
  @ApiProperty({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRevision!: number;

  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'REMOVED'] })
  @IsIn(['ACTIVE', 'SUSPENDED', 'REMOVED'])
  status!: 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
}

export class AcceptMembershipDto {
  @ApiProperty({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRevision!: number;
}

export class TransferOwnershipDto {
  @ApiProperty({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRevision!: number;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
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
type MembershipScopeTypeDtoV1 = (typeof MEMBERSHIP_SCOPE_TYPES)[number];
type MembershipRoleIdDtoV1 = (typeof MEMBERSHIP_ROLE_IDS)[number];

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
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  principalId!: string;

  @ApiProperty({ type: MembershipScopeDto })
  @ValidateNested()
  @Type(() => MembershipScopeDto)
  scope!: MembershipScopeDto;

  @ApiProperty({ enum: MEMBERSHIP_ROLE_IDS })
  @IsIn(MEMBERSHIP_ROLE_IDS)
  roleId!: MembershipRoleIdDtoV1;
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

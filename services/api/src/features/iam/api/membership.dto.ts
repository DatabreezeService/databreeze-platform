import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class MembershipScopeDto {
  @ApiProperty({ enum: ['organization', 'workspace', 'project'] })
  @IsIn(['organization', 'workspace', 'project'])
  scopeType!: 'organization' | 'workspace' | 'project';

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

  @ApiProperty({ enum: ['owner', 'admin', 'analyst', 'operator', 'approver', 'viewer'] })
  @IsIn(['owner', 'admin', 'analyst', 'operator', 'approver', 'viewer'])
  roleId!: 'owner' | 'admin' | 'analyst' | 'operator' | 'approver' | 'viewer';
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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateApprovalPolicyDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() policyId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() workspaceId!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ additionalProperties: { type: 'string' } }) @IsObject() actionMatcher!: Record<string, string>;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) minimumApprovals!: number;
  @ApiProperty({ type: [String] }) @IsString({ each: true }) eligibleRoles!: string[];
  @ApiProperty() @IsBoolean() selfApprovalAllowed!: boolean;
  @ApiProperty({ minimum: 1, maximum: 43200 }) @IsInt() @Min(1) @Max(43200) expiresAfterMinutes!: number;
  @ApiProperty() @IsBoolean() requireMfa!: boolean;
  @ApiPropertyOptional({ enum: ['DRAFT', 'ACTIVE', 'RETIRED'] }) @IsOptional() @IsIn(['DRAFT', 'ACTIVE', 'RETIRED']) status?: 'DRAFT' | 'ACTIVE' | 'RETIRED';
}

export class CreateApprovalRequestDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() requestId!: string;
  @ApiProperty({ additionalProperties: true }) @IsObject() tenantScope!: Record<string, unknown>;
  @ApiProperty({ maxLength: 80 }) @IsString() @MinLength(1) @MaxLength(80) subjectType!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() subjectId!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) subjectVersion!: number;
  @ApiProperty({ minLength: 64, maxLength: 64 }) @IsString() @MinLength(64) @MaxLength(64) subjectHash!: string;
  @ApiProperty({ maxLength: 80 }) @IsString() @MinLength(1) @MaxLength(80) requestedAction!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() policyId!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) policyVersion!: number;
  @ApiProperty({ format: 'uuid' }) @IsUUID() requestedBy!: string;
  @ApiProperty({ format: 'date-time' }) @IsString() createdAt!: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsString() dueAt?: string;
}

export class DecideApprovalDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() decisionId!: string;
  @ApiProperty({ enum: ['APPROVE', 'REJECT'] }) @IsIn(['APPROVE', 'REJECT']) decision!: 'APPROVE' | 'REJECT';
  @ApiPropertyOptional({ maxLength: 512 }) @IsOptional() @IsString() @MaxLength(512) reason?: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() mfaAssertionId!: string;
  @ApiProperty({ minLength: 64, maxLength: 64 }) @IsString() @MinLength(64) @MaxLength(64) subjectHash!: string;
  @ApiProperty({ format: 'date-time' }) @IsString() decidedAt!: string;
  @ApiProperty({ maxLength: 64 }) @IsString() @MinLength(1) @MaxLength(64) actorRole!: string;
}

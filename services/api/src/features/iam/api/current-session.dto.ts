import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/** IAM-009: the redacted identity projection used to hydrate an authenticated client. */
export class CurrentSessionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  organizationId!: string;

  @ApiProperty({ format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @ApiProperty({ minimum: 1 })
  authorizationEpoch!: number;

}

import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import type { InboxPriorityV1 } from '@databreeze/domain/artifact-intake/v1';

/** IAE-001: content-free, idempotent intake registration request. */
export class CreateInboxItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  inboxItemId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  artifactVersionId!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  createdAt!: string;

  @ApiProperty({ minLength: 1, maxLength: 200, required: false })
  @MaxLength(200)
  @MinLength(1)
  idempotencyKey?: string;
}

/** IAE-013: revisioned, content-free inbox triage metadata patch. */
export class UpdateInboxMetadataDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true, required: false })
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @ApiProperty({ type: [String], maxItems: 32, required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  labels?: string[];

  @ApiProperty({ enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'], required: false })
  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  priority?: InboxPriorityV1;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, required: false })
  @IsOptional()
  @IsISO8601()
  dueAt?: string | null;

  @ApiProperty({ minimum: 1, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedRevision?: number;
}

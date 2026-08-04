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
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import type { InboxPriorityV1 } from '@databreeze/domain/artifact-intake/v1';

const strictUtcTimestampPattern = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$';

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
  @ApiProperty({
    oneOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }],
    required: false,
  })
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

  @ApiProperty({
    oneOf: [
      { type: 'string', format: 'date-time', pattern: strictUtcTimestampPattern },
      { type: 'null' },
    ],
    required: false,
  })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
  dueAt?: string | null;

  @ApiProperty({ type: 'integer', minimum: 1, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedRevision?: number;
}

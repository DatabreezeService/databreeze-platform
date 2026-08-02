import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsUUID, MaxLength, MinLength } from 'class-validator';

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

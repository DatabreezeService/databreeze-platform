import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength } from 'class-validator';

/** SA-001: only opaque artifact identity and a registered processor version cross the API. */
export class AdmitSpreadsheetAuditRunDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  artifactVersionId!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MaxLength(128)
  processorVersion!: string;
}

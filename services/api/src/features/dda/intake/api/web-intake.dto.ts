export interface WebIntakeFinalizeDtoV1 {
  readonly sessionId: string;
  readonly fileName: string;
  readonly claimedMediaType: string;
  readonly expectedSha256: string;
  readonly contentBase64: string;
  readonly declaredEncoding?: string;
}

export interface WebIntakeFinalizeResponseDtoV1 {
  readonly accepted: true;
  readonly sessionId: string;
  readonly artifactVersionId: string;
  readonly status: 'FINALIZED';
  readonly profileId: 'dda.web.tabular.v1';
}

export class WebIntakeUploadDtoV1 {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ example: 'text/csv' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  claimedMediaType!: string;

  @ApiProperty({ pattern: '^[a-f0-9]{64}$' })
  @Matches(/^[a-f0-9]{64}$/u)
  expectedSha256!: string;

  @ApiProperty({ description: 'Base64-encoded CSV/XLSX bytes', maxLength: 700000 })
  @IsBase64()
  @MaxLength(700000)
  contentBase64!: string;

  @ApiProperty({ minLength: 8, maxLength: 200 })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u)
  idempotencyKey!: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  declaredEncoding?: string;
}

export interface WebIntakeUploadResponseDtoV1 {
  readonly accepted: true;
  readonly sessionId: string;
  readonly artifactVersionId: string;
  readonly status: 'PENDING_REVIEW';
  readonly profileId: 'dda.web.tabular.v1';
  readonly replayed: boolean;
}
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBase64, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

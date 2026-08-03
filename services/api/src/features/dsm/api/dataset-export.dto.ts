import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsISO8601, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

export class CreateDatasetExportManifestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  manifestId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  datasetId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  datasetVersionId!: string;

  @ApiProperty({ enum: ['LOCAL', 'HYBRID', 'CLOUD'] })
  @IsIn(['LOCAL', 'HYBRID', 'CLOUD'])
  dataMode!: 'LOCAL' | 'HYBRID' | 'CLOUD';

  @ApiProperty({ enum: ['GOVERNED_DATA', 'APPROVED_DERIVED_RESULT'] })
  @IsIn(['GOVERNED_DATA', 'APPROVED_DERIVED_RESULT'])
  payloadClass!: 'GOVERNED_DATA' | 'APPROVED_DERIVED_RESULT';

  @ApiProperty({ enum: ['CSV', 'JSONL', 'PARQUET', 'XLSX'] })
  @IsIn(['CSV', 'JSONL', 'PARQUET', 'XLSX'])
  format!: 'CSV' | 'JSONL' | 'PARQUET' | 'XLSX';

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  rowCount!: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  byteSize!: number;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  contentSha256!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  schemaVersionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  mappingVersionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  ruleSetVersionId!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  semanticManifestHash!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  metricManifestHash!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  qualityManifestHash!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  lineageManifestHash!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  evidenceManifestHash!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  policyHash!: string;

  @ApiProperty({ enum: ['PASS', 'PASS_WITH_WARNINGS', 'BLOCKED', 'INCOMPLETE'] })
  @IsIn(['PASS', 'PASS_WITH_WARNINGS', 'BLOCKED', 'INCOMPLETE'])
  qualityState!: 'PASS' | 'PASS_WITH_WARNINGS' | 'BLOCKED' | 'INCOMPLETE';

  @ApiProperty({ enum: ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'] })
  @IsIn(['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'])
  approvalState!: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  createdAt!: string;
}

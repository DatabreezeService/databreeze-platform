import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class RegisterDatasetVersionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  datasetId!: string;

  @ApiProperty({ format: 'uuid', type: [String] })
  @IsArray()
  @ArrayMaxSize(1024)
  @IsUUID('4', { each: true })
  inputArtifactVersionIds!: string[];

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  schemaVersionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  mappingVersionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  ruleSetVersionId!: string;

  @ApiProperty({ minLength: 1, maxLength: 128 })
  @MinLength(1)
  engineBuild!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @IsUUID()
  versionId!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @MinLength(64)
  contentFingerprint!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  rowCount!: number;

  @ApiProperty({ enum: ['PASS', 'PASS_WITH_WARNINGS', 'BLOCKED', 'INCOMPLETE'] })
  @IsIn(['PASS', 'PASS_WITH_WARNINGS', 'BLOCKED', 'INCOMPLETE'])
  qualityState!: 'PASS' | 'PASS_WITH_WARNINGS' | 'BLOCKED' | 'INCOMPLETE';

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @MinLength(64)
  lineageManifestHash!: string;
}

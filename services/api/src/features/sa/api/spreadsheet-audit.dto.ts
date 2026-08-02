import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const sha256Pattern = '^[0-9a-f]{64}$';

export class SpreadsheetAuditSheetDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sheetId!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MaxLength(128)
  name!: string;

  @ApiProperty({ minimum: 0, maximum: 1_000_000 })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  maxRow!: number;

  @ApiProperty({ minimum: 0, maximum: 16_384 })
  @IsInt()
  @Min(0)
  @Max(16_384)
  maxColumn!: number;

  @ApiProperty({ minimum: 0, maximum: 1_000_000 })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  formulaCount!: number;
}

export class SpreadsheetAuditFindingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  findingId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sheetId!: string;

  @ApiProperty({ pattern: '^[A-Za-z]{1,3}[1-9][0-9]*$' })
  @IsString()
  @Matches(/^[A-Za-z]{1,3}[1-9][0-9]*$/u)
  address!: string;

  @ApiProperty({ enum: ['FORMULA_FAMILY_OUTLIER', 'FORMULA_GAP'] })
  @IsIn(['FORMULA_FAMILY_OUTLIER', 'FORMULA_GAP'])
  kind!: 'FORMULA_FAMILY_OUTLIER' | 'FORMULA_GAP';

  @ApiProperty({ enum: ['INFO', 'WARNING', 'ERROR'] })
  @IsIn(['INFO', 'WARNING', 'ERROR'])
  severity!: 'INFO' | 'WARNING' | 'ERROR';

  @ApiProperty({ pattern: sha256Pattern })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  formulaFingerprint!: string;
}

export class CreateSpreadsheetAuditResultDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  auditId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  artifactVersionId!: string;

  @ApiProperty({ pattern: sha256Pattern })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  workbookSha256!: string;

  @ApiProperty({ type: [SpreadsheetAuditSheetDto], minItems: 1, maxItems: 512 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(512)
  @ValidateNested({ each: true })
  @Type(() => SpreadsheetAuditSheetDto)
  sheets!: SpreadsheetAuditSheetDto[];

  @ApiProperty({ type: [SpreadsheetAuditFindingDto], maxItems: 10_000 })
  @IsArray()
  @ArrayMaxSize(10_000)
  @ValidateNested({ each: true })
  @Type(() => SpreadsheetAuditFindingDto)
  findings!: SpreadsheetAuditFindingDto[];

  @ApiProperty({ enum: ['MACRO', 'EXTERNAL_LINK', 'UNSUPPORTED_XML'], isArray: true })
  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(['MACRO', 'EXTERNAL_LINK', 'UNSUPPORTED_XML'], { each: true })
  blockedReasons!: Array<'MACRO' | 'EXTERNAL_LINK' | 'UNSUPPORTED_XML'>;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MaxLength(128)
  processorVersion!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  createdAt!: string;
}

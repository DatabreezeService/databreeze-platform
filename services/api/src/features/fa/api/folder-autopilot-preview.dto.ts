import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

const sha256Pattern = /^[0-9a-f]{64}$/u;
const extensionPattern = /^\.?[A-Za-z0-9]{1,15}$/u;
const opaqueFileIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const actions = ['COPY', 'MOVE', 'RENAME', 'ROUTE'] as const;

function isRelativePath(value: unknown, allowTemplate: boolean): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > 260) return false;
  if (/\p{Cc}/u.test(value)) return false;
  const normalized = value.normalize('NFC').replaceAll('\\', '/');
  const rendered = allowTemplate
    ? normalized.replace(/\{\{(?:name|stem|ext)\}\}/gu, 'sample')
    : normalized;
  if (rendered.startsWith('/') || /^[A-Za-z]:/u.test(rendered)) return false;
  return rendered
    .split('/')
    .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

@ValidatorConstraint({ name: 'isFolderAutopilotRelativePath', async: false })
class FolderAutopilotRelativePathConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isRelativePath(value, false);
  }
}

@ValidatorConstraint({ name: 'isFolderAutopilotDestinationTemplate', async: false })
class FolderAutopilotDestinationTemplateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isRelativePath(value, true);
  }
}

export class FolderAutopilotFilterDto {
  @ApiPropertyOptional({ type: [String], maxItems: 64, example: ['xlsx', 'csv'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  @Matches(extensionPattern, { each: true })
  extensions?: string[];

  @ApiPropertyOptional({ maxLength: 260, example: 'incoming' })
  @IsOptional()
  @IsString()
  @MaxLength(260)
  @Validate(FolderAutopilotRelativePathConstraint)
  prefix?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  maxBytes?: number;
}

export class FolderAutopilotStepDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  stepId!: string;

  @ApiProperty({ enum: actions })
  @IsIn(actions)
  action!: (typeof actions)[number];

  @ApiProperty({ maxLength: 260, example: 'review/{{name}}' })
  @IsString()
  @MaxLength(260)
  @Validate(FolderAutopilotDestinationTemplateConstraint)
  destinationTemplate!: string;

  @ApiProperty()
  @IsBoolean()
  approvalRequired!: boolean;
}

export class FolderAutopilotPreviewFileDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MaxLength(128)
  @Matches(opaqueFileIdentifierPattern)
  fileId!: string;

  @ApiProperty({ maxLength: 260, example: 'incoming/invoice.xlsx' })
  @IsString()
  @MaxLength(260)
  @Validate(FolderAutopilotRelativePathConstraint)
  relativePath!: string;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  sizeBytes!: number;

  @ApiProperty({ pattern: sha256Pattern.source })
  @IsString()
  @Matches(sha256Pattern)
  contentSha256!: string;
}

/**
 * Bounded metadata for an in-memory dry-run only. It has no path, tenant,
 * device credential, approval decision, or execution authority field.
 */
export class PreviewFolderAutopilotRecipeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  recipeId!: string;

  @ApiProperty({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  version!: number;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MaxLength(128)
  name!: string;

  @ApiProperty({ type: () => FolderAutopilotFilterDto })
  @IsObject()
  @ValidateNested()
  @Type(() => FolderAutopilotFilterDto)
  filter!: FolderAutopilotFilterDto;

  @ApiProperty({ type: () => [FolderAutopilotStepDto], maxItems: 64 })
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => FolderAutopilotStepDto)
  steps!: FolderAutopilotStepDto[];

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  inputDeviceGrantId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  outputDeviceGrantId!: string;

  @ApiProperty({ pattern: sha256Pattern.source })
  @IsString()
  @Matches(sha256Pattern)
  capabilityDigest!: string;

  @ApiProperty({ pattern: sha256Pattern.source })
  @IsString()
  @Matches(sha256Pattern)
  recipeHash!: string;

  @ApiProperty({ type: () => [FolderAutopilotPreviewFileDto], maxItems: 256 })
  @IsArray()
  @ArrayMaxSize(256)
  @ValidateNested({ each: true })
  @Type(() => FolderAutopilotPreviewFileDto)
  files!: FolderAutopilotPreviewFileDto[];
}

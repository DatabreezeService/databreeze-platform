import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** DDA-033 freshness response DTO — no raw result cells. */
export class DashboardFreshnessResponseDto {
  @ApiProperty()
  dashboardId!: string;

  @ApiProperty({ enum: ['ON_CHANGE', 'MANUAL', 'SCHEDULED'] })
  freshnessPolicy!: 'ON_CHANGE' | 'MANUAL' | 'SCHEDULED';

  @ApiProperty({ enum: ['CURRENT', 'PENDING', 'STALE', 'BLOCKED', 'SOURCE_UNAVAILABLE'] })
  freshnessState!: 'CURRENT' | 'PENDING' | 'STALE' | 'BLOCKED' | 'SOURCE_UNAVAILABLE';

  @ApiPropertyOptional()
  lastSuccessfulRefreshAt?: string;

  @ApiPropertyOptional()
  inputSelectorHash?: string;

  @ApiPropertyOptional()
  dashboardVersionId?: string;

  @ApiPropertyOptional()
  permissionProjectionVersionId?: string;

  @ApiPropertyOptional()
  pendingDurationMs?: number;

  @ApiPropertyOptional()
  reasonCode?: string;

  @ApiPropertyOptional()
  lastGoodSnapshotId?: string;

  @ApiProperty({ enum: ['COMPLETE', 'SAMPLED', 'TRUNCATED', 'UNKNOWN'] })
  resultCompleteness!: 'COMPLETE' | 'SAMPLED' | 'TRUNCATED' | 'UNKNOWN';

  @ApiProperty({ enum: ['NONE', 'SAMPLED'] })
  samplingState!: 'NONE' | 'SAMPLED';

  @ApiProperty({ enum: ['NONE', 'TRUNCATED'] })
  truncationState!: 'NONE' | 'TRUNCATED';
}

export class ContentSafeRefreshEventDto {
  @ApiProperty()
  sequence!: number;

  @ApiProperty()
  dashboardId!: string;

  @ApiProperty()
  snapshotId!: string;

  @ApiProperty({ enum: ['FRESH', 'STALE', 'PENDING', 'BLOCKED', 'SOURCE_UNAVAILABLE'] })
  freshnessState!: 'FRESH' | 'STALE' | 'PENDING' | 'BLOCKED' | 'SOURCE_UNAVAILABLE';

  @ApiProperty()
  eventHash!: string;

  @ApiProperty()
  occurredAt!: string;
}

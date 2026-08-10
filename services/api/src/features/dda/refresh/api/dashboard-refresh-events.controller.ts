import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  RefreshEventBus,
  type ContentSafeRefreshEventV1,
} from '../application/refresh-event-bus.js';

export interface RefreshEventSubscribeContextV1 {
  readonly tenantScope: TenantScopeV1;
  readonly dashboardId: string;
  readonly cursor: number;
  readonly authorized?: boolean;
}

export type RefreshEventSubscribeResultV1 =
  | {
      readonly accepted: true;
      readonly value: {
        readonly events: readonly ContentSafeRefreshEventV1[];
        readonly reconcileViaRest: boolean;
        readonly reasonCode?: 'CURSOR_GAP';
      };
    }
  | { readonly accepted: false; readonly code: 'PERMISSION_CHANGED' };

/**
 * DDA-034 content-safe committed-event SSE hints.
 * Clients must reconcile authorized state through REST after gaps.
 */
@ApiTags('dda-dashboard-refresh-events')
@ApiBearerAuth()
@Controller('v1/dda/dashboards')
export class DashboardRefreshEventsController {
  public constructor(private readonly bus: RefreshEventBus) {}

  @Get(':dashboardId/refresh-events')
  @ApiOperation({ summary: 'Subscribe to content-safe committed refresh events' })
  public subscribe(
    context: RefreshEventSubscribeContextV1,
    @Param('dashboardId') _dashboardId?: string,
    @Query('cursor') _cursor?: string,
  ): RefreshEventSubscribeResultV1 {
    if (context.authorized === false) {
      return Object.freeze({ accepted: false, code: 'PERMISSION_CHANGED' });
    }

    const listed = this.bus.listFor({
      tenantScope: context.tenantScope,
      dashboardId: context.dashboardId,
      cursor: context.cursor,
    });

    if (context.cursor > 0 && listed.highestSequence > 0 && context.cursor > listed.highestSequence) {
      return Object.freeze({
        accepted: true,
        value: Object.freeze({
          events: Object.freeze([] as ContentSafeRefreshEventV1[]),
          reconcileViaRest: true,
          reasonCode: 'CURSOR_GAP' as const,
        }),
      });
    }

    // Gap inside the stream (missing sequences after cursor) also forces REST reconcile.
    if (context.cursor > 0 && listed.events.length > 0) {
      const expected = context.cursor + 1;
      if ((listed.events[0]?.sequence ?? expected) > expected) {
        return Object.freeze({
          accepted: true,
          value: Object.freeze({
            events: Object.freeze([] as ContentSafeRefreshEventV1[]),
            reconcileViaRest: true,
            reasonCode: 'CURSOR_GAP' as const,
          }),
        });
      }
    }

    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        events: listed.events,
        reconcileViaRest: false,
      }),
    });
  }
}

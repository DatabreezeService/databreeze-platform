import {
  BadRequestException,
  Controller,
  ForbiddenException,
  HttpException,
  Inject,
  Optional,
  Param,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  Sse,
  UnauthorizedException,
  type MessageEvent,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import { Observable } from 'rxjs';

import {
  MAX_REFRESH_EVENT_REPLAY_V1,
  RefreshEventBus,
  type ContentSafeRefreshEventV1,
  type RefreshEventStreamSubscriptionV1,
  validateContentSafeRefreshEventV1,
} from '../application/refresh-event-bus.js';
import {
  DASHBOARD_AUTHORIZATION_PORT,
  hasClientAuthorityFields,
  type DashboardHttpAuthorizationPortV1,
} from '../../dashboard/application/dashboard-http-ports.js';
import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../../platform/http/request-tenant-context.port.js';

type ContentSafeRefreshEventPayloadV1 = Omit<ContentSafeRefreshEventV1, 'tenantScope'>;

interface RefreshEventHttpResponseV1 {
  statusCode: number;
}

const CURSOR_GAP_RECONCILIATION = Object.freeze({
  reconcileViaRest: true,
  reasonCode: 'CURSOR_GAP' as const,
});

/**
 * DDA-034 content-safe committed-event SSE stream.
 * Clients reconcile authorized dashboard state through REST after a gap.
 */
@ApiTags('dda-dashboard-refresh-events')
@ApiBearerAuth()
@Controller('v1/dda/dashboards')
export class DashboardRefreshEventsController {
  private readonly requestContext: RequestTenantContextPortV1;

  public constructor(
    private readonly bus: RefreshEventBus,
    @Optional()
    @Inject(REQUEST_TENANT_CONTEXT)
    requestContext?: RequestTenantContextPortV1,
    @Optional()
    @Inject(DASHBOARD_AUTHORIZATION_PORT)
    private readonly authorization?: DashboardHttpAuthorizationPortV1,
  ) {
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
  }

  @Sse(':dashboardId/refresh-events')
  @ApiOperation({ summary: 'Subscribe to content-safe committed refresh events' })
  public async subscribe(
    @Req() request: unknown,
    @Param('dashboardId') dashboardId: string,
    @Query('cursor') cursor?: string,
    @Res({ passthrough: true }) response?: RefreshEventHttpResponseV1,
  ): Promise<Observable<MessageEvent>> {
    try {
      if (hasClientAuthorityFields(request)) {
        throw new BadRequestException({ code: 'INVALID_REFRESH_EVENT_REQUEST' });
      }
      const context = await this.resolveContext(request);
      const parsedDashboardId = this.resourceIdentifier(dashboardId);
      const parsedCursor = this.parseCursor(cursor ?? this.lastEventId(request));
      await this.requireInitialAuthorization(context, parsedDashboardId);

      try {
        const listed = await this.bus.listFor({
          tenantScope: context.tenantScope,
          dashboardId: parsedDashboardId,
          cursor: parsedCursor,
        });
        this.assertReplayEntriesSafe(listed);
      } catch (error) {
        if (error instanceof ServiceUnavailableException) throw error;
        throw new ServiceUnavailableException();
      }

      return this.createStream(context, parsedDashboardId, parsedCursor);
    } catch (error) {
      if (response === undefined) throw error;
      response.statusCode = error instanceof HttpException ? error.getStatus() : 503;
      return new Observable<MessageEvent>((subscriber) => subscriber.complete());
    }
  }

  private createStream(
    context: Awaited<ReturnType<RequestTenantContextPortV1['resolve']>>,
    parsedDashboardId: string,
    parsedCursor: number,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let closed = false;
      let listening = false;
      let queued = Promise.resolve();
      let streamSubscription: RefreshEventStreamSubscriptionV1 | undefined;
      let lastSequence = parsedCursor;
      const pending: ContentSafeRefreshEventV1[] = [];

      const close = (): void => {
        if (closed) return;
        closed = true;
        streamSubscription?.unsubscribe();
        if (!subscriber.closed) subscriber.complete();
      };

      const canEmit = async (): Promise<boolean> => {
        if (closed || this.authorization === undefined) return false;
        try {
          const decision = await this.authorization.authorizeDashboardAction({
            context,
            tenantScope: context.tenantScope,
            actorId: context.actorId,
            dashboardId: parsedDashboardId,
            action: 'SUBSCRIBE',
          });
          return decision.allowed;
        } catch {
          return false;
        }
      };

      const emitCursorGap = async (): Promise<void> => {
        if (!(await canEmit()) || closed) {
          close();
          return;
        }
        subscriber.next({
          type: 'dashboard-refresh-reconcile',
          data: CURSOR_GAP_RECONCILIATION,
        });
        close();
      };

      const processEvent = async (event: ContentSafeRefreshEventV1): Promise<void> => {
        if (closed) return;
        const validated = validateContentSafeRefreshEventV1(event);
        if (validated === undefined) {
          close();
          return;
        }

        const expectedSequence = lastSequence + 1;
        if (!Number.isSafeInteger(expectedSequence) || validated.sequence !== expectedSequence) {
          await emitCursorGap();
          return;
        }
        if (!(await canEmit()) || closed) {
          close();
          return;
        }

        subscriber.next({
          id: String(validated.sequence),
          type: 'dashboard-refresh',
          data: this.contentSafeEvent(validated),
        });
        lastSequence = validated.sequence;
      };

      const enqueue = (event: ContentSafeRefreshEventV1): void => {
        if (closed) return;
        queued = queued
          .then(() => processEvent(event))
          .catch(() => {
            close();
          });
      };

      const attach = (subscription: RefreshEventStreamSubscriptionV1): void => {
        if (closed) {
          subscription.unsubscribe();
          return;
        }
        streamSubscription = subscription;
        const replay = subscription.replay;
        const replayGap = this.replayHasGap(
          parsedCursor,
          replay,
          subscription.highestSequence,
          subscription.hasMore,
          subscription.oldestSequence,
        );
        if (replayGap === 'INVALID') {
          close();
          return;
        }

        if (replayGap === 'GAP') {
          listening = false;
          void emitCursorGap();
        } else {
          listening = true;
          for (const event of replay) enqueue(event);
          for (const event of pending) enqueue(event);
        }
      };

      const start = (): void => {
        try {
          const result = this.bus.listenFor(
            {
              tenantScope: context.tenantScope,
              dashboardId: parsedDashboardId,
              cursor: parsedCursor,
            },
            (event) => {
              if (listening) enqueue(event);
              else pending.push(event);
            },
            () => close(),
          );
          if (result instanceof Promise) void result.then(attach).catch(() => close());
          else attach(result);
        } catch {
          close();
        }
      };
      void start();

      return () => {
        closed = true;
        streamSubscription?.unsubscribe();
      };
    });
  }

  private async requireInitialAuthorization(
    context: Awaited<ReturnType<RequestTenantContextPortV1['resolve']>>,
    dashboardId: string,
  ): Promise<void> {
    if (this.authorization === undefined) throw new ServiceUnavailableException();
    let decision;
    try {
      decision = await this.authorization.authorizeDashboardAction({
        context,
        tenantScope: context.tenantScope,
        actorId: context.actorId,
        dashboardId,
        action: 'SUBSCRIBE',
      });
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!decision.allowed) {
      throw new ForbiddenException({ code: 'PERMISSION_CHANGED' });
    }
  }

  private assertReplayEntriesSafe(listed: {
    readonly events: readonly ContentSafeRefreshEventV1[];
    readonly highestSequence: number;
  }): void {
    if (
      !Number.isSafeInteger(listed.highestSequence) ||
      listed.highestSequence < 0 ||
      listed.events.length > MAX_REFRESH_EVENT_REPLAY_V1
    ) {
      throw new ServiceUnavailableException();
    }
    for (const event of listed.events) {
      if (validateContentSafeRefreshEventV1(event) === undefined) {
        throw new ServiceUnavailableException();
      }
    }
  }

  private replayHasGap(
    cursor: number,
    events: readonly ContentSafeRefreshEventV1[],
    highestSequence: number,
    hasMore = false,
    oldestSequence?: number,
  ): 'NONE' | 'GAP' | 'INVALID' {
    if (
      !Number.isSafeInteger(highestSequence) ||
      highestSequence < 0 ||
      events.length > MAX_REFRESH_EVENT_REPLAY_V1
    ) {
      return 'INVALID';
    }
    if (hasMore) return 'GAP';
    if (
      oldestSequence !== undefined &&
      (!Number.isSafeInteger(oldestSequence) || oldestSequence < 0)
    ) {
      return 'INVALID';
    }
    if (oldestSequence !== undefined && events.length > 0 && oldestSequence > cursor + 1) {
      return 'GAP';
    }
    if (cursor > highestSequence) return 'GAP';
    if (events.length === 0) return highestSequence > cursor ? 'GAP' : 'NONE';

    let expected = cursor + 1;
    for (const event of events) {
      const validated = validateContentSafeRefreshEventV1(event);
      if (validated === undefined) return 'INVALID';
      if (!Number.isSafeInteger(expected) || validated.sequence !== expected) return 'GAP';
      expected = validated.sequence + 1;
    }
    return 'NONE';
  }

  private resourceIdentifier(input: unknown): string {
    if (typeof input !== 'string') throw new BadRequestException({ code: 'INVALID_IDENTIFIER' });
    const parsed = parseStableIdentifierV1(input);
    if (!parsed.accepted) throw new BadRequestException({ code: 'INVALID_IDENTIFIER' });
    return parsed.value;
  }

  private parseCursor(input: unknown): number {
    if (input === undefined) return 0;
    if (typeof input !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(input)) {
      throw new BadRequestException({ code: 'INVALID_CURSOR' });
    }
    const cursor = Number(input);
    if (!Number.isSafeInteger(cursor)) throw new BadRequestException({ code: 'INVALID_CURSOR' });
    return cursor;
  }

  private lastEventId(request: unknown): string | undefined {
    if (typeof request !== 'object' || request === null) return undefined;
    const headers = (request as { readonly headers?: unknown }).headers;
    if (typeof headers !== 'object' || headers === null) return undefined;
    const record = headers as Record<string, unknown>;
    const value = record['last-event-id'] ?? record['Last-Event-ID'] ?? record['lastEventId'];
    return typeof value === 'string' ? value : undefined;
  }

  private contentSafeEvent(event: ContentSafeRefreshEventV1): ContentSafeRefreshEventPayloadV1 {
    const validated = validateContentSafeRefreshEventV1(event);
    if (validated === undefined) throw new Error('INVALID_REFRESH_EVENT');
    return Object.freeze({
      sequence: validated.sequence,
      dashboardId: validated.dashboardId,
      snapshotId: validated.snapshotId,
      freshnessState: validated.freshnessState,
      eventHash: validated.eventHash,
      occurredAt: validated.occurredAt,
    });
  }

  private async resolveContext(request: unknown) {
    try {
      return await this.requestContext.resolve(request);
    } catch (error) {
      if (error instanceof RequestTenantContextProblemError) {
        if (error.code === 'CONTEXT_INVALID') throw new BadRequestException();
        if (error.code === 'AUTHENTICATION_FAILED') throw new UnauthorizedException();
        throw new ServiceUnavailableException();
      }
      throw new ServiceUnavailableException();
    }
  }
}

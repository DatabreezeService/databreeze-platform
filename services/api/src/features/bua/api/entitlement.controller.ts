import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import type { EntitlementSnapshotV1, UsageLedgerStateV1 } from '@databreeze/domain/entitlements/v1';
import { parseV4Contract, type BuaEntitlementSummary } from '@databreeze/contracts/v4';

import {
  ENTITLEMENT_REPOSITORY_PORT,
  type EntitlementRepositoryPortV1,
} from '../application/entitlement-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import { EntitlementProblemError } from '../application/entitlement-problem.error.js';
import {
  ENTITLEMENT_LEASE_SERVICE,
  type EntitlementLeaseApplicationResultV1,
  type EntitlementLeaseService,
} from '../application/entitlement-lease.service.js';
import { IssueEntitlementLeaseDto, VerifyEntitlementLeaseDto } from './entitlement-lease.dto.js';

const ENTITLEMENT_SNAPSHOT_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: true,
};

const USAGE_LEDGER_RESPONSE_SCHEMA = {
  type: 'object',
  required: ['entries', 'reservations'] as string[],
  properties: {
    entries: { type: 'array', items: { type: 'object', additionalProperties: true } },
    reservations: { type: 'array', items: { type: 'object', additionalProperties: true } },
  },
  additionalProperties: false,
};

const ENTITLEMENT_SUMMARY_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'snapshot', 'aiCredits'],
  properties: {
    schemaVersion: { type: 'integer', enum: [4] },
    snapshot: { type: 'object', additionalProperties: true },
    aiCredits: {
      type: 'object',
      additionalProperties: false,
      required: ['metric', 'limit', 'used', 'reserved', 'remaining'],
      properties: {
        metric: { type: 'string', enum: ['job_count'] },
        limit: { type: 'integer', minimum: 0 },
        used: { type: 'integer', minimum: 0 },
        reserved: { type: 'integer', minimum: 0 },
        remaining: { type: 'integer', minimum: 0 },
      },
    },
  },
};
const ENTITLEMENT_SUMMARY_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v4/bua-entitlement-summary' as const;

@ApiTags('entitlements')
@ApiBearerAuth()
@Controller('v1/entitlements')
export class EntitlementController {
  public constructor(
    @Inject(ENTITLEMENT_REPOSITORY_PORT)
    private readonly repository: EntitlementRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT)
    private readonly requestContext: RequestTenantContextPortV1,
    @Inject(ENTITLEMENT_LEASE_SERVICE)
    private readonly leases: EntitlementLeaseService,
  ) {}

  private async executeLease<TValue>(
    work: () => Promise<EntitlementLeaseApplicationResultV1<TValue>>,
  ): Promise<TValue> {
    let result: EntitlementLeaseApplicationResultV1<TValue>;
    try {
      result = await work();
    } catch {
      throw new EntitlementProblemError('ENTITLEMENT_UNAVAILABLE');
    }
    if (result.accepted) return result.value;
    if (result.code === 'ENTITLEMENT_NOT_FOUND')
      throw new EntitlementProblemError('ENTITLEMENT_NOT_FOUND');
    if (result.code === 'LEASE_INVALID')
      throw new EntitlementProblemError('ENTITLEMENT_LEASE_INVALID');
    if (result.code === 'LEASE_STALE') throw new EntitlementProblemError('ENTITLEMENT_LEASE_STALE');
    if (result.code === 'UNAVAILABLE') throw new EntitlementProblemError('ENTITLEMENT_UNAVAILABLE');
    throw new EntitlementProblemError('ENTITLEMENT_REQUEST_INVALID');
  }

  @Get('snapshots/:snapshotId')
  @ApiOperation({ summary: 'Read one immutable entitlement snapshot in the caller scope' })
  @ApiOkResponse({ schema: ENTITLEMENT_SNAPSHOT_RESPONSE_SCHEMA })
  @ApiBadRequestResponse({ description: 'The snapshot identifier is invalid.' })
  @ApiNotFoundResponse({ description: 'The entitlement snapshot is not visible.' })
  @ApiServiceUnavailableResponse({ description: 'Entitlement persistence is unavailable.' })
  async snapshot(
    @Req() request: unknown,
    @Param('snapshotId') snapshotIdInput: string,
  ): Promise<EntitlementSnapshotV1> {
    const context = await this.requestContext.resolve(request);
    const parsed = parseStableIdentifierV1(snapshotIdInput);
    if (!parsed.accepted) throw new EntitlementProblemError('ENTITLEMENT_REQUEST_INVALID');
    try {
      const snapshot = await this.repository.findSnapshot(context, parsed.value);
      if (!snapshot) throw new EntitlementProblemError('ENTITLEMENT_NOT_FOUND');
      return snapshot;
    } catch (error) {
      if (error instanceof EntitlementProblemError) throw error;
      throw new EntitlementProblemError('ENTITLEMENT_UNAVAILABLE');
    }
  }

  @Get('usage')
  @ApiOperation({ summary: 'Read the append-only usage ledger state in the caller scope' })
  @ApiOkResponse({ schema: USAGE_LEDGER_RESPONSE_SCHEMA })
  @ApiServiceUnavailableResponse({ description: 'Usage persistence is unavailable.' })
  async usage(@Req() request: unknown): Promise<UsageLedgerStateV1> {
    const context = await this.requestContext.resolve(request);
    try {
      return await this.repository.listUsageState(context);
    } catch {
      throw new EntitlementProblemError('ENTITLEMENT_UNAVAILABLE');
    }
  }

  @Get('summary')
  @ApiOperation({ summary: 'Read the current plan and authoritative AI credit allowance' })
  @ApiOkResponse({ schema: ENTITLEMENT_SUMMARY_RESPONSE_SCHEMA })
  @ApiNotFoundResponse({ description: 'No current entitlement snapshot is visible.' })
  @ApiServiceUnavailableResponse({ description: 'Entitlement persistence is unavailable.' })
  async summary(@Req() request: unknown): Promise<BuaEntitlementSummary> {
    const context = await this.requestContext.resolve(request);
    try {
      const [snapshot, usage] = await Promise.all([
        this.repository.findCurrentSnapshot(context),
        this.repository.listUsageState(context),
      ]);
      if (!snapshot) throw new EntitlementProblemError('ENTITLEMENT_NOT_FOUND');
      const limit = snapshot.quotas.find((quota) => quota.metric === 'job_count')?.limit ?? 0;
      const used = usage.entries
        .filter((entry) => entry.metric === 'job_count' && entry.bucket === 'COMMITTED')
        .reduce((total, entry) => total + entry.deltaUnits, 0);
      const reserved = usage.reservations
        .filter(
          (reservation) => reservation.metric === 'job_count' && reservation.status === 'ACTIVE',
        )
        .reduce((total, reservation) => total + reservation.reservedUnits, 0);
      const safeUsed = Math.max(0, Number.isSafeInteger(used) ? used : 0);
      const safeReserved = Math.max(0, Number.isSafeInteger(reserved) ? reserved : 0);
      const candidate = Object.freeze({
        schemaVersion: 4 as const,
        snapshot,
        aiCredits: Object.freeze({
          metric: 'job_count' as const,
          limit,
          used: safeUsed,
          reserved: safeReserved,
          remaining: Math.max(0, limit - safeUsed - safeReserved),
        }),
      });
      const parsed = parseV4Contract<BuaEntitlementSummary>(
        ENTITLEMENT_SUMMARY_SCHEMA_ID,
        candidate,
      );
      if (!parsed.accepted) throw new EntitlementProblemError('ENTITLEMENT_UNAVAILABLE');
      return parsed.value;
    } catch (error) {
      if (error instanceof EntitlementProblemError) throw error;
      throw new EntitlementProblemError('ENTITLEMENT_UNAVAILABLE');
    }
  }

  @Post('snapshots/:snapshotId/leases')
  @ApiOperation({ summary: 'Issue a signed, bounded offline entitlement lease' })
  @ApiCreatedResponse({ schema: { type: 'object', additionalProperties: true } })
  @ApiBadRequestResponse({ description: 'The snapshot or expiry is invalid.' })
  @ApiNotFoundResponse({ description: 'The entitlement snapshot is not visible.' })
  @ApiServiceUnavailableResponse({ description: 'Lease signing or persistence is unavailable.' })
  async issueLease(
    @Req() request: unknown,
    @Param('snapshotId') snapshotId: string,
    @Body() input: IssueEntitlementLeaseDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.executeLease(() =>
      this.leases.issue(context, { snapshotId, expiresAt: input.expiresAt }),
    );
  }

  @Get('leases/:leaseId/verify')
  @ApiOperation({
    summary: 'Verify an offline entitlement lease against the current revision and epoch',
  })
  @ApiOkResponse({
    schema: { type: 'object', required: ['valid'], properties: { valid: { type: 'boolean' } } },
  })
  @ApiBadRequestResponse({ description: 'The lease verification input is invalid or stale.' })
  @ApiNotFoundResponse({ description: 'The lease is not visible.' })
  @ApiServiceUnavailableResponse({ description: 'Lease verification is unavailable.' })
  async verifyLease(
    @Req() request: unknown,
    @Param('leaseId') leaseId: string,
    @Query() input: VerifyEntitlementLeaseDto,
  ): Promise<{ readonly valid: true }> {
    const context = await this.requestContext.resolve(request);
    await this.executeLease(() =>
      this.leases.verify(context, {
        leaseId,
        snapshotRevision: input.snapshotRevision,
        securityEpoch: input.securityEpoch,
      }),
    );
    return Object.freeze({ valid: true });
  }
}

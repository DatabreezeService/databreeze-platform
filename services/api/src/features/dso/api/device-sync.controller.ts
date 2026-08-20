import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  DEVICE_SYNC_USE_CASE,
  type DeviceSyncUseCaseV1,
} from '../application/device-sync.use-case.js';
import {
  DEVICE_SYNC_CURSOR_SIGNER,
  type UnavailableDeviceSyncCursorSigner,
} from '../application/device-sync-cursor-signer.port.js';
import type { DeviceSyncCursorSignerV1 } from '@databreeze/domain/device-sync/v1';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import {
  CreateDeviceSyncConflictDto,
  CreateDeviceSyncOperationDto,
  CreateDeviceTransferReceiptDto,
  CreateStrictLocalPackageDto,
  PullDeviceSyncDto,
  BootstrapDeviceSyncCursorDto,
  PushDeviceSyncDto,
  TransitionDeviceSyncOperationDto,
} from './device-sync.dto.js';

@ApiTags('devices')
@ApiBearerAuth()
@Controller('v1/devices')
export class DeviceSyncController {
  public constructor(
    @Inject(DEVICE_SYNC_USE_CASE) private readonly sync: DeviceSyncUseCaseV1,
    @Inject(DEVICE_SYNC_CURSOR_SIGNER)
    private readonly cursorSigner: DeviceSyncCursorSignerV1 | UnavailableDeviceSyncCursorSigner,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  @Post('sync/operations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enqueue an opaque, tenant-scoped synchronization operation' })
  @ApiBody({ type: CreateDeviceSyncOperationDto })
  async enqueue(
    @Req() request: unknown,
    @Body() input: CreateDeviceSyncOperationDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.sync.enqueue(context, input);
  }

  @Get('sync/operations')
  @ApiOperation({ summary: 'List synchronization operation status without source content' })
  async list(@Req() request: unknown): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.sync.list(context);
  }

  @Post('sync/pull')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pull an opaque, signed, cursor-bound synchronization batch' })
  @ApiBody({ type: PullDeviceSyncDto })
  async pull(@Req() request: unknown, @Body() input: PullDeviceSyncDto): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.sync.pull(context, { ...input, signer: this.cursorSigner });
  }

  @Post('sync/cursors/bootstrap')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Issue the first signed device synchronization cursor' })
  @ApiBody({ type: BootstrapDeviceSyncCursorDto })
  async bootstrapCursor(
    @Req() request: unknown,
    @Body() input: BootstrapDeviceSyncCursorDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.sync.bootstrapCursor(context, input, this.cursorSigner);
  }

  @Post('sync/push')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Push a signed, dependency-ordered synchronization batch' })
  @ApiBody({ type: PushDeviceSyncDto })
  async push(@Req() request: unknown, @Body() input: PushDeviceSyncDto): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.sync.push(context, { ...input, signer: this.cursorSigner });
  }

  @Post('sync/operations/:operationId/transition')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Advance one synchronization operation with an expected revision' })
  @ApiBody({ type: TransitionDeviceSyncOperationDto })
  async transition(
    @Req() request: unknown,
    @Param('operationId') operationId: string,
    @Body() input: TransitionDeviceSyncOperationDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.sync.transition(context, operationId, input.transition, input.at);
  }

  @Post('sync/conflicts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a conflict and stop the affected operation' })
  @ApiBody({ type: CreateDeviceSyncConflictDto })
  async createConflict(
    @Req() request: unknown,
    @Body() input: CreateDeviceSyncConflictDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.sync.recordConflict(context, input);
  }

  @Get('sync/conflicts')
  @ApiOperation({ summary: 'List explicit synchronization conflicts' })
  async listConflicts(@Req() request: unknown): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.sync.listConflicts(context);
  }

  @Post('sync/packages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Issue a digest-only strict-Local package manifest' })
  @ApiBody({ type: CreateStrictLocalPackageDto })
  async issuePackage(
    @Req() request: unknown,
    @Body() input: CreateStrictLocalPackageDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.sync.issueStrictLocalPackage(context, input);
  }

  @Post('sync/packages/receipts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a content-safe strict-Local transfer receipt' })
  @ApiBody({ type: CreateDeviceTransferReceiptDto })
  async receipt(
    @Req() request: unknown,
    @Body() input: CreateDeviceTransferReceiptDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.sync.recordTransferReceipt(context, input);
  }
}

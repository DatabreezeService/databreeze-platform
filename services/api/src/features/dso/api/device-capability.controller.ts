import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  DEVICE_CAPABILITY_SERVICE,
  type DeviceCapabilityService,
} from '../application/device-capability.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import {
  DeviceCapabilityRevisionDto,
  DeviceGrantRevisionDto,
  IssueDeviceGrantDto,
  ReportDeviceCapabilityDto,
} from './device-capability.dto.js';

@ApiTags('devices')
@ApiBearerAuth()
@Controller('v1/devices')
export class DeviceCapabilityController {
  public constructor(
    @Inject(DEVICE_CAPABILITY_SERVICE) private readonly capabilities: DeviceCapabilityService,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  @Post(':deviceId/capabilities')
  @HttpCode(200)
  @ApiOperation({ summary: 'Report one content-free device capability' })
  @ApiBody({ type: ReportDeviceCapabilityDto })
  async report(
    @Req() request: unknown,
    @Param('deviceId') deviceId: string,
    @Body() input: ReportDeviceCapabilityDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.capabilities.report(context, { ...input, deviceId });
  }

  @Get(':deviceId/capabilities')
  @ApiOperation({ summary: 'List content-free capabilities for one device' })
  async listCapabilities(@Req() request: unknown, @Param('deviceId') deviceId: string): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.capabilities.listCapabilities(context, deviceId);
  }

  @Post(':deviceId/capabilities/:capabilityId/pause')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pause one device capability with an optimistic revision' })
  @ApiBody({ type: DeviceCapabilityRevisionDto })
  async pause(
    @Req() request: unknown,
    @Param('deviceId') deviceId: string,
    @Param('capabilityId') capabilityId: string,
    @Body() input: DeviceCapabilityRevisionDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.capabilities.pauseCapability(
      context,
      capabilityId,
      input.expectedRevision,
      input.at,
      deviceId,
    );
  }

  @Post('grants')
  @HttpCode(200)
  @ApiOperation({ summary: 'Issue a typed, workspace-scoped device grant' })
  @ApiBody({ type: IssueDeviceGrantDto })
  async issueGrant(@Req() request: unknown, @Body() input: IssueDeviceGrantDto): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.capabilities.issueGrant(context, input);
  }

  @Get(':deviceId/grants')
  @ApiOperation({ summary: 'List typed grants for one device in the current workspace' })
  async listGrants(@Req() request: unknown, @Param('deviceId') deviceId: string): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const result = await this.capabilities.listGrants(context, deviceId);
    return result;
  }

  @Post('grants/:grantId/revoke')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke one typed device grant with an optimistic revision' })
  @ApiBody({ type: DeviceGrantRevisionDto })
  async revokeGrant(
    @Req() request: unknown,
    @Param('grantId') grantId: string,
    @Body() input: DeviceGrantRevisionDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.capabilities.revokeGrant(context, grantId, input.expectedRevision);
  }
}

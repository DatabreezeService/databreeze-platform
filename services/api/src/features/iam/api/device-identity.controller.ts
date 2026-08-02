import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  DEVICE_IDENTITY_SERVICE,
  type DeviceIdentityService,
} from '../application/device-identity.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import {
  DeviceRevisionDto,
  EnrollDeviceDto,
  IssueDeviceEnrollmentChallengeDto,
  RotateDeviceKeyDto,
} from './device-identity.dto.js';

@ApiTags('devices')
@ApiBearerAuth()
@Controller('v1')
export class DeviceIdentityController {
  public constructor(
    @Inject(DEVICE_IDENTITY_SERVICE)
    private readonly devices: DeviceIdentityService,
    @Inject(REQUEST_TENANT_CONTEXT)
    private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  @Post('devices/enrollment-challenges')
  @HttpCode(200)
  @ApiOperation({ summary: 'Issue a short-lived device proof-of-possession challenge' })
  @ApiBody({ type: IssueDeviceEnrollmentChallengeDto })
  async issueChallenge(
    @Req() request: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: IssueDeviceEnrollmentChallengeDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    void idempotencyKey;
    return this.devices.issueEnrollmentChallenge(context, input);
  }

  @Post('devices/enroll')
  @HttpCode(200)
  @ApiOperation({ summary: 'Enroll a device after proof of possession' })
  @ApiBody({ type: EnrollDeviceDto })
  async enroll(@Req() request: unknown, @Body() input: EnrollDeviceDto): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.devices.enroll(context, input);
  }

  @Post('devices/:deviceId/activate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Activate one pending device identity' })
  @ApiBody({ type: DeviceRevisionDto })
  async activate(
    @Req() request: unknown,
    @Param('deviceId') deviceId: string,
    @Body() input: DeviceRevisionDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.devices.activate(context, deviceId, input.expectedRevision, input.at);
  }

  @Get('organizations/:organizationId/devices')
  @ApiOperation({ summary: 'List content-free device identities in the caller organization' })
  async list(@Req() request: unknown, @Param('organizationId') organizationId: string): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const parsed = parseStableIdentifierV1(organizationId);
    if (!parsed.accepted || context.tenantScope.scopeType !== 'organization' || parsed.value !== context.tenantScope.organizationId)
      return { accepted: false, code: 'SCOPE_DENIED' as const };
    return this.devices.list(context);
  }

  @Post('devices/:deviceId/revoke')
  @HttpCode(200)
  @ApiOperation({ summary: 'Permanently revoke one device identity' })
  @ApiBody({ type: DeviceRevisionDto })
  async revoke(
    @Req() request: unknown,
    @Param('deviceId') deviceId: string,
    @Body() input: DeviceRevisionDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.devices.revoke(context, deviceId, input.expectedRevision, input.at);
  }

  @Post('devices/:deviceId/key')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate a device public key and security epoch' })
  @ApiBody({ type: RotateDeviceKeyDto })
  async rotateKey(
    @Req() request: unknown,
    @Param('deviceId') deviceId: string,
    @Body() input: RotateDeviceKeyDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.devices.rotateKey(
      context,
      deviceId,
      input.expectedRevision,
      input.nextPublicKey,
      input.at,
    );
  }
}

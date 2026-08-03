import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import {
  SERVICE_ACCOUNT_SERVICE,
  type ServiceAccountApplicationResultV1,
  type ServiceAccountService,
} from '../application/service-account.service.js';
import { ServiceAccountProblemError } from '../application/service-account-problem.error.js';
import { CreateServiceAccountDto, ServiceAccountRevisionDto } from './service-account.dto.js';

@ApiTags('service-accounts')
@ApiBearerAuth()
@Controller('v1')
export class ServiceAccountController {
  public constructor(
    @Inject(SERVICE_ACCOUNT_SERVICE)
    private readonly serviceAccounts: ServiceAccountService,
    @Inject(REQUEST_TENANT_CONTEXT)
    private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  private async execute<TValue>(
    work: () => Promise<ServiceAccountApplicationResultV1<TValue>>,
  ): Promise<TValue> {
    let result: ServiceAccountApplicationResultV1<TValue>;
    try {
      result = await work();
    } catch {
      throw new ServiceAccountProblemError('SERVICE_ACCOUNT_UNAVAILABLE');
    }
    if (result.accepted) return result.value;
    if (result.code === 'SCOPE_DENIED')
      throw new ServiceAccountProblemError('SERVICE_ACCOUNT_SCOPE_DENIED');
    if (result.code === 'NOT_FOUND')
      throw new ServiceAccountProblemError('SERVICE_ACCOUNT_NOT_FOUND');
    if (result.code === 'CONFLICT')
      throw new ServiceAccountProblemError('SERVICE_ACCOUNT_CONFLICT');
    if (result.code === 'REVOKED')
      throw new ServiceAccountProblemError('SERVICE_ACCOUNT_REVOKED');
    if (result.code === 'EXPIRED')
      throw new ServiceAccountProblemError('SERVICE_ACCOUNT_EXPIRED');
    if (result.code === 'UNAVAILABLE')
      throw new ServiceAccountProblemError('SERVICE_ACCOUNT_UNAVAILABLE');
    throw new ServiceAccountProblemError('SERVICE_ACCOUNT_REQUEST_REJECTED');
  }

  @Get('organizations/:organizationId/service-accounts')
  @ApiOperation({ summary: 'List content-free service-account identities in an organization scope' })
  async list(@Req() request: unknown, @Param('organizationId') organizationId: string): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    const parsed = parseStableIdentifierV1(organizationId);
    if (!parsed.accepted || parsed.value !== context.tenantScope.organizationId)
      throw new ServiceAccountProblemError('SERVICE_ACCOUNT_SCOPE_DENIED');
    return this.execute(() => this.serviceAccounts.list(context));
  }

  @Post('service-accounts')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create an action-scoped service account and return its one-time secret' })
  @ApiBody({ type: CreateServiceAccountDto })
  async create(
    @Req() request: unknown,
    @Headers('idempotency-key') _idempotencyKey: string | undefined,
    @Body() input: CreateServiceAccountDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    void _idempotencyKey;
    return this.execute(() => this.serviceAccounts.create(context, input));
  }

  @Post('service-accounts/:serviceAccountId/rotate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate a service-account secret and return the successor once' })
  @ApiBody({ type: ServiceAccountRevisionDto })
  async rotate(
    @Req() request: unknown,
    @Param('serviceAccountId') serviceAccountId: string,
    @Body() input: ServiceAccountRevisionDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.execute(() => this.serviceAccounts.rotate(context, serviceAccountId, input.expectedRevision));
  }

  @Post('service-accounts/:serviceAccountId/revoke')
  @HttpCode(200)
  @ApiOperation({ summary: 'Permanently revoke a service-account identity' })
  @ApiBody({ type: ServiceAccountRevisionDto })
  async revoke(
    @Req() request: unknown,
    @Param('serviceAccountId') serviceAccountId: string,
    @Body() input: ServiceAccountRevisionDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.execute(() => this.serviceAccounts.revoke(context, serviceAccountId, input.expectedRevision));
  }
}

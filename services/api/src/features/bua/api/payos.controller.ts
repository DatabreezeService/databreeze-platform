import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import {
  PAYOS_PAYMENT_SERVICE,
  PayosPaymentProblemError,
  type PayosPaymentService,
} from '../application/payos-payment.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

const PLAN_CATALOG_SCHEMA = {
  type: 'object',
  required: ['schemaVersion', 'plans'],
  properties: {
    schemaVersion: { type: 'integer', enum: [4] },
    plans: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'id',
          'family',
          'billingCycle',
          'amountVnd',
          'description',
          'displayNameVi',
          'displayNameEn',
          'taglineVi',
          'taglineEn',
          'benefitsVi',
          'benefitsEn',
          'allowances',
        ],
        properties: {
          id: { type: 'string' },
          family: { type: 'string', enum: ['personal', 'professional', 'team'] },
          billingCycle: { type: 'string', enum: ['monthly', 'annual'] },
          amountVnd: { type: 'integer', minimum: 1 },
          description: { type: 'string', minLength: 1, maxLength: 25 },
          displayNameVi: { type: 'string', minLength: 1, maxLength: 80 },
          displayNameEn: { type: 'string', minLength: 1, maxLength: 80 },
          taglineVi: { type: 'string', minLength: 1, maxLength: 240 },
          taglineEn: { type: 'string', minLength: 1, maxLength: 240 },
          benefitsVi: {
            type: 'array',
            minItems: 1,
            maxItems: 8,
            items: { type: 'string', minLength: 1, maxLength: 160 },
          },
          benefitsEn: {
            type: 'array',
            minItems: 1,
            maxItems: 8,
            items: { type: 'string', minLength: 1, maxLength: 160 },
          },
          allowances: {
            type: 'object',
            required: [
              'connectedFolders',
              'ocrPagesPerMonth',
              'agentCreditsPerMonth',
              'etlRowsPerMonth',
              'logicalDatasets',
              'governedStorageGb',
              'agentEnabledMembers',
              'viewerMembers',
              'workspaces',
              'refreshMinutes',
            ],
            properties: {
              connectedFolders: { type: 'string', enum: ['unlimited'] },
              ocrPagesPerMonth: { type: 'integer', minimum: 0 },
              agentCreditsPerMonth: { type: 'integer', minimum: 0 },
              etlRowsPerMonth: { type: 'integer', minimum: 0 },
              logicalDatasets: { type: 'integer', minimum: 0 },
              governedStorageGb: { type: 'integer', minimum: 0 },
              agentEnabledMembers: { type: 'integer', minimum: 0 },
              viewerMembers: { type: 'integer', minimum: 0 },
              workspaces: { type: 'integer', minimum: 0 },
              refreshMinutes: { type: 'integer', minimum: 1 },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

const PAYMENT_SESSION_SCHEMA = {
  type: 'object',
  required: [
    'schemaVersion',
    'paymentOrderId',
    'orderCode',
    'planId',
    'amountVnd',
    'currency',
    'status',
  ],
  properties: {
    schemaVersion: { type: 'integer', enum: [4] },
    paymentOrderId: { type: 'string', format: 'uuid' },
    orderCode: { type: 'integer', minimum: 1 },
    planId: { type: 'string' },
    amountVnd: { type: 'integer', minimum: 1 },
    currency: { type: 'string', enum: ['VND'] },
    status: { type: 'string', enum: ['PENDING', 'PAID', 'CANCELLED', 'FAILED'] },
    checkoutUrl: { type: 'string', format: 'uri' },
  },
  additionalProperties: false,
};

const WEBHOOK_SCHEMA = {
  type: 'object',
  required: ['data', 'signature'],
  properties: {
    code: { type: 'string' },
    success: { type: 'boolean' },
    signature: { type: 'string' },
    data: { type: 'object', additionalProperties: true },
  },
  additionalProperties: true,
};

type CheckoutBody = { readonly schemaVersion?: unknown; readonly planId?: unknown };

function rethrowPaymentError(error: unknown): never {
  // Preserve the shared authentication/context error so the platform filter can
  // return the canonical 401/503 response instead of masking it as a payment error.
  if (error instanceof RequestTenantContextProblemError) throw error;
  if (error instanceof PayosPaymentProblemError) throw error;
  throw new HttpException({ code: 'PAYOS_UNAVAILABLE' }, HttpStatus.SERVICE_UNAVAILABLE);
}

@ApiTags('billing')
@Controller('v1/billing/payos')
export class PayosController {
  public constructor(
    @Inject(PAYOS_PAYMENT_SERVICE) private readonly payments: PayosPaymentService,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  @Get('plans')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read the server-owned PayOS plan catalog in the caller scope' })
  @ApiOkResponse({ schema: PLAN_CATALOG_SCHEMA })
  @ApiUnauthorizedResponse({ description: 'A valid authenticated session is required.' })
  @ApiForbiddenResponse({ description: 'The caller cannot read billing information.' })
  async plans(@Req() request: unknown) {
    try {
      return await this.payments.plans(await this.requestContext.resolve(request));
    } catch (error) {
      rethrowPaymentError(error);
    }
  }

  @Post('checkout-sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an idempotent, tenant-scoped PayOS checkout session' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['schemaVersion', 'planId'],
      properties: { schemaVersion: { type: 'integer', enum: [4] }, planId: { type: 'string' } },
      additionalProperties: false,
    },
  })
  @ApiCreatedResponse({ schema: PAYMENT_SESSION_SCHEMA })
  @ApiBadRequestResponse({ description: 'The requested plan is invalid.' })
  @ApiConflictResponse({ description: 'The idempotency key was already used for another plan.' })
  @ApiUnauthorizedResponse({ description: 'A valid authenticated session is required.' })
  @ApiForbiddenResponse({ description: 'The caller cannot manage billing.' })
  @ApiServiceUnavailableResponse({ description: 'Payment persistence or PayOS is unavailable.' })
  async checkout(@Req() request: unknown, @Body() body: CheckoutBody) {
    if (body.schemaVersion !== 4 || typeof body.planId !== 'string')
      throw new HttpException({ code: 'PAYOS_REQUEST_INVALID' }, HttpStatus.BAD_REQUEST);
    try {
      return await this.payments.create(await this.requestContext.resolve(request), body.planId);
    } catch (error) {
      rethrowPaymentError(error);
    }
  }

  @Get('sessions/:orderCode')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read a tenant-scoped checkout status for redirect polling' })
  @ApiOkResponse({ schema: PAYMENT_SESSION_SCHEMA })
  @ApiNotFoundResponse({ description: 'The order is not visible in the caller scope.' })
  @ApiUnauthorizedResponse({ description: 'A valid authenticated session is required.' })
  async status(@Req() request: unknown, @Param('orderCode') input: string) {
    const orderCode = Number(input);
    if (!Number.isSafeInteger(orderCode) || orderCode < 1)
      throw new HttpException({ code: 'PAYOS_ORDER_NOT_FOUND' }, HttpStatus.NOT_FOUND);
    try {
      return await this.payments.status(await this.requestContext.resolve(request), orderCode);
    } catch (error) {
      rethrowPaymentError(error);
    }
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Receive and durably process a signed PayOS webhook event' })
  @ApiBody({ schema: WEBHOOK_SCHEMA })
  @ApiOkResponse({ schema: PAYMENT_SESSION_SCHEMA })
  @ApiBadRequestResponse({ description: 'The signature, amount, or event envelope is invalid.' })
  @ApiNotFoundResponse({ description: 'The webhook references an unknown order.' })
  async webhook(@Body() body: unknown) {
    try {
      return await this.payments.applyWebhook(body);
    } catch (error) {
      rethrowPaymentError(error);
    }
  }
}

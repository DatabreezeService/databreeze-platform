import { Body, Controller, Get, HttpException, HttpStatus, Param, Post } from '@nestjs/common';
import { PayosPaymentService } from '../application/payos-payment.service.js';

@Controller('v1/billing/payos')
export class PayosController {
  public constructor(private readonly payments: PayosPaymentService) {}

  @Get('plans')
  public plans() { return this.payments.plans(); }

  @Post('checkout-sessions')
  public async checkout(@Body() body: { readonly planId?: unknown }) {
    try { return await this.payments.create(body.planId); }
    catch (error) { throw new HttpException(error instanceof Error ? error.message : 'PAYOS_CHECKOUT_FAILED', HttpStatus.BAD_REQUEST); }
  }

  @Get('sessions/:orderCode')
  public status(@Param('orderCode') input: string) {
    const orderCode = Number(input);
    const session = Number.isSafeInteger(orderCode) ? this.payments.status(orderCode) : undefined;
    if (session === undefined) throw new HttpException('PAYOS_ORDER_NOT_FOUND', HttpStatus.NOT_FOUND);
    return session;
  }

  @Post('webhook')
  public webhook(@Body() body: { readonly orderCode?: number; readonly status?: string; readonly signature?: string }) {
    if (typeof body.orderCode !== 'number' || !Number.isSafeInteger(body.orderCode) || typeof body.status !== 'string' || typeof body.signature !== 'string')
      throw new HttpException('PAYOS_WEBHOOK_INVALID', HttpStatus.BAD_REQUEST);
    const orderCode = body.orderCode;
    const status = body.status;
    const signature = body.signature;
    try { return this.payments.applyWebhook({ orderCode, status, signature }); }
    catch (error) { throw new HttpException(error instanceof Error ? error.message : 'PAYOS_WEBHOOK_INVALID', HttpStatus.BAD_REQUEST); }
  }
}

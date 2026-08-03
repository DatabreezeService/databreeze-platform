import { Body, Controller, HttpCode, Inject, Optional, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import { MFA_SERVICE, MfaService } from '../application/mfa.service.js';
import { MfaProblemError } from '../application/mfa-problem.error.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import { EnrollMfaFactorDto, RedeemMfaRecoveryCodeDto, VerifyMfaFactorDto } from './mfa.dto.js';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('v1/auth/mfa')
export class MfaController {
  public constructor(
    @Optional() @Inject(MFA_SERVICE) private readonly mfa: MfaService | undefined,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  private requireService(): MfaService {
    if (this.mfa === undefined) throw new MfaProblemError('MFA_UNAVAILABLE');
    return this.mfa;
  }

  private async execute<TValue>(work: () => Promise<TValue>): Promise<TValue> {
    try {
      return await work();
    } catch {
      throw new MfaProblemError('MFA_UNAVAILABLE');
    }
  }

  @Post('factors')
  @HttpCode(200)
  @ApiOperation({ summary: 'Enroll a pending MFA factor for the authenticated user' })
  @ApiBody({ type: EnrollMfaFactorDto })
  async enroll(@Req() request: unknown, @Body() input: EnrollMfaFactorDto): Promise<unknown> {
    const mfa = this.requireService();
    const context = await this.requestContext.resolve(request);
    const result = await this.execute(() =>
      mfa.enroll({
        ...input,
        userId: context.actorId,
      }),
    );
    if (!result.accepted) throw new MfaProblemError('MFA_REQUEST_REJECTED');
    return result.value;
  }

  @Post('factors/:factorId/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify a pending MFA factor' })
  @ApiBody({ type: VerifyMfaFactorDto })
  async verify(
    @Req() request: unknown,
    @Param('factorId') factorId: string,
    @Body() input: VerifyMfaFactorDto,
  ): Promise<unknown> {
    const mfa = this.requireService();
    const context = await this.requestContext.resolve(request);
    const result = await this.execute(() => mfa.verifyFactor(context.actorId, factorId, input.at));
    if (!result.accepted) throw new MfaProblemError('MFA_REQUEST_REJECTED');
    return result.value;
  }

  @Post('recovery/redeem')
  @HttpCode(200)
  @ApiOperation({ summary: 'Redeem one hashed MFA recovery code' })
  @ApiBody({ type: RedeemMfaRecoveryCodeDto })
  async redeemRecovery(
    @Req() request: unknown,
    @Body() input: RedeemMfaRecoveryCodeDto,
  ): Promise<unknown> {
    const mfa = this.requireService();
    const context = await this.requestContext.resolve(request);
    const result = await this.execute(() =>
      mfa.redeemRecovery(context.actorId, input.presentedDigest, input.at),
    );
    if (!result.accepted) throw new MfaProblemError('MFA_REQUEST_REJECTED');
    return result.value;
  }
}

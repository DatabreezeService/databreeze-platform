import { Body, Controller, Inject, Optional, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  EmailVerificationService,
  IAM_EMAIL_VERIFICATION_SERVICE,
} from '../application/email-verification.service.js';

class RequestEmailVerificationDto {
  email!: string;
  passwordProofId?: string;
  locale?: string;
  correlationId?: string;
}

class VerifyEmailRegistrationDto {
  challengeId!: string;
  code!: string;
  email!: string;
  idempotencyKey!: string;
}

@ApiTags('auth')
@Controller('v1/auth/email-verification')
export class EmailVerificationController {
  public constructor(
    @Optional()
    @Inject(IAM_EMAIL_VERIFICATION_SERVICE)
    private readonly service?: EmailVerificationService,
  ) {}

  private requireService(): EmailVerificationService {
    if (!this.service) throw new Error('IAM_EMAIL_VERIFICATION_UNAVAILABLE');
    return this.service;
  }

  @Post('request')
  @ApiOperation({ summary: 'Request a registration email OTP without revealing account existence' })
  @ApiOkResponse({ description: 'Generic accepted request shape' })
  async request(@Body() input: RequestEmailVerificationDto): Promise<unknown> {
    const result = await this.requireService().requestEmailVerification(input);
    if (!result.accepted) {
      return { accepted: true, value: { requested: true } };
    }
    return result;
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify registration OTP and activate personal workspace' })
  async verify(@Body() input: VerifyEmailRegistrationDto): Promise<unknown> {
    return this.requireService().verifyEmailRegistration(input);
  }
}

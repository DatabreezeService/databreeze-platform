import { randomBytes } from 'node:crypto';

import { Body, Controller, HttpCode, Inject, Optional, Post, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

import {
  EmailVerificationService,
  IAM_EMAIL_VERIFICATION_SERVICE,
} from '../application/email-verification.service.js';
import { RegistrationProblemError } from '../application/registration-problem.error.js';
import { AuthSessionDto } from './auth-session.dto.js';
import { VerifyEmailRegistrationDto } from './email-verification.dto.js';
import {
  CSRF_COOKIE_NAME_V1,
  REFRESH_COOKIE_NAME_V1,
  REFRESH_COOKIE_PATH_V1,
  serializeCookieV1,
} from './session-cookies.js';

@ApiTags('auth')
@Controller('v1/auth/email-verification')
export class EmailVerificationController {
  public constructor(
    @Optional()
    @Inject(IAM_EMAIL_VERIFICATION_SERVICE)
    private readonly service?: EmailVerificationService,
  ) {}

  @Post('verify')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Verify registration OTP and atomically activate the personal workspace session',
  })
  @ApiOkResponse({ type: AuthSessionDto })
  @ApiUnauthorizedResponse({ description: 'The verification command was rejected.' })
  @ApiServiceUnavailableResponse({
    description: 'Verification persistence or protected delivery is unavailable.',
  })
  async verify(
    @Body() input: VerifyEmailRegistrationDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthSessionDto> {
    if (!this.service) throw new RegistrationProblemError('REGISTRATION_UNAVAILABLE');
    const result = await this.service.verifyEmailRegistration(input);
    if (!result.accepted)
      throw new RegistrationProblemError(
        result.code === 'VERIFICATION_UNAVAILABLE'
          ? 'REGISTRATION_UNAVAILABLE'
          : 'REGISTRATION_REQUEST_REJECTED',
      );
    if (input.clientPlatform === 'web') {
      const csrfToken = randomBytes(32).toString('base64url');
      reply.header('Set-Cookie', [
        serializeCookieV1(REFRESH_COOKIE_NAME_V1, result.value.session.refreshToken, {
          httpOnly: true,
          maxAgeSeconds: 2_592_000,
          path: REFRESH_COOKIE_PATH_V1,
        }),
        serializeCookieV1(CSRF_COOKIE_NAME_V1, csrfToken, {
          httpOnly: false,
          maxAgeSeconds: 2_592_000,
        }),
      ]);
    }
    return {
      schemaVersion: 4,
      sessionId: result.value.session.sessionId,
      userId: result.value.principal.userId,
      organizationId: result.value.principal.organizationId,
      workspaceId: result.value.principal.workspaceId,
      accessToken: result.value.session.accessToken,
      ...(input.clientPlatform === 'web'
        ? {}
        : { refreshToken: result.value.session.refreshToken }),
      accessExpiresAt: result.value.session.accessExpiresAt,
      securityEpoch: result.value.principal.securityEpoch,
      mfaRequired: result.value.principal.mfaRequired,
      mfaReenrollmentRequired: result.value.principal.mfaReenrollmentRequired,
    };
  }
}

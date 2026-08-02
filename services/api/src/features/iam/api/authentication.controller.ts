import { randomBytes } from 'node:crypto';

import { Body, Controller, HttpCode, Inject, Post, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import {
  AUTHENTICATION_USE_CASE,
  type AuthenticationUseCaseV1,
} from '../application/authentication.port.js';
import { AuthenticationProblemError } from '../application/authentication-problem.error.js';
import {
  CSRF_COOKIE_NAME_V1,
  REFRESH_COOKIE_NAME_V1,
  serializeCookieV1,
} from './session-cookies.js';
import { AuthSessionDto } from './auth-session.dto.js';
import { SignInDto } from './sign-in.dto.js';
import type { FastifyReply } from 'fastify';

@ApiTags('auth')
@Controller('v1/auth')
export class AuthenticationController {
  constructor(
    @Inject(AUTHENTICATION_USE_CASE)
    private readonly authentication: AuthenticationUseCaseV1,
  ) {}

  @Post('sign-in')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in and issue a short-lived session' })
  @ApiBody({ type: SignInDto })
  @ApiOkResponse({ type: AuthSessionDto })
  @ApiUnauthorizedResponse({ description: 'Credentials were rejected.' })
  @ApiServiceUnavailableResponse({ description: 'Authentication provider is unavailable.' })
  async signIn(
    @Body() input: SignInDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthSessionDto> {
    const result = await this.authentication.signIn(input);
    if (!result.accepted) throw new AuthenticationProblemError(result.code);
    if (input.clientPlatform === 'web') {
      const csrfToken = randomBytes(32).toString('base64url');
      reply.header('Set-Cookie', [
        serializeCookieV1(REFRESH_COOKIE_NAME_V1, result.value.session.refreshToken, {
          httpOnly: true,
          maxAgeSeconds: 2_592_000,
        }),
        serializeCookieV1(CSRF_COOKIE_NAME_V1, csrfToken, {
          httpOnly: false,
          maxAgeSeconds: 2_592_000,
        }),
      ]);
    }
    return {
      sessionId: result.value.session.sessionId,
      userId: result.value.principal.userId,
      organizationId: result.value.principal.organizationId,
      workspaceId: result.value.principal.workspaceId,
      accessToken: result.value.session.accessToken,
      ...(input.clientPlatform === 'web' ? {} : { refreshToken: result.value.session.refreshToken }),
      accessExpiresAt: result.value.session.accessExpiresAt,
      securityEpoch: result.value.principal.securityEpoch,
      mfaRequired: result.value.principal.mfaRequired,
    };
  }
}

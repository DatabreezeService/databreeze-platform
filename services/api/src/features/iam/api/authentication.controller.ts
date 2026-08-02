import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
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
import { AuthSessionDto } from './auth-session.dto.js';
import { SignInDto } from './sign-in.dto.js';

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
  async signIn(@Body() input: SignInDto): Promise<AuthSessionDto> {
    const result = await this.authentication.signIn(input);
    if (!result.accepted) throw new AuthenticationProblemError(result.code);
    return {
      sessionId: result.value.session.sessionId,
      userId: result.value.principal.userId,
      organizationId: result.value.principal.organizationId,
      workspaceId: result.value.principal.workspaceId,
      accessToken: result.value.session.accessToken,
      refreshToken: result.value.session.refreshToken,
      accessExpiresAt: result.value.session.accessExpiresAt,
      securityEpoch: result.value.principal.securityEpoch,
      mfaRequired: result.value.principal.mfaRequired,
    };
  }
}

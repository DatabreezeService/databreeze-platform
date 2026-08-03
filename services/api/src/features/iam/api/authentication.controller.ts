import { randomBytes } from 'node:crypto';

import { Body, Controller, Get, HttpCode, Inject, Optional, Post, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiBearerAuth,
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
  SESSION_LIFECYCLE_PORT,
  type SessionLifecyclePortV1,
} from '../application/session-lifecycle.port.js';
import { SessionProblemError } from '../application/session-problem.error.js';
import {
  CSRF_COOKIE_NAME_V1,
  REFRESH_COOKIE_NAME_V1,
  clearCookieV1,
  readCookieValueV1,
  serializeCookieV1,
} from './session-cookies.js';
import { AuthSessionDto } from './auth-session.dto.js';
import { SignInDto } from './sign-in.dto.js';
import { SessionRefreshDto } from './session-refresh.dto.js';
import { SessionRefreshResponseDto } from './session-refresh-response.dto.js';
import { SessionSignOutDto } from './session-sign-out.dto.js';
import { CurrentSessionDto } from './current-session.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

@ApiTags('auth')
@Controller('v1/auth')
export class AuthenticationController {
  constructor(
    @Inject(AUTHENTICATION_USE_CASE)
    private readonly authentication: AuthenticationUseCaseV1,
    @Optional()
    @Inject(SESSION_LIFECYCLE_PORT)
    private readonly sessions?: SessionLifecyclePortV1,
    @Inject(REQUEST_TENANT_CONTEXT)
    private readonly requestContext?: RequestTenantContextPortV1,
  ) {}

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read the redacted authenticated session identity' })
  @ApiOkResponse({ type: CurrentSessionDto })
  async me(@Req() request: FastifyRequest): Promise<CurrentSessionDto> {
    if (this.requestContext === undefined) throw new SessionProblemError('SESSION_UNAVAILABLE');
    const context = await this.requestContext.resolve(request);
    return {
      userId: context.actorId,
      organizationId: context.tenantScope.organizationId,
      ...(context.tenantScope.scopeType === 'organization'
        ? {}
        : { workspaceId: context.tenantScope.workspaceId }),
      authorizationEpoch: context.authorizationEpoch,
      mfaRequired: context.mfaRequired ?? false,
    };
  }

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
      ...(input.clientPlatform === 'web'
        ? {}
        : { refreshToken: result.value.session.refreshToken }),
      accessExpiresAt: result.value.session.accessExpiresAt,
      securityEpoch: result.value.principal.securityEpoch,
      mfaRequired: result.value.principal.mfaRequired,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate a short-lived session' })
  @ApiBody({ type: SessionRefreshDto })
  @ApiOkResponse({ type: SessionRefreshResponseDto })
  @ApiUnauthorizedResponse({ description: 'The refresh session was rejected.' })
  @ApiServiceUnavailableResponse({ description: 'Session persistence is unavailable.' })
  async refresh(
    @Body() input: SessionRefreshDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SessionRefreshResponseDto> {
    if (this.sessions === undefined) throw new SessionProblemError('SESSION_UNAVAILABLE');
    const refreshToken =
      input.clientPlatform === 'web'
        ? readCookieValueV1(request.headers.cookie, REFRESH_COOKIE_NAME_V1)
        : input.refreshToken;
    if (
      refreshToken === undefined ||
      (input.clientPlatform === 'web' && input.refreshToken !== undefined)
    ) {
      throw new SessionProblemError('SESSION_INVALID');
    }
    let result: Awaited<ReturnType<SessionLifecyclePortV1['refresh']>>;
    try {
      result = await this.sessions.refresh(refreshToken, input.clientPlatform);
    } catch {
      throw new SessionProblemError('SESSION_UNAVAILABLE');
    }
    if (!result.accepted) throw new SessionProblemError('SESSION_INVALID');
    if (input.clientPlatform === 'web') {
      const csrfToken = randomBytes(32).toString('base64url');
      reply.header('Set-Cookie', [
        serializeCookieV1(REFRESH_COOKIE_NAME_V1, result.value.refreshToken, {
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
      sessionId: result.value.sessionId,
      accessToken: result.value.accessToken,
      accessExpiresAt: result.value.accessExpiresAt,
      ...(input.clientPlatform === 'web' ? {} : { refreshToken: result.value.refreshToken }),
    };
  }

  @Post('sign-out')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a session and clear browser credentials' })
  @ApiBody({ type: SessionSignOutDto })
  @ApiUnauthorizedResponse({ description: 'The session could not be authenticated.' })
  @ApiServiceUnavailableResponse({ description: 'Session persistence is unavailable.' })
  async signOut(
    @Body() input: SessionSignOutDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    if (this.sessions === undefined) throw new SessionProblemError('SESSION_UNAVAILABLE');
    if (this.requestContext === undefined) throw new SessionProblemError('SESSION_UNAVAILABLE');
    const context = await this.requestContext.resolve(request);
    try {
      const principal = await this.sessions.findPrincipal(input.sessionId);
      if (
        !principal ||
        principal.userId !== context.actorId ||
        principal.organizationId !== context.tenantScope.organizationId ||
        (context.tenantScope.scopeType !== 'organization' &&
          principal.workspaceId !== context.tenantScope.workspaceId)
      )
        throw new SessionProblemError('SESSION_INVALID');
      await this.sessions.revoke(input.sessionId);
    } catch (error) {
      if (error instanceof SessionProblemError) throw error;
      throw new SessionProblemError('SESSION_UNAVAILABLE');
    }
    if (input.clientPlatform === 'web') {
      reply.header('Set-Cookie', [
        clearCookieV1(REFRESH_COOKIE_NAME_V1, { httpOnly: true }),
        clearCookieV1(CSRF_COOKIE_NAME_V1, { httpOnly: false }),
      ]);
    }
  }
}

import { Body, Controller, Inject, Optional, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

import {
  IAM_IDENTITY_LINKING_SERVICE,
  IdentityLinkingService,
} from '../application/identity-linking.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

class OidcCallbackDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  code!: string;

  @IsString()
  @MinLength(43)
  @MaxLength(256)
  codeVerifier!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(2048)
  redirectUri!: string;

  @IsString()
  @MinLength(16)
  @MaxLength(256)
  nonce!: string;
}

@ApiTags('auth')
@ApiBearerAuth()
@Controller('v1/auth/oidc/google')
export class OidcController {
  public constructor(
    @Optional()
    @Inject(IAM_IDENTITY_LINKING_SERVICE)
    private readonly linking?: IdentityLinkingService,
    @Inject(REQUEST_TENANT_CONTEXT)
    private readonly requestContext?: RequestTenantContextPortV1,
  ) {}

  private requireService(): IdentityLinkingService {
    if (!this.linking) throw new Error('IAM_OIDC_UNAVAILABLE');
    return this.linking;
  }

  @Post('callback')
  @ApiOperation({
    summary: 'Complete Google OIDC authorization code exchange without returning provider tokens',
  })
  @ApiOkResponse({ description: 'Linked identity without provider access tokens' })
  async callback(@Req() request: unknown, @Body() input: OidcCallbackDto): Promise<unknown> {
    if (!this.requestContext) throw new Error('IAM_OIDC_UNAVAILABLE');
    const context = await this.requestContext.resolve(request);
    const result = await this.requireService().linkFromAuthorizationCode({
      code: input.code,
      codeVerifier: input.codeVerifier,
      redirectUri: input.redirectUri,
      nonce: input.nonce,
      authenticatedUserId: context.actorId,
    });
    if (!result.accepted) return result;
    return {
      accepted: true,
      value: {
        userId: result.value.userId,
        email: result.value.email,
        linked: true,
      },
    };
  }
}

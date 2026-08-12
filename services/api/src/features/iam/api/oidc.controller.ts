import { Body, Controller, Inject, Optional, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  IAM_IDENTITY_LINKING_SERVICE,
  IdentityLinkingService,
} from '../application/identity-linking.service.js';

class OidcCallbackDto {
  code!: string;
  codeVerifier!: string;
  redirectUri!: string;
  nonce!: string;
  authenticatedUserId?: string;
  passwordConfirmed?: boolean;
  emailOtpConfirmed?: boolean;
}

@ApiTags('auth')
@Controller('v1/auth/oidc/google')
export class OidcController {
  public constructor(
    @Optional()
    @Inject(IAM_IDENTITY_LINKING_SERVICE)
    private readonly linking?: IdentityLinkingService,
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
  async callback(@Body() input: OidcCallbackDto): Promise<unknown> {
    const result = await this.requireService().linkFromAuthorizationCode(input);
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

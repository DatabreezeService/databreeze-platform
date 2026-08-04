import { Body, Controller, HttpCode, Inject, Optional, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  IAM_REGISTRATION_SERVICE,
  type RegistrationService,
} from '../application/registration.service.js';
import { RegistrationProblemError } from '../application/registration-problem.error.js';
import { RegistrationDto, RegistrationResponseDto } from './registration.dto.js';

/** IAM-001/IAM-009: account registration creates a safe personal hierarchy without a session. */
@ApiTags('auth')
@Controller('v1/auth')
export class RegistrationController {
  public constructor(
    @Optional()
    @Inject(IAM_REGISTRATION_SERVICE)
    private readonly registration: RegistrationService | undefined,
  ) {}

  @Post('register')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create an account and personal organization hierarchy',
    description: 'Registration does not return bearer material; sign in separately after creation.',
  })
  @ApiBody({ type: RegistrationDto })
  @ApiCreatedResponse({ type: RegistrationResponseDto })
  @ApiBadRequestResponse({ description: 'The registration request was rejected.' })
  @ApiServiceUnavailableResponse({ description: 'Registration persistence is unavailable.' })
  async register(@Body() input: RegistrationDto): Promise<RegistrationResponseDto> {
    if (this.registration === undefined)
      throw new RegistrationProblemError('REGISTRATION_UNAVAILABLE');
    const result = await this.registration.register(input);
    if (!result.accepted) {
      throw new RegistrationProblemError(
        result.code === 'REGISTRATION_UNAVAILABLE'
          ? 'REGISTRATION_UNAVAILABLE'
          : 'REGISTRATION_REQUEST_REJECTED',
      );
    }
    return {
      userId: result.value.bootstrap.user.id,
      organizationId: result.value.bootstrap.organization.id,
      workspaceId: result.value.bootstrap.workspace.id,
      projectId: result.value.bootstrap.project.id,
      membershipId: result.value.bootstrap.membership.id,
      locale: result.value.bootstrap.user.locale,
    };
  }
}

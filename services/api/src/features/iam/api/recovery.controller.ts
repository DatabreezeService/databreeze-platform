import { Body, Controller, HttpCode, Inject, Optional, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import { IAM_RECOVERY_SERVICE, RecoveryService } from '../application/recovery.service.js';
import { RecoveryProblemError } from '../application/recovery-problem.error.js';
import {
  RecoveryCompleteDto,
  RecoveryCompleteResponseDto,
  RecoveryRequestDto,
  RecoveryRequestResponseDto,
} from './recovery.dto.js';

/** IAM-015: public account recovery never discloses whether an email has an account. */
@ApiTags('auth')
@Controller('v1/auth')
export class RecoveryController {
  public constructor(
    @Optional()
    @Inject(IAM_RECOVERY_SERVICE)
    private readonly recovery: RecoveryService | undefined,
  ) {}

  @Post('recovery')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Request an account recovery link',
    description: 'The accepted response is intentionally identical for known and unknown emails.',
  })
  @ApiBody({ type: RecoveryRequestDto })
  @ApiAcceptedResponse({ type: RecoveryRequestResponseDto })
  @ApiBadRequestResponse({ description: 'The recovery request was rejected.' })
  @ApiServiceUnavailableResponse({ description: 'Recovery delivery is unavailable.' })
  async request(@Body() input: RecoveryRequestDto): Promise<RecoveryRequestResponseDto> {
    if (this.recovery === undefined) throw new RecoveryProblemError('RECOVERY_UNAVAILABLE');
    const result = await this.recovery.request(input.email);
    if (!result.accepted) {
      throw new RecoveryProblemError(
        result.code === 'RECOVERY_UNAVAILABLE'
          ? 'RECOVERY_UNAVAILABLE'
          : 'RECOVERY_REQUEST_REJECTED',
      );
    }
    return { requested: true };
  }

  @Post('recovery/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Complete account recovery',
    description: 'Consumes a single-use link, revokes sessions, and requires MFA re-enrollment.',
  })
  @ApiBody({ type: RecoveryCompleteDto })
  @ApiOkResponse({ type: RecoveryCompleteResponseDto })
  @ApiBadRequestResponse({ description: 'The recovery token or password was rejected.' })
  @ApiServiceUnavailableResponse({ description: 'Recovery persistence is unavailable.' })
  async complete(@Body() input: RecoveryCompleteDto): Promise<RecoveryCompleteResponseDto> {
    if (this.recovery === undefined) throw new RecoveryProblemError('RECOVERY_UNAVAILABLE');
    const result = await this.recovery.complete(input.token, input.newPassword);
    if (!result.accepted) {
      throw new RecoveryProblemError(
        result.code === 'RECOVERY_UNAVAILABLE'
          ? 'RECOVERY_UNAVAILABLE'
          : result.code === 'INVALID_TOKEN'
            ? 'RECOVERY_TOKEN_INVALID'
            : 'RECOVERY_REQUEST_REJECTED',
      );
    }
    return {
      userId: result.value.userId,
      mfaReenrollmentRequired: result.value.mfaReenrollmentRequired,
    };
  }
}

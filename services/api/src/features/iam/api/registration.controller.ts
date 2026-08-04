import { Body, Controller, HttpCode, Inject, Optional, Post, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiAcceptedResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  IAM_REGISTRATION_SERVICE,
  type RegistrationService,
} from '../application/registration.service.js';
import {
  IAM_REGISTRATION_EMAIL_ADMISSION,
  IAM_REGISTRATION_IP_ADMISSION,
  IAM_REGISTRATION_ADMISSION_DIGEST,
  type RegistrationAdmissionDigestPortV1,
  type RegistrationAdmissionPortV1,
} from '../application/registration-repository.port.js';
import { RegistrationProblemError } from '../application/registration-problem.error.js';
import { RegistrationDto, RegistrationResponseDto } from './registration.dto.js';
import { normalizeEmailAddressV1 } from '@databreeze/domain/identity/v1';

function requestIp(request: unknown): string {
  if (typeof request !== 'object' || request === null || !('ip' in request)) return 'unknown';
  const candidate = (request as { readonly ip?: unknown }).ip;
  if (typeof candidate !== 'string') return 'unknown';
  const normalized = candidate.trim();
  return normalized.length > 0 && normalized.length <= 128 ? normalized : 'unknown';
}

/** IAM-001/IAM-009: account registration creates a safe personal hierarchy without a session. */
@ApiTags('auth')
@Controller('v1/auth')
export class RegistrationController {
  public constructor(
    @Optional()
    @Inject(IAM_REGISTRATION_SERVICE)
    private readonly registration: RegistrationService | undefined,
    @Optional()
    @Inject(IAM_REGISTRATION_IP_ADMISSION)
    private readonly ipAdmission?: RegistrationAdmissionPortV1,
    @Optional()
    @Inject(IAM_REGISTRATION_EMAIL_ADMISSION)
    private readonly emailAdmission?: RegistrationAdmissionPortV1,
    @Optional()
    @Inject(IAM_REGISTRATION_ADMISSION_DIGEST)
    private readonly admissionDigest?: RegistrationAdmissionDigestPortV1,
  ) {}

  @Post('register')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Create an account and personal organization hierarchy',
    description: 'Registration does not return bearer material; sign in separately after creation.',
  })
  @ApiBody({ type: RegistrationDto })
  @ApiAcceptedResponse({ type: RegistrationResponseDto })
  @ApiBadRequestResponse({ description: 'The registration request was rejected.' })
  @ApiServiceUnavailableResponse({ description: 'Registration persistence is unavailable.' })
  async register(
    @Body() input: RegistrationDto,
    @Req() _request?: unknown,
  ): Promise<RegistrationResponseDto> {
    if (this.registration === undefined)
      throw new RegistrationProblemError('REGISTRATION_UNAVAILABLE');

    // Admission happens before Argon2 work and never stores a raw IP or email. The in-memory
    // unit-test fallback intentionally skips this gate when no providers are composed; the
    // production module always supplies bounded adapters.
    const normalizedEmail = normalizeEmailAddressV1(input.email);
    if (
      normalizedEmail.accepted &&
      this.ipAdmission &&
      this.emailAdmission &&
      this.admissionDigest
    ) {
      const issuedAt = new Date().toISOString();
      let admitted = false;
      try {
        const allowAny = async (
          admission: RegistrationAdmissionPortV1,
          candidates: readonly string[],
        ): Promise<boolean> => {
          for (const candidate of candidates) {
            if (await admission.allow(candidate, issuedAt)) return true;
          }
          return false;
        };
        const [ipAllowed, emailAllowed] = await Promise.all([
          allowAny(
            this.ipAdmission,
            this.admissionDigest.digestCandidates('ip', requestIp(_request)),
          ),
          allowAny(
            this.emailAdmission,
            this.admissionDigest.digestCandidates('email', normalizedEmail.value),
          ),
        ]);
        admitted = ipAllowed && emailAllowed;
      } catch {
        admitted = false;
      }
      if (!admitted) throw new RegistrationProblemError('REGISTRATION_REQUEST_REJECTED');
    }

    const result = await this.registration.register(input);
    if (!result.accepted) {
      throw new RegistrationProblemError(
        result.code === 'REGISTRATION_UNAVAILABLE'
          ? 'REGISTRATION_UNAVAILABLE'
          : 'REGISTRATION_REQUEST_REJECTED',
      );
    }
    return { accepted: true };
  }
}

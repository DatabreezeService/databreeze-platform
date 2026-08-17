import { Body, Controller, Inject, Optional, Post, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { parseV4Contract, type LfbLandingFeedbackAccepted } from '@databreeze/contracts/v4';

import {
  LFB_FEEDBACK_ADMISSION_DIGEST,
  LFB_FEEDBACK_IP_ADMISSION,
  LFB_LANDING_FEEDBACK_SERVICE,
  type LandingFeedbackAdmissionDigestPortV1,
  type LandingFeedbackAdmissionPortV1,
  type LandingFeedbackCommandV1,
} from '../application/landing-feedback-intake.port.js';
import {
  LandingFeedbackProblemError,
  type LandingFeedbackService,
} from '../application/landing-feedback.service.js';
import { LandingFeedbackAcceptedDto, LandingFeedbackCommandDto } from './landing-feedback.dto.js';

const LANDING_FEEDBACK_COMMAND_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v4/lfb-landing-feedback-command' as const;
const LANDING_FEEDBACK_ACCEPTED_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v4/lfb-landing-feedback-accepted' as const;

function requestIp(request: unknown): string {
  if (typeof request !== 'object' || request === null || !('ip' in request)) return 'unknown';
  const candidate = (request as { readonly ip?: unknown }).ip;
  if (typeof candidate !== 'string') return 'unknown';
  const normalized = candidate.trim();
  return normalized.length > 0 && normalized.length <= 128 ? normalized : 'unknown';
}

/** WEB-026: anonymous, throttled, closed-contract landing feedback intake. */
@ApiTags('landing')
@Controller('v1/landing')
export class LandingFeedbackController {
  public constructor(
    @Inject(LFB_LANDING_FEEDBACK_SERVICE) private readonly service: LandingFeedbackService,
    @Optional()
    @Inject(LFB_FEEDBACK_IP_ADMISSION)
    private readonly ipAdmission?: LandingFeedbackAdmissionPortV1,
    @Optional()
    @Inject(LFB_FEEDBACK_ADMISSION_DIGEST)
    private readonly admissionDigest?: LandingFeedbackAdmissionDigestPortV1,
  ) {}

  @Post('feedbacks')
  @ApiOperation({
    summary: 'Submit anonymous landing feedback',
    description: 'Validates the closed v4 command contract, applies IP admission, and persists it.',
  })
  @ApiBody({ type: LandingFeedbackCommandDto })
  @ApiCreatedResponse({ type: LandingFeedbackAcceptedDto })
  @ApiBadRequestResponse({ description: 'The feedback command was invalid.' })
  @ApiTooManyRequestsResponse({ description: 'The source exceeded the admission limit.' })
  @ApiServiceUnavailableResponse({ description: 'Feedback persistence is unavailable.' })
  public async submit(
    @Body() body: LandingFeedbackCommandDto,
    @Req() request?: unknown,
  ): Promise<LandingFeedbackAcceptedDto> {
    const parsedCommand = parseV4Contract<LandingFeedbackCommandV1 & { readonly schemaVersion: 4 }>(
      LANDING_FEEDBACK_COMMAND_SCHEMA_ID,
      body,
    );
    if (!parsedCommand.accepted)
      throw new LandingFeedbackProblemError('LANDING_FEEDBACK_COMMAND_INVALID');
    const { schemaVersion, ...command } = parsedCommand.value;
    void schemaVersion;

    // Admission happens before persistence and never stores a raw IP; only the one-way
    // digest is kept. The in-memory unit-test fallback intentionally skips this gate
    // when no providers are composed; production always supplies bounded adapters.
    let sourceIpHash: string | undefined;
    if (this.ipAdmission !== undefined && this.admissionDigest !== undefined) {
      const candidates = this.admissionDigest.digestCandidates('ip', requestIp(request));
      const issuedAt = new Date().toISOString();
      let admitted = false;
      try {
        admitted = await allowAny(this.ipAdmission, candidates, issuedAt);
      } catch {
        admitted = false;
      }
      if (!admitted) throw new LandingFeedbackProblemError('LANDING_FEEDBACK_RATE_LIMITED');
      sourceIpHash = candidates[0];
    }

    const receipt = await this.service.submit(command, sourceIpHash);
    const parsedReceipt = parseV4Contract<LfbLandingFeedbackAccepted>(
      LANDING_FEEDBACK_ACCEPTED_SCHEMA_ID,
      { schemaVersion: 4, receivedAt: receipt.receivedAt, referenceId: receipt.referenceId },
    );
    if (!parsedReceipt.accepted)
      throw new LandingFeedbackProblemError('LANDING_FEEDBACK_UNAVAILABLE');
    return parsedReceipt.value;
  }
}

async function allowAny(
  admission: LandingFeedbackAdmissionPortV1,
  candidates: readonly string[],
  issuedAt: string,
): Promise<boolean> {
  for (const candidate of candidates) {
    if (await admission.allow(candidate, issuedAt)) return true;
  }
  return false;
}

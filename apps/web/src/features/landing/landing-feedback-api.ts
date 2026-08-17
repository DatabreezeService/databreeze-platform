import {
  parseV4Contract,
  type LfbLandingFeedbackAccepted,
  type LfbLandingFeedbackCommand,
} from '@databreeze/contracts/v4';

import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';

const LANDING_FEEDBACK_COMMAND_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/lfb-landing-feedback-command' as const;
const LANDING_FEEDBACK_ACCEPTED_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/lfb-landing-feedback-accepted' as const;

export type LandingFeedbackRole =
  | 'owner'
  | 'analyst'
  | 'accounting'
  | 'operations'
  | 'technology'
  | 'other';
export type LandingFeedbackExperience = 'exploring' | 'trial' | 'active';
export type LandingFeedbackCategory =
  | 'product'
  | 'feature'
  | 'data-trust'
  | 'design'
  | 'performance'
  | 'other';

export type LandingFeedbackSubmission = Omit<LfbLandingFeedbackCommand, 'schemaVersion'>;

export type LandingFeedbackSubmitFailureCode =
  | 'LANDING_FEEDBACK_REQUEST_FAILED'
  | 'LANDING_FEEDBACK_COMMAND_INVALID'
  | 'LANDING_FEEDBACK_RATE_LIMITED'
  | 'LANDING_FEEDBACK_UNAVAILABLE';

export type LandingFeedbackSubmitResult =
  | { readonly accepted: true; readonly receivedAt: string }
  | { readonly accepted: false; readonly code: LandingFeedbackSubmitFailureCode };

export class LandingFeedbackApiError extends Error {
  public constructor(
    readonly code: LandingFeedbackSubmitFailureCode,
    readonly status?: number,
  ) {
    super(code);
    this.name = 'LandingFeedbackApiError';
  }
}

export interface LandingFeedbackApiOptions {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
}

function configuredBaseUrl(): string {
  const configured: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
  return typeof configured === 'string' && configured.trim() !== ''
    ? configured.replace(/\/$/u, '')
    : '';
}

/** WEB-026: anonymous closed-contract submission transport for the landing form. */
export function createLandingFeedbackApi(options: LandingFeedbackApiOptions = {}) {
  const baseUrl = (options.baseUrl ?? configuredBaseUrl()).replace(/\/$/u, '');
  const fetcher = createSessionAwareFetchV1({
    apiBaseUrl: baseUrl,
    fetcher: options.fetcher ?? globalThis.fetch.bind(globalThis),
  });

  async function submit(input: LandingFeedbackSubmission): Promise<LandingFeedbackSubmitResult> {
    const payload: LfbLandingFeedbackCommand = { schemaVersion: 4, ...input };
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}/v1/landing/feedbacks`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      return { accepted: false, code: 'LANDING_FEEDBACK_REQUEST_FAILED' };
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as
        | { readonly code?: unknown }
        | undefined;
      const code = typeof body?.code === 'string' ? body.code : '';
      if (response.status === 429 || code === 'LANDING_FEEDBACK_RATE_LIMITED')
        return { accepted: false, code: 'LANDING_FEEDBACK_RATE_LIMITED' };
      if (code === 'LANDING_FEEDBACK_COMMAND_INVALID')
        return { accepted: false, code: 'LANDING_FEEDBACK_COMMAND_INVALID' };
      return { accepted: false, code: 'LANDING_FEEDBACK_UNAVAILABLE' };
    }
    const raw: unknown = await response.json().catch(() => undefined);
    const parsed = parseV4Contract<LfbLandingFeedbackAccepted>(
      LANDING_FEEDBACK_ACCEPTED_SCHEMA,
      raw,
    );
    return parsed.accepted
      ? Object.freeze({ accepted: true as const, receivedAt: parsed.value.receivedAt })
      : { accepted: false, code: 'LANDING_FEEDBACK_UNAVAILABLE' };
  }

  return Object.freeze({ submit });
}

export type LandingFeedbackApi = ReturnType<typeof createLandingFeedbackApi>;

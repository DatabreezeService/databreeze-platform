export const LFB_LANDING_FEEDBACK_SERVICE = Symbol('LFB_LANDING_FEEDBACK_SERVICE');
export const LFB_FEEDBACK_IP_ADMISSION = Symbol('LFB_FEEDBACK_IP_ADMISSION');
export const LFB_FEEDBACK_ADMISSION_DIGEST = Symbol('LFB_FEEDBACK_ADMISSION_DIGEST');

export type LandingFeedbackRoleV1 =
  | 'owner'
  | 'analyst'
  | 'accounting'
  | 'operations'
  | 'technology'
  | 'other';
export type LandingFeedbackExperienceV1 = 'exploring' | 'trial' | 'active';
export type LandingFeedbackCategoryV1 =
  | 'product'
  | 'feature'
  | 'data-trust'
  | 'design'
  | 'performance'
  | 'other';

/** WEB-026: closed v4 landing feedback command after contract validation. */
export interface LandingFeedbackCommandV1 {
  readonly email: string;
  readonly name?: string;
  readonly organization?: string;
  readonly role: LandingFeedbackRoleV1;
  readonly experience: LandingFeedbackExperienceV1;
  readonly category: LandingFeedbackCategoryV1;
  readonly rating: number;
  readonly message: string;
  readonly contactPermission: boolean;
}

export interface LandingFeedbackReceiptV1 {
  readonly referenceId: string;
  readonly receivedAt: string;
}

export type LandingFeedbackIntakeResultV1 =
  | { readonly accepted: true; readonly value: LandingFeedbackReceiptV1 }
  | { readonly accepted: false; readonly code: 'LANDING_FEEDBACK_UNAVAILABLE' };

/** WEB-026: lfb-owned persistence for anonymous public landing feedback. */
export interface LandingFeedbackIntakePortV1 {
  capture(input: {
    readonly command: LandingFeedbackCommandV1;
    readonly sourceIpHash?: string;
    readonly receivedAt: string;
  }): Promise<LandingFeedbackIntakeResultV1>;
}

export interface LandingFeedbackListItemV1 {
  readonly id: string;
  readonly createdAt: string;
  readonly email: string;
  readonly name?: string;
  readonly organization?: string;
  readonly role: LandingFeedbackRoleV1;
  readonly experience: LandingFeedbackExperienceV1;
  readonly category: LandingFeedbackCategoryV1;
  readonly rating: number;
  readonly message: string;
  readonly contactPermission: boolean;
}

/** WEB-027: bounded read consumed by the platform-admin composition. */
export interface LandingFeedbackListPortV1 {
  readRecent(
    limit: number,
  ): Promise<{ readonly total: number; readonly items: readonly LandingFeedbackListItemV1[] }>;
}

/** Abuse-control boundary for anonymous submissions; callers pass only a one-way digest. */
export interface LandingFeedbackAdmissionPortV1 {
  allow(keyDigest: string, issuedAt: string): Promise<boolean>;
}

export interface LandingFeedbackAdmissionDigestPortV1 {
  digestCandidates(kind: 'ip', value: string): readonly string[];
}

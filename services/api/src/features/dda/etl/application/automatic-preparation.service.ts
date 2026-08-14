import {
  classifyAutomaticPreparation,
  type AutomaticPreparationClassificationV1,
  type AutomaticPreparationPolicyV1,
  type AutomaticPreparationPlanV1,
  type AutomaticPreparationProfileV1,
} from './automatic-preparation-policy.js';

export type AutomaticPreparationRouteV1 =
  | {
      readonly kind: 'ENQUEUE_ACCEPTED_JOB';
      readonly classification: AutomaticPreparationClassificationV1;
    }
  | { readonly kind: 'ETL_REVIEW'; readonly classification: AutomaticPreparationClassificationV1 }
  | {
      readonly kind: 'BLOCKED_REVIEW_ITEM';
      readonly classification: AutomaticPreparationClassificationV1;
    };

/** DDA-053: route classification to auto-accept, review, or blocked review items. */
export class AutomaticPreparationService {
  public classifyAndRoute(
    plan: AutomaticPreparationPlanV1,
    profile: AutomaticPreparationProfileV1,
    approvedPolicy?: AutomaticPreparationPolicyV1,
  ): AutomaticPreparationRouteV1 {
    const classification = classifyAutomaticPreparation(plan, profile, approvedPolicy);
    if (classification.decision === 'AUTO_ACCEPT_SAFE') {
      return Object.freeze({ kind: 'ENQUEUE_ACCEPTED_JOB', classification });
    }
    if (classification.decision === 'REVIEW_REQUIRED') {
      return Object.freeze({ kind: 'ETL_REVIEW', classification });
    }
    return Object.freeze({ kind: 'BLOCKED_REVIEW_ITEM', classification });
  }
}

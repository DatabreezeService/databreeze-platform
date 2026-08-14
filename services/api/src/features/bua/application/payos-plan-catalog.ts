/**
 * BUA commercial catalog. The browser submits only an id; the amount is owned
 * here so a modified client can never choose its own PayOS amount (BUA-001/002).
 */
export type PayosPlanId =
  | 'personal-monthly'
  | 'personal-annual'
  | 'professional-monthly'
  | 'professional-annual'
  | 'team-monthly'
  | 'team-annual';

export interface PayosPlanV1 {
  readonly id: PayosPlanId;
  readonly amountVnd: number;
  readonly description: string;
}

const plans: readonly PayosPlanV1[] = Object.freeze([
  { id: 'personal-monthly', amountVnd: 149_000, description: 'DataBreeze Ca nhan thang' },
  { id: 'personal-annual', amountVnd: 1_490_000, description: 'DataBreeze Ca nhan nam' },
  // PayOS limits `description` to 25 characters; keep the server-owned
  // payment labels within that limit while preserving the plan ids/prices.
  { id: 'professional-monthly', amountVnd: 399_000, description: 'DataBreeze Pro thang' },
  { id: 'professional-annual', amountVnd: 3_990_000, description: 'DataBreeze Pro nam' },
  { id: 'team-monthly', amountVnd: 999_000, description: 'DataBreeze Team thang' },
  { id: 'team-annual', amountVnd: 9_990_000, description: 'DataBreeze Team nam' },
]);

export function listPayosPlans(): readonly PayosPlanV1[] {
  return plans;
}

export function findPayosPlan(input: unknown): PayosPlanV1 | undefined {
  return typeof input === 'string' ? plans.find((plan) => plan.id === input) : undefined;
}

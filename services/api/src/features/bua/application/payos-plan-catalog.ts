/**
 * BUA commercial catalog.
 *
 * Prices and customer-facing allowances are server-owned. The values mirror the
 * internal marketing proposal; the browser can only submit the immutable plan id
 * (BUA-001/002). Provider descriptions stay ASCII and <= 25 characters because
 * PayOS applies that limit to payment-order descriptions.
 */
export type PayosPlanId =
  | 'personal-monthly'
  | 'personal-annual'
  | 'professional-monthly'
  | 'professional-annual'
  | 'team-monthly'
  | 'team-annual';

export type PayosPlanFamily = 'personal' | 'professional' | 'team';
export type PayosPlanBillingCycle = 'monthly' | 'annual';

export interface PayosPlanAllowanceV1 {
  readonly connectedFolders: 'unlimited';
  readonly ocrPagesPerMonth: number;
  readonly agentCreditsPerMonth: number;
  readonly etlRowsPerMonth: number;
  readonly logicalDatasets: number;
  readonly governedStorageGb: number;
  readonly agentEnabledMembers: number;
  readonly viewerMembers: number;
  readonly workspaces: number;
  readonly refreshMinutes: number;
}

export interface PayosPlanV1 {
  readonly id: PayosPlanId;
  readonly family: PayosPlanFamily;
  readonly billingCycle: PayosPlanBillingCycle;
  readonly amountVnd: number;
  /** Provider-facing label. Do not show this as the marketing headline. */
  readonly description: string;
  readonly displayNameVi: string;
  readonly displayNameEn: string;
  readonly taglineVi: string;
  readonly taglineEn: string;
  readonly benefitsVi: readonly string[];
  readonly benefitsEn: readonly string[];
  readonly allowances: PayosPlanAllowanceV1;
}

const personalAllowances: PayosPlanAllowanceV1 = Object.freeze({
  connectedFolders: 'unlimited',
  ocrPagesPerMonth: 200,
  agentCreditsPerMonth: 1_000,
  etlRowsPerMonth: 5_000_000,
  logicalDatasets: 20,
  governedStorageGb: 10,
  agentEnabledMembers: 1,
  viewerMembers: 2,
  workspaces: 1,
  refreshMinutes: 60,
});

const professionalAllowances: PayosPlanAllowanceV1 = Object.freeze({
  connectedFolders: 'unlimited',
  ocrPagesPerMonth: 500,
  agentCreditsPerMonth: 4_000,
  etlRowsPerMonth: 25_000_000,
  logicalDatasets: 100,
  governedStorageGb: 50,
  agentEnabledMembers: 3,
  viewerMembers: 10,
  workspaces: 3,
  refreshMinutes: 15,
});

const teamAllowances: PayosPlanAllowanceV1 = Object.freeze({
  connectedFolders: 'unlimited',
  ocrPagesPerMonth: 1_500,
  agentCreditsPerMonth: 12_000,
  etlRowsPerMonth: 100_000_000,
  logicalDatasets: 500,
  governedStorageGb: 250,
  agentEnabledMembers: 8,
  viewerMembers: 50,
  workspaces: 10,
  refreshMinutes: 5,
});

const plans: readonly PayosPlanV1[] = Object.freeze([
  {
    id: 'personal-monthly',
    family: 'personal',
    billingCycle: 'monthly',
    amountVnd: 149_000,
    description: 'DataBreeze Ca nhan thang',
    displayNameVi: 'Cá nhân',
    displayNameEn: 'Personal',
    taglineVi: 'Cho cửa hàng nhỏ và người vận hành độc lập',
    taglineEn: 'For individual operators and small stores',
    benefitsVi: [
      'Thư mục Windows không giới hạn',
      '20 tập dữ liệu và 10 GB lưu trữ',
      'Đầy đủ Web, Desktop và Android',
    ],
    benefitsEn: [
      'Unlimited approved Windows folders',
      '20 datasets and 10 GB storage',
      'Web, Desktop and Android included',
    ],
    allowances: personalAllowances,
  },
  {
    id: 'personal-annual',
    family: 'personal',
    billingCycle: 'annual',
    amountVnd: 1_490_000,
    description: 'DataBreeze Ca nhan nam',
    displayNameVi: 'Cá nhân',
    displayNameEn: 'Personal',
    taglineVi: 'Tiết kiệm khi thanh toán theo năm',
    taglineEn: 'Save with annual billing',
    benefitsVi: [
      'Thư mục Windows không giới hạn',
      '20 tập dữ liệu và 10 GB lưu trữ',
      'Đầy đủ Web, Desktop và Android',
    ],
    benefitsEn: [
      'Unlimited approved Windows folders',
      '20 datasets and 10 GB storage',
      'Web, Desktop and Android included',
    ],
    allowances: personalAllowances,
  },
  {
    id: 'professional-monthly',
    family: 'professional',
    billingCycle: 'monthly',
    amountVnd: 399_000,
    description: 'DataBreeze Pro thang',
    displayNameVi: 'Chuyên nghiệp',
    displayNameEn: 'Professional',
    taglineVi: 'Cho nhóm vận hành cần kiểm soát dữ liệu',
    taglineEn: 'For small operating teams',
    benefitsVi: [
      'Thư mục Windows không giới hạn',
      '100 tập dữ liệu và 50 GB lưu trữ',
      '3 workspace và 10 thành viên Viewer',
    ],
    benefitsEn: [
      'Unlimited approved Windows folders',
      '100 datasets and 50 GB storage',
      '3 workspaces and 10 Viewer members',
    ],
    allowances: professionalAllowances,
  },
  {
    id: 'professional-annual',
    family: 'professional',
    billingCycle: 'annual',
    amountVnd: 3_990_000,
    description: 'DataBreeze Pro nam',
    displayNameVi: 'Chuyên nghiệp',
    displayNameEn: 'Professional',
    taglineVi: 'Tiết kiệm khi thanh toán theo năm',
    taglineEn: 'Save with annual billing',
    benefitsVi: [
      'Thư mục Windows không giới hạn',
      '100 tập dữ liệu và 50 GB lưu trữ',
      '3 workspace và 10 thành viên Viewer',
    ],
    benefitsEn: [
      'Unlimited approved Windows folders',
      '100 datasets and 50 GB storage',
      '3 workspaces and 10 Viewer members',
    ],
    allowances: professionalAllowances,
  },
  {
    id: 'team-monthly',
    family: 'team',
    billingCycle: 'monthly',
    amountVnd: 999_000,
    description: 'DataBreeze Team thang',
    displayNameVi: 'Nhóm',
    displayNameEn: 'Team',
    taglineVi: 'Cho tổ chức đang phát triển',
    taglineEn: 'For growing organizations',
    benefitsVi: [
      'Thư mục Windows không giới hạn',
      '500 tập dữ liệu và 250 GB lưu trữ',
      '10 workspace và 50 thành viên Viewer',
    ],
    benefitsEn: [
      'Unlimited approved Windows folders',
      '500 datasets and 250 GB storage',
      '10 workspaces and 50 Viewer members',
    ],
    allowances: teamAllowances,
  },
  {
    id: 'team-annual',
    family: 'team',
    billingCycle: 'annual',
    amountVnd: 9_990_000,
    description: 'DataBreeze Team nam',
    displayNameVi: 'Nhóm',
    displayNameEn: 'Team',
    taglineVi: 'Tiết kiệm khi thanh toán theo năm',
    taglineEn: 'Save with annual billing',
    benefitsVi: [
      'Thư mục Windows không giới hạn',
      '500 tập dữ liệu và 250 GB lưu trữ',
      '10 workspace và 50 thành viên Viewer',
    ],
    benefitsEn: [
      'Unlimited approved Windows folders',
      '500 datasets and 250 GB storage',
      '10 workspaces and 50 Viewer members',
    ],
    allowances: teamAllowances,
  },
]);

export function listPayosPlans(): readonly PayosPlanV1[] {
  return plans;
}

export function findPayosPlan(input: unknown): PayosPlanV1 | undefined {
  return typeof input === 'string' ? plans.find((plan) => plan.id === input) : undefined;
}

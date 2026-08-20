import { createHash, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readFileSync, existsSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, resolve } from 'node:path';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import { argon2id, hash } from 'argon2';

import {
  LOCAL_FEEDBACK_EMAILS,
  LOCAL_PLATFORM_ANALYTICS_IDENTITIES,
} from './local-feedback-seed.mjs';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, '../../..');
const LOCAL_ENV_PATH = resolve(REPOSITORY_ROOT, 'infrastructure/local/.env');
const LOCAL_FIXTURE_DIRECTORY = resolve(
  REPOSITORY_ROOT,
  'tools/fixture-validation/fixtures/dda/unified-workspace',
);
const NOW = new Date('2026-08-14T00:00:00.000Z');
const PASSWORD_HASH_OPTIONS = Object.freeze({
  type: argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
  saltLength: 16,
});

const ids = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

const ID = Object.freeze({
  organization: ids(1),
  workspace: ids(2),
  project: ids(3),
  financeProject: ids(4),
  owner: ids(10),
  analyst: ids(11),
  viewer: ids(12),
  admin: ids(16),
  platformOwner: ids(7001),
  ownerOrganizationMembership: ids(20),
  ownerWorkspaceMembership: ids(21),
  ownerProjectMembership: ids(22),
  analystWorkspaceMembership: ids(23),
  analystProjectMembership: ids(24),
  viewerWorkspaceMembership: ids(25),
  viewerProjectMembership: ids(26),
  adminOrganizationMembership: ids(27),
  adminWorkspaceMembership: ids(28),
  adminProjectMembership: ids(29),
  platformOwnerOrganizationMembership: ids(7002),
  platformOwnerWorkspaceMembership: ids(7003),
  platformOwnerProjectMembership: ids(7004),
  workerServiceAccount: ids(7005),
  policy: ids(30),
  policyVersion: ids(31),
  policyActivation: ids(32),
  device: ids(40),
  deviceCapability: ids(41),
  deviceGrant: ids(42),
  syncOperation: ids(43),
  syncConflict: ids(44),
  localPackage: ids(45),
  transferReceipt: ids(46),
  expenseDataset: ids(100),
  expenseSchema: ids(101),
  expenseMapping: ids(102),
  expenseRules: ids(103),
  expenseVersion: ids(104),
  expenseQuality: ids(105),
  expenseProfile: ids(106),
  expenseExport: ids(107),
  expenseVersionTwo: ids(108),
  expenseQualityTwo: ids(109),
  expenseProfileTwo: ids(110),
  folderDataset: ids(120),
  folderSchema: ids(121),
  folderMapping: ids(122),
  folderRules: ids(123),
  folderVersion: ids(124),
  folderQuality: ids(125),
  folderProfile: ids(126),
  folderExport: ids(127),
  restrictedDataset: ids(140),
  restrictedSchema: ids(141),
  restrictedMapping: ids(142),
  restrictedRules: ids(143),
  restrictedVersion: ids(144),
  restrictedQuality: ids(145),
  restrictedProfile: ids(146),
  expenseArtifact: ids(200),
  expenseArtifactVersion: ids(201),
  expensePlacement: ids(202),
  expenseInbox: ids(203),
  workbookArtifact: ids(204),
  workbookArtifactVersion: ids(205),
  workbookPlacement: ids(206),
  workbookInbox: ids(207),
  mismatchArtifact: ids(208),
  mismatchArtifactVersion: ids(209),
  mismatchPlacement: ids(210),
  mismatchInbox: ids(211),
  folderArtifact: ids(212),
  folderArtifactVersion: ids(213),
  folderPlacement: ids(214),
  folderInbox: ids(215),
  receiptArtifact: ids(216),
  receiptArtifactVersion: ids(217),
  receiptPlacement: ids(218),
  receiptInbox: ids(219),
  expenseEvidence: ids(220),
  receiptEvidence: ids(221),
  workbookLineage: ids(222),
  spreadsheetAudit: ids(223),
  expenseSource: ids(230),
  workbookSource: ids(231),
  restrictedSource: ids(232),
  folderSource: ids(233),
  receiptSource: ids(234),
  folderAssignment: ids(235),
  restrictedAssignment: ids(236),
  folderPlacementReview: ids(240),
  folderMoveReceipt: ids(241),
  dashboard: ids(300),
  publishedDashboardVersion: ids(301),
  draftDashboardVersion: ids(302),
  analysisPlan: ids(303),
  analysisPlanVersion: ids(304),
  kpiMaterialization: ids(305),
  barMaterialization: ids(306),
  dashboardSnapshot: ids(307),
  refreshState: ids(308),
  refreshExecution: ids(309),
  refreshEvent: ids(310),
  refreshCorrelation: ids(311),
  conversation: ids(312),
  conversationMessageOne: ids(313),
  conversationMessageTwo: ids(314),
  conversationMessageThree: ids(315),
  conversationContextEvent: ids(316),
  namedDashboardView: ids(317),
  dashboardProposal: ids(318),
  etlProposal: ids(319),
  etlAcceptance: ids(320),
  receiptCommand: ids(321),
  extractionCandidate: ids(322),
  notification: ids(323),
  notificationProjectionReceipt: ids(324),
  notificationStateReceipt: ids(325),
  agentCommand: ids(326),
  dashboardAuthoringCommand: ids(327),
  publicationAudit: ids(328),
  publicationInvalidation: ids(329),
  permissionProjection: ids(330),
  semanticVersion: ids(331),
  metricVersion: ids(332),
  publishedPage: ids(350),
  publishedKpiWidget: ids(351),
  publishedBarWidget: ids(352),
  dashboardFilter: ids(353),
  dashboardKpiResultArtifact: ids(250),
  dashboardKpiResultVersion: ids(251),
  dashboardKpiResultPlacement: ids(252),
  dashboardBarResultArtifact: ids(253),
  dashboardBarResultVersion: ids(254),
  dashboardBarResultPlacement: ids(255),
  reportClient: ids(360),
  reportDefinition: ids(361),
  reportTemplate: ids(362),
  typedAction: ids(400),
  job: ids(401),
  jobTransitionCreated: ids(402),
  jobTransitionQueued: ids(403),
  jobTransitionSucceeded: ids(404),
  jobTransitionRunning: ids(409),
  jobOutbox: ids(405),
  executionAttempt: ids(406),
  resultManifest: ids(407),
  executionDescriptor: ids(408),
  kpiResultManifest: ids(410),
  barResultManifest: ids(411),
  kpiResultAttempt: ids(412),
  barResultAttempt: ids(413),
  kpiAttestation: ids(414),
  barAttestation: ids(415),
  kpiFinalization: ids(416),
  barFinalization: ids(417),
  reservation: ids(500),
  settlementBinding: ids(501),
  widgetAction: ids(420),
  // These executable local rows intentionally use a fresh immutable identity
  // so a reload never tries to mutate an older descriptor or its output object.
  // The previous 584/588 fixture remains readable as historical local data.
  widgetJob: ids(684),
  widgetTransitionCreated: ids(685),
  widgetTransitionQueued: ids(686),
  widgetOutbox: ids(687),
  widgetDescriptor: ids(688),
  widgetReservation: ids(689),
  widgetSettlementBinding: ids(690),
  widgetOutputObject: ids(691),
  widgetCellOne: ids(530),
  widgetCellTwo: ids(531),
  widgetCellThree: ids(532),
  widgetCellFour: ids(533),
  usageEntry: ids(502),
  entitlementSnapshot: ids(503),
  auditEvent: ids(600),
  auditSeal: ids(601),
});

const workspaceScope = Object.freeze({
  scopeType: 'workspace',
  organizationId: ID.organization,
  workspaceId: ID.workspace,
  projectId: null,
});
const projectScope = Object.freeze({
  scopeType: 'project',
  organizationId: ID.organization,
  workspaceId: ID.workspace,
  projectId: ID.project,
});

function minutesBefore(minutes) {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

function minutesAfter(minutes) {
  return new Date(NOW.getTime() + minutes * 60 * 1000);
}

export function buildPlatformAnalyticsRows() {
  const organizationNames = [
    'An Phú Retail',
    'Minh Long Logistics',
    'Sông Việt Foods',
    'Hải Đăng Studio',
    'Mộc Nhiên Home',
    'Nam Phương Distribution',
    'Lotus Field Services',
    'Blue Harbor Commerce',
    'Cửu Long Analytics',
    'Thành Công Trading',
    'Việt Phú Services',
    'Ánh Dương Digital',
    'Đông Nam Commerce',
    'Khánh Minh Consulting',
    'Phúc An Distribution',
    'Trường Hải Operations',
    'Bảo Tín Solutions',
    'Quang Huy Studio',
    'Minh Tâm Retail',
    'Ngọc Việt Logistics',
    'Hồng Hà Foods',
  ];
  const organizations = organizationNames.map((name, index) => ({
    id: ids(8_000 + index),
    name,
    personal: true,
    status: 'ACTIVE',
    createdAt: minutesBefore((18 + index * 29) * 1_440),
    updatedAt: minutesBefore((3 + index * 7) * 1_440),
  }));
  const users = LOCAL_PLATFORM_ANALYTICS_IDENTITIES.map(([email, displayName], index) => {
    const daysAgo = 4 + index * 4;
    return {
      id: ids(8_100 + index),
      email,
      displayName,
      locale: index % 4 === 0 ? 'en' : 'vi-VN',
      status: 'ACTIVE',
      securityEpoch: 1,
      mfaReenrollmentRequired: false,
      createdAt: minutesBefore(daysAgo * 1_440),
      updatedAt: minutesBefore(Math.max(1, daysAgo - 1) * 1_440),
      organizationId: organizations[index % organizations.length].id,
    };
  });
  const paymentOrders = organizations.map((organization, index) => {
    const createdAt = minutesBefore((7 + index * 5) * 1_440);
    const paidAt = minutesBefore((7 + index * 5) * 1_440 - 15);
    return {
      id: ids(8_300 + index),
      provider: 'PAYOS',
      providerOrderCode: BigInt(9_100_000 + index),
      scopeKey: `organization:${organization.id}`,
      scopeType: 'organization',
      organizationId: organization.id,
      workspaceId: null,
      actorId: users[index].id,
      securityEpoch: 1,
      planId: 'personal-monthly',
      amountVnd: 149_000,
      currency: 'VND',
      status: 'PAID',
      checkoutUrl: null,
      idempotencyKey: `local-platform-order-${index + 1}`,
      failureCode: null,
      paidAt,
      cancelledAt: null,
      createdAt,
      updatedAt: paidAt,
      revision: 2,
    };
  });
  const subscriptions = organizations.map((organization, index) => {
    const payment = paymentOrders[index];
    return {
      id: ids(8_200 + index),
      scopeKey: payment.scopeKey,
      scopeType: 'organization',
      organizationId: organization.id,
      workspaceId: null,
      planId: 'personal-monthly',
      source: 'PAYOS',
      status: 'ACTIVE',
      currentOrderId: payment.id,
      startsAt: payment.createdAt,
      endsAt: null,
      revision: 2,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  });
  const invoices = paymentOrders.map((payment, index) => ({
    id: ids(8_400 + index),
    paymentOrderId: payment.id,
    scopeKey: payment.scopeKey,
    organizationId: payment.organizationId,
    workspaceId: null,
    planId: payment.planId,
    amountVnd: payment.amountVnd,
    currency: 'VND',
    status: 'PAID',
    issuedAt: payment.paidAt,
    paidAt: payment.paidAt,
    createdAt: payment.paidAt,
  }));
  const memberships = users.map((user, index) => ({
    id: ids(8_500 + index),
    principalType: 'USER',
    principalId: user.id,
    scopeType: 'ORGANIZATION',
    organizationId: user.organizationId,
    workspaceId: null,
    projectId: null,
    roleId: index % 3 === 0 ? 'owner' : 'member',
    status: user.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
    startsAt: user.createdAt,
    expiresAt: null,
    revision: 1,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }));
  return { organizations, users, memberships, paymentOrders, subscriptions, invoices };
}

function digest(value) {
  const input = typeof value === 'string' ? value : JSON.stringify(value);
  return createHash('sha256')
    .update(input ?? '', 'utf8')
    .digest('hex');
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const result = {};
  for (const sourceLine of readFileSync(filePath, 'utf8').split(/\r?\n/u)) {
    const line = sourceLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function localEnvironment() {
  const environment = Object.freeze({ ...readEnvFile(LOCAL_ENV_PATH), ...process.env });
  if (
    environment.DATABREEZE_RUNTIME_PROFILE &&
    environment.DATABREEZE_RUNTIME_PROFILE !== 'local'
  ) {
    throw new Error('LOCAL_SEED_RUNTIME_PROFILE_INVALID');
  }
  return environment;
}

function isLocalHostname(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1' ||
    hostname === 'postgres'
  );
}

function localDatabaseUrl(environment) {
  const configured = environment.DATABASE_URL?.trim();
  const candidate =
    configured ||
    `postgresql://${encodeURIComponent(environment.POSTGRES_USER || 'databreeze')}:${encodeURIComponent(environment.POSTGRES_PASSWORD || 'databreeze-local-change-me')}@127.0.0.1:${environment.POSTGRES_PORT || '5432'}/${environment.POSTGRES_DB || 'databreeze'}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('LOCAL_SEED_DATABASE_URL_INVALID');
  }
  if (
    (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') ||
    !isLocalHostname(parsed.hostname) ||
    parsed.username.length === 0 ||
    parsed.password.length === 0 ||
    parsed.pathname.length <= 1 ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new Error('LOCAL_SEED_DATABASE_URL_INVALID');
  }
  if (parsed.hostname === 'postgres') {
    parsed.hostname = '127.0.0.1';
    if (environment.POSTGRES_PORT) parsed.port = environment.POSTGRES_PORT;
  }
  return parsed.toString();
}

function localObjectStore(environment) {
  const configured = environment.DATABREEZE_LOCAL_MINIO_ENDPOINT?.trim();
  const endpoint = configured || `http://127.0.0.1:${environment.MINIO_API_PORT || '9000'}`;
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('LOCAL_SEED_MINIO_CONFIGURATION_INVALID');
  }
  if (parsed.hostname === 'minio') parsed.hostname = '127.0.0.1';
  if (
    parsed.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname) ||
    parsed.pathname !== '/' ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new Error('LOCAL_SEED_MINIO_CONFIGURATION_INVALID');
  }
  const accessKeyId =
    environment.DATABREEZE_LOCAL_MINIO_ACCESS_KEY || environment.MINIO_ROOT_USER || 'databreeze';
  const secretAccessKey =
    environment.DATABREEZE_LOCAL_MINIO_SECRET_KEY ||
    environment.MINIO_ROOT_PASSWORD ||
    'databreeze-local-change-me';
  const bucket =
    environment.DATABREEZE_LOCAL_MINIO_BUCKET ||
    environment.MINIO_BUCKET_ARTIFACTS ||
    'databreeze-artifacts';
  return Object.freeze({
    endpoint: parsed.toString().replace(/\/$/u, ''),
    accessKeyId,
    secretAccessKey,
    bucket,
  });
}

function fixtureBytes(fileName) {
  const filePath = resolve(LOCAL_FIXTURE_DIRECTORY, fileName);
  if (!existsSync(filePath)) throw new Error(`LOCAL_SEED_FIXTURE_MISSING:${fileName}`);
  return readFileSync(filePath);
}

function generatedClientPath() {
  const directories = [
    resolve(REPOSITORY_ROOT, 'services/api/build/prisma-client'),
    resolve(process.cwd(), 'build/prisma-client'),
  ];
  for (const directory of directories) {
    const typescriptClient = resolve(directory, 'client.ts');
    if (existsSync(typescriptClient)) return typescriptClient;
    const javascriptClient = resolve(directory, 'client.js');
    if (existsSync(javascriptClient)) return javascriptClient;
  }
  throw new Error(
    'LOCAL_SEED_PRISMA_CLIENT_MISSING: run corepack pnpm --filter @databreeze/api prisma:generate first',
  );
}

let registeredGeneratedClientDirectory;

function registerGeneratedClientTypescriptResolver(clientPath) {
  const generatedDirectory = `${pathToFileURL(resolve(clientPath, '..')).href}/`;
  if (registeredGeneratedClientDirectory === generatedDirectory) return;
  const loaderSource = `
    const generatedDirectory = ${JSON.stringify(generatedDirectory)};
    export async function resolve(specifier, context, nextResolve) {
      if (context.parentURL?.startsWith(generatedDirectory) && specifier.endsWith('.js')) {
        return nextResolve(specifier.slice(0, -3) + '.ts', context);
      }
      return nextResolve(specifier, context);
    }
  `;
  register(`data:text/javascript;base64,${Buffer.from(loaderSource).toString('base64')}`, {
    parentURL: import.meta.url,
  });
  registeredGeneratedClientDirectory = generatedDirectory;
}

export async function loadPrismaClient() {
  const clientPath = generatedClientPath();
  if (clientPath.endsWith('.ts')) registerGeneratedClientTypescriptResolver(clientPath);
  const generated = await import(pathToFileURL(clientPath).href);
  return generated.PrismaClient;
}

// WEB-026/WEB-027: deterministic synthetic landing feedback for the local console
// journey only. Production never creates feedback rows from repository seeds.
export function buildLandingFeedbackRows() {
  const rows = [
    [
      'Lê Thanh Hải',
      LOCAL_FEEDBACK_EMAILS[0],
      'An Nam Retail Group',
      'owner',
      'active',
      'product',
      5,
      'DataBreeze giúp chuỗi 18 cửa hàng của chúng tôi hợp nhất toàn bộ dữ liệu bán hàng từ POS và Excel chỉ trong vài phút. Điểm ấn tượng nhất là tính năng AI giải thích doanh thu có kèm nguồn gốc đối chiếu từng dòng, không bị tình trạng bịa số liệu như các công cụ khác.',
      true,
      '2026-08-14T09:30:00.000Z',
    ],
    [
      'Duy Đỗ',
      LOCAL_FEEDBACK_EMAILS[1],
      'Sài Gòn Logistics Corp',
      'operations',
      'active',
      'feature',
      5,
      'Khả năng xử lý các file lịch trình xe và chi phí nhiên liệu hàng ngày rất mượt mà. Đề xuất đội ngũ bổ sung thêm tính năng cảnh báo tự động qua webhook hoặc email khi có chỉ số chi phí đội xe vượt ngưỡng định mức.',
      true,
      '2026-08-13T14:15:00.000Z',
    ],
    [
      'Lâm Gia Kiệt',
      LOCAL_FEEDBACK_EMAILS[2],
      'Dược Phẩm Thăng Long',
      'accounting',
      'trial',
      'data-trust',
      5,
      'Chế độ Hybrid bảo mật cực kỳ ấn tượng! Ban giám đốc bên mình rất khắt khe về bảo mật dữ liệu doanh thu, nhờ DataBreeze giữ nguyên file gốc tại Desktop và chỉ đẩy bản chiếu projection đã duyệt lên Web nên quy trình kiểm toán nội bộ thông qua rất nhanh.',
      true,
      '2026-08-12T11:45:00.000Z',
    ],
    [
      'Trần Đặng Minh Quân',
      LOCAL_FEEDBACK_EMAILS[3],
      'Fintech Solutions VN',
      'analyst',
      'active',
      'performance',
      5,
      'Dataset hơn 200.000 dòng tải vào phân tích và vẽ biểu đồ rất nhanh, độ trễ hầu như bằng 0. Trợ lý AI tóm tắt nguyên nhân tăng trưởng theo từng khu vực địa lý rất chính xác và tiện lợi khi làm slide báo cáo cho ban quản trị.',
      true,
      '2026-08-11T16:20:00.000Z',
    ],
    [
      'Mai Nguyễn Duy Khánh',
      LOCAL_FEEDBACK_EMAILS[4],
      'Chuỗi F&B Cà Phê Mộc',
      'owner',
      'active',
      'design',
      5,
      'Giao diện trực quan, sang trọng và không rườm rà. Các bạn quản lý ca không rành kỹ thuật vẫn tự nhìn dashboard hiểu ngay doanh số giờ cao điểm và tỷ lệ hao hụt nguyên vật liệu.',
      true,
      '2026-08-10T08:10:00.000Z',
    ],
    [
      'Hoàng Đức',
      LOCAL_FEEDBACK_EMAILS[5],
      'Nông Sản Miền Tây Co.',
      'technology',
      'trial',
      'feature',
      4,
      'Kiến trúc client-server và contract JSON Schema của nền tảng rất chặt chẽ. Rất mong DataBreeze sớm mở thêm REST API public để chúng tôi tích hợp trực tiếp dữ liệu từ hệ thống kho ERP nội bộ.',
      true,
      '2026-08-09T17:05:00.000Z',
    ],
    [
      'Huỳnh An Khương',
      LOCAL_FEEDBACK_EMAILS[6],
      'May Mặc VinaText',
      'operations',
      'trial',
      'product',
      4,
      'Dùng thử 2 tuần cho xưởng may thấy tiết kiệm được ít nhất 10 tiếng tổng hợp báo cáo mỗi tuần. Chỉ cần kéo thả file theo dõi sản lượng là các biểu đồ tự động cập nhật snapshot mới.',
      true,
      '2026-08-08T10:30:00.000Z',
    ],
    [
      'Nhi Phạm',
      LOCAL_FEEDBACK_EMAILS[7],
      'Thời Trang NEM - Chi Nhánh Miền Nam',
      'analyst',
      'active',
      'feature',
      5,
      'Rất thích tính năng truy vết lineage nguồn gốc của từng chỉ số KPI. Đề xuất thêm bộ lọc đa chiều hơn cho nhóm thuộc tính SKU (màu sắc, size) để phân tích tồn kho chuyên sâu hơn.',
      true,
      '2026-08-07T13:40:00.000Z',
    ],
    [
      'Lê Trần Gia Huy',
      LOCAL_FEEDBACK_EMAILS[8],
      'Đại Tín Tax & Accounting',
      'accounting',
      'trial',
      'data-trust',
      5,
      'Khả năng đọc và đối soát file hóa đơn chứng từ kèm OCR của DataBreeze chuẩn xác đáng kinh ngạc. Giúp đội ngũ kế toán phát hiện kịp thời các mục chênh lệch đối chiếu.',
      false,
      '2026-08-06T15:50:00.000Z',
    ],
    [
      'Nguyễn Phan Mạnh Tú',
      LOCAL_FEEDBACK_EMAILS[9],
      'Giao Hàng Express 247',
      'operations',
      'exploring',
      'design',
      4,
      'Website landing page trình bày sản phẩm rất ấn tượng và rõ ràng. Video demo và sơ đồ luồng dữ liệu trực quan giúp ban lãnh đạo bên mình dễ dàng hình dung giải pháp trước khi đăng ký demo.',
      true,
      '2026-08-05T09:15:00.000Z',
    ],
    [
      'Nguyễn Trần Minh Quân',
      LOCAL_FEEDBACK_EMAILS[10],
      'Bảo Hiểm Số AlphaCare',
      'technology',
      'trial',
      'performance',
      5,
      'Ứng dụng Desktop chạy Native rất nhẹ, RAM tiêu tốn ít và đồng bộ mượt lên Web app. Bản build bảo đảm an toàn dữ liệu khách hàng theo đúng chuẩn ISO doanh nghiệp.',
      true,
      '2026-08-04T11:20:00.000Z',
    ],
    [
      'Nguyễn Quốc Huy',
      LOCAL_FEEDBACK_EMAILS[11],
      'Vật Liệu Xây Dựng Tiến Phát',
      'other',
      'exploring',
      'other',
      4,
      'Mong muốn được tư vấn gói Team hoặc Professional cho công ty khoảng 25 nhân sự sử dụng đồng thời. Đã để lại thông tin và mong nhận được liên hệ sớm từ đội ngũ DataBreeze!',
      true,
      '2026-08-03T16:00:00.000Z',
    ],
  ];
  return rows.map(
    (
      [
        name,
        email,
        organization,
        role,
        experience,
        category,
        rating,
        message,
        contactPermission,
        createdAt,
      ],
      index,
    ) => ({
      id: ids(8_900 + index),
      email,
      name,
      organization,
      role,
      experience,
      category,
      rating,
      message,
      contactPermission,
      sourceIpHash: null,
      createdAt: new Date(createdAt),
    }),
  );
}

export async function upsertRows(client, delegateName, rows, uniqueField = 'id') {
  if (rows.length === 0) return;
  const delegate = client[delegateName];
  if (!delegate || typeof delegate.upsert !== 'function') {
    throw new Error(`LOCAL_SEED_DELEGATE_NOT_UPSERTABLE:${delegateName}`);
  }
  for (const row of rows) {
    const key = row[uniqueField];
    await delegate.upsert({
      where: { [uniqueField]: key },
      create: row,
      update: Object.fromEntries(Object.entries(row).filter(([field]) => field !== uniqueField)),
    });
  }
}

// IAM-026/BUA-024/WEB-027: this is the only supported narrow application
// path for refreshing the local platform-admin fixture. It deliberately
// excludes credentials, sessions, tenant product data, and every delete API.
export async function applyPlatformAdminRows(database) {
  const analytics = buildPlatformAnalyticsRows();
  const feedbacks = buildLandingFeedbackRows();

  await database.$transaction(async (transaction) => {
    await upsertRows(transaction, 'organizationIdentity', analytics.organizations);
    await upsertRows(
      transaction,
      'userIdentity',
      analytics.users.map(({ organizationId, ...identity }) => {
        void organizationId;
        return identity;
      }),
    );
    await upsertRows(transaction, 'membershipIdentity', analytics.memberships);
    await upsertRows(transaction, 'paymentOrderRecord', analytics.paymentOrders);
    await upsertRows(transaction, 'subscriptionRecord', analytics.subscriptions);
    await upsertRows(transaction, 'invoiceRecord', analytics.invoices);
    await upsertRows(transaction, 'landingFeedbackRecord', feedbacks);
  });

  return Object.freeze({
    organizations: analytics.organizations.length,
    users: analytics.users.length,
    memberships: analytics.memberships.length,
    paymentOrders: analytics.paymentOrders.length,
    subscriptions: analytics.subscriptions.length,
    invoices: analytics.invoices.length,
    feedbacks: feedbacks.length,
    paidUsers: new Set(
      analytics.paymentOrders
        .filter((order) => order.status === 'PAID')
        .map((order) => order.actorId),
    ).size,
    activeSubscriptions: analytics.subscriptions.filter(
      (subscription) => subscription.status === 'ACTIVE',
    ).length,
    settledRevenueVnd: analytics.invoices
      .filter((invoice) => invoice.status === 'PAID')
      .reduce((total, invoice) => total + invoice.amountVnd, 0),
  });
}

export async function applyPlatformAdminRowsToConfiguredLocalDatabase() {
  const environment = localEnvironment();
  const connectionString = localDatabaseUrl(environment);
  const prismaConstructor = await loadPrismaClient();
  const adapter = new PrismaPg({ connectionString });
  const database = new prismaConstructor({ adapter });

  await database.$connect();
  try {
    return await applyPlatformAdminRows(database);
  } finally {
    await database.$disconnect();
  }
}

export async function readPlatformAdminMetrics(database) {
  const [totalUsers, paidActors, activeSubscriptions, settled, feedbacks] = await Promise.all([
    database.userIdentity.count(),
    database.paymentOrderRecord.groupBy({
      by: ['actorId'],
      where: { status: 'PAID' },
      _count: { _all: true },
    }),
    database.subscriptionRecord.count({ where: { status: 'ACTIVE' } }),
    database.invoiceRecord.aggregate({
      where: { status: 'PAID' },
      _sum: { amountVnd: true },
    }),
    database.landingFeedbackRecord.count(),
  ]);
  const settledRevenueVnd = Number(settled._sum.amountVnd ?? 0);
  if (!Number.isSafeInteger(settledRevenueVnd) || settledRevenueVnd < 0) {
    throw new Error('LOCAL_PLATFORM_ADMIN_REVENUE_INVALID');
  }

  return Object.freeze({
    totalUsers,
    paidUsers: paidActors.length,
    activeSubscriptions,
    settledRevenueVnd,
    feedbacks,
  });
}

export async function readConfiguredLocalPlatformAdminMetrics() {
  const environment = localEnvironment();
  const connectionString = localDatabaseUrl(environment);
  const prismaConstructor = await loadPrismaClient();
  const adapter = new PrismaPg({ connectionString });
  const database = new prismaConstructor({ adapter });

  await database.$connect();
  try {
    return await readPlatformAdminMetrics(database);
  } finally {
    await database.$disconnect();
  }
}

async function createRows(client, delegateName, rows) {
  if (rows.length === 0) return;
  const delegate = client[delegateName];
  if (!delegate || typeof delegate.createMany !== 'function') {
    throw new Error(`LOCAL_SEED_DELEGATE_NOT_CREATABLE:${delegateName}`);
  }
  await delegate.createMany({ data: rows, skipDuplicates: true });
}

function fieldsFor(base) {
  return [
    {
      fieldId: ids(base + 1),
      name: 'ngay',
      type: 'DATE',
      nullable: false,
      aliases: ['date'],
      localizedLabels: { vi: 'Ngày', en: 'Date' },
      sensitivity: 'INTERNAL',
      defaultBehavior: 'NONE',
    },
    {
      fieldId: ids(base + 2),
      name: 'so_tien',
      type: 'DECIMAL',
      nullable: false,
      unit: 'VND',
      semanticRole: 'MEASURE',
      aliases: ['amount'],
      localizedLabels: { vi: 'Số tiền', en: 'Amount' },
      sensitivity: 'INTERNAL',
      defaultBehavior: 'NONE',
    },
    {
      fieldId: ids(base + 3),
      name: 'danh_muc',
      type: 'TEXT',
      nullable: false,
      semanticRole: 'DIMENSION',
      aliases: ['category'],
      localizedLabels: { vi: 'Danh mục', en: 'Category' },
      sensitivity: 'INTERNAL',
      defaultBehavior: 'NONE',
    },
  ];
}

function mappingSteps(fields) {
  return [
    {
      sourceFieldId: fields[0].fieldId,
      targetFieldId: fields[0].fieldId,
      transform: 'PARSE_DATE',
    },
    {
      sourceFieldId: fields[1].fieldId,
      targetFieldId: fields[1].fieldId,
      transform: 'PARSE_DECIMAL',
    },
    {
      sourceFieldId: fields[2].fieldId,
      targetFieldId: fields[2].fieldId,
      transform: 'TRIM',
    },
  ];
}

function ruleSet(base, fields, includeWarning = false) {
  return [
    {
      ruleId: ids(base + 1),
      fieldId: fields[0].fieldId,
      kind: 'TYPE',
      severity: 'ERROR',
      parameters: { expectedType: 'DATE' },
    },
    {
      ruleId: ids(base + 2),
      fieldId: fields[1].fieldId,
      kind: 'TYPE',
      severity: 'ERROR',
      parameters: { expectedType: 'DECIMAL' },
    },
    {
      ruleId: ids(base + 3),
      fieldId: fields[2].fieldId,
      kind: 'REQUIRED',
      severity: 'ERROR',
      parameters: {},
    },
    ...(includeWarning
      ? [
          {
            ruleId: ids(base + 4),
            fieldId: fields[2].fieldId,
            kind: 'UNIQUE',
            severity: 'WARNING',
            parameters: {},
          },
        ]
      : []),
  ];
}

function scopedRow(scope, values) {
  return { ...scope, ...values };
}

function fixtureDefinitions() {
  return [
    {
      key: 'expenseCsv',
      fileName: 'synthetic-vi-expenses.csv',
      mediaType: 'text/csv',
      artifactId: ID.expenseArtifact,
      versionId: ID.expenseArtifactVersion,
      placementId: ID.expensePlacement,
      inboxId: ID.expenseInbox,
      sourceKind: 'FILE',
      status: 'ACTIVE',
      scanState: 'CLEAN',
      inboxState: 'NEEDS_REVIEW',
      priority: 'HIGH',
      labels: ['seed', 'csv', 'synthetic'],
      idempotencyKey: 'local-seed-expense-csv',
    },
    {
      key: 'workbook',
      fileName: 'synthetic-vi-expenses.xlsx',
      mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      artifactId: ID.workbookArtifact,
      versionId: ID.workbookArtifactVersion,
      placementId: ID.workbookPlacement,
      inboxId: ID.workbookInbox,
      sourceKind: 'FILE',
      status: 'ACTIVE',
      scanState: 'CLEAN',
      inboxState: 'NEEDS_REVIEW',
      priority: 'NORMAL',
      labels: ['seed', 'xlsx', 'synthetic'],
      idempotencyKey: 'local-seed-expense-xlsx',
    },
    {
      key: 'mismatch',
      fileName: 'synthetic-mismatch.csv',
      mediaType: 'text/csv',
      artifactId: ID.mismatchArtifact,
      versionId: ID.mismatchArtifactVersion,
      placementId: ID.mismatchPlacement,
      inboxId: ID.mismatchInbox,
      sourceKind: 'FILE',
      status: 'QUARANTINED',
      scanState: 'PENDING',
      inboxState: 'QUARANTINED',
      priority: 'HIGH',
      labels: ['seed', 'quality-blocked', 'synthetic'],
      idempotencyKey: 'local-seed-quality-mismatch',
    },
    {
      key: 'folder',
      fileName: 'synthetic-folder-update.csv',
      mediaType: 'text/csv',
      artifactId: ID.folderArtifact,
      versionId: ID.folderArtifactVersion,
      placementId: ID.folderPlacement,
      inboxId: ID.folderInbox,
      sourceKind: 'FOLDER',
      status: 'ACTIVE',
      scanState: 'CLEAN',
      inboxState: 'NEEDS_REVIEW',
      priority: 'NORMAL',
      labels: ['seed', 'folder-sync', 'synthetic'],
      idempotencyKey: 'local-seed-folder-update',
    },
    {
      key: 'receipt',
      fileName: 'synthetic-receipt.png',
      mediaType: 'image/png',
      artifactId: ID.receiptArtifact,
      versionId: ID.receiptArtifactVersion,
      placementId: ID.receiptPlacement,
      inboxId: ID.receiptInbox,
      sourceKind: 'CAPTURE',
      status: 'ACTIVE',
      scanState: 'CLEAN',
      inboxState: 'NEW',
      priority: 'NORMAL',
      labels: ['seed', 'receipt', 'synthetic'],
      idempotencyKey: 'local-seed-receipt',
    },
  ];
}

function buildFixtureRows() {
  const metadata = new Map();
  const artifacts = [];
  const placements = [];
  const inbox = [];
  for (const definition of fixtureDefinitions()) {
    const bytes = fixtureBytes(definition.fileName);
    const contentSha256 = createHash('sha256').update(bytes).digest('hex');
    const info = Object.freeze({ ...definition, bytes, contentSha256, byteSize: bytes.byteLength });
    metadata.set(definition.key, info);
    artifacts.push(
      scopedRow(workspaceScope, {
        id: definition.versionId,
        artifactId: definition.artifactId,
        sourceKind: definition.sourceKind,
        dataMode: 'Hybrid',
        contentSha256,
        byteSize: BigInt(bytes.byteLength),
        mediaType: definition.mediaType,
        displayName: definition.fileName,
        createdAt: minutesBefore(13_000),
        status: definition.status,
        scanState: definition.scanState,
      }),
    );
    placements.push(
      scopedRow(workspaceScope, {
        id: definition.placementId,
        artifactVersionId: definition.versionId,
        kind: 'CLOUD',
        opaqueReference: `local-${definition.versionId}`,
        contentSha256,
        payloadClass: 'ORIGINAL_CONTENT',
        available: true,
        revision: 1,
        createdAt: minutesBefore(13_000),
        updatedAt: minutesBefore(13_000),
      }),
    );
    inbox.push(
      scopedRow(workspaceScope, {
        id: definition.inboxId,
        idempotencyKey: definition.idempotencyKey,
        artifactVersionId: definition.versionId,
        state: definition.inboxState,
        assigneeId: definition.inboxState === 'NEW' ? null : ID.owner,
        labels: definition.labels,
        priority: definition.priority,
        dueAt: definition.inboxState === 'NEW' ? null : minutesAfter(1_440),
        createdAt: minutesBefore(12_900),
        revision: 1,
      }),
    );
  }
  return Object.freeze({ metadata, artifacts, placements, inbox });
}

async function uploadFixtures(environment, fixtures) {
  const objectStore = localObjectStore(environment);
  const client = new S3Client({
    endpoint: objectStore.endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: objectStore.accessKeyId,
      secretAccessKey: objectStore.secretAccessKey,
    },
  });
  for (const definition of fixtures) {
    const objectKey = `local/web-intake/${ID.organization}/${ID.workspace}/${definition.versionId}`;
    await client.send(
      new PutObjectCommand({
        Bucket: objectStore.bucket,
        Key: objectKey,
        Body: definition.bytes,
        ContentLength: definition.byteSize,
        ContentType: definition.mediaType,
        ChecksumSHA256: Buffer.from(definition.contentSha256, 'hex').toString('base64'),
      }),
    );
  }
}

function buildDatasetRows(metadata) {
  const expenseFields = fieldsFor(1_000);
  const folderFields = fieldsFor(1_200);
  const restrictedFields = fieldsFor(1_400);
  const expenseMappingSteps = mappingSteps(expenseFields);
  const folderMappingSteps = mappingSteps(folderFields);
  const restrictedMappingSteps = mappingSteps(restrictedFields);
  const expenseRules = ruleSet(1_050, expenseFields, true);
  const folderRules = ruleSet(1_250, folderFields);
  const restrictedRules = ruleSet(1_450, restrictedFields);
  const createdAt = minutesBefore(12_000);
  const publishedAt = minutesBefore(11_900);
  const qualityFinding = {
    findingId: ids(1_480),
    ruleId: restrictedRules[0].ruleId,
    severity: 'ERROR',
    messageCode: 'INVALID_DATE_VALUE',
    occurrenceCount: 1,
    evidenceIds: [ID.expenseEvidence],
    detailHash: digest('synthetic-mismatch-invalid-date'),
    subject: {
      type: 'ROW',
      keyHash: digest('synthetic-mismatch-row-2'),
      fieldId: restrictedFields[0].fieldId,
    },
    actual: { kind: 'INVALID', value: 'REDACTED' },
    expected: { kind: 'DATE' },
  };

  const definitions = [
    scopedRow(projectScope, {
      id: ID.expenseSchema,
      datasetId: ID.expenseDataset,
      schemaVersion: 1,
      name: 'Chi phí vận hành',
      fields: expenseFields,
      status: 'PUBLISHED',
      createdAt,
      publishedAt,
      revision: 1,
      canonicalHash: digest(expenseFields),
    }),
    scopedRow(projectScope, {
      id: ID.folderSchema,
      datasetId: ID.folderDataset,
      schemaVersion: 1,
      name: 'Cập nhật chi phí từ thư mục',
      fields: folderFields,
      status: 'PUBLISHED',
      createdAt,
      publishedAt,
      revision: 1,
      canonicalHash: digest(folderFields),
    }),
    scopedRow(projectScope, {
      id: ID.restrictedSchema,
      datasetId: ID.restrictedDataset,
      schemaVersion: 1,
      name: 'Nguồn cần kiểm tra',
      fields: restrictedFields,
      status: 'PUBLISHED',
      createdAt,
      publishedAt,
      revision: 1,
      canonicalHash: digest(restrictedFields),
    }),
  ];

  const mappings = [
    scopedRow(projectScope, {
      id: ID.expenseMapping,
      datasetId: ID.expenseDataset,
      sourceSchemaVersionId: ID.expenseSchema,
      targetSchemaVersionId: ID.expenseSchema,
      steps: expenseMappingSteps,
      status: 'PUBLISHED',
      createdAt,
      publishedAt,
      revision: 1,
      canonicalHash: digest(expenseMappingSteps),
    }),
    scopedRow(projectScope, {
      id: ID.folderMapping,
      datasetId: ID.folderDataset,
      sourceSchemaVersionId: ID.folderSchema,
      targetSchemaVersionId: ID.folderSchema,
      steps: folderMappingSteps,
      status: 'PUBLISHED',
      createdAt,
      publishedAt,
      revision: 1,
      canonicalHash: digest(folderMappingSteps),
    }),
    scopedRow(projectScope, {
      id: ID.restrictedMapping,
      datasetId: ID.restrictedDataset,
      sourceSchemaVersionId: ID.restrictedSchema,
      targetSchemaVersionId: ID.restrictedSchema,
      steps: restrictedMappingSteps,
      status: 'PUBLISHED',
      createdAt,
      publishedAt,
      revision: 1,
      canonicalHash: digest(restrictedMappingSteps),
    }),
  ];

  const rules = [
    scopedRow(projectScope, {
      id: ID.expenseRules,
      datasetId: ID.expenseDataset,
      schemaVersionId: ID.expenseSchema,
      rules: expenseRules,
      status: 'PUBLISHED',
      createdAt,
      publishedAt,
      revision: 1,
      canonicalHash: digest(expenseRules),
    }),
    scopedRow(projectScope, {
      id: ID.folderRules,
      datasetId: ID.folderDataset,
      schemaVersionId: ID.folderSchema,
      rules: folderRules,
      status: 'PUBLISHED',
      createdAt,
      publishedAt,
      revision: 1,
      canonicalHash: digest(folderRules),
    }),
    scopedRow(projectScope, {
      id: ID.restrictedRules,
      datasetId: ID.restrictedDataset,
      schemaVersionId: ID.restrictedSchema,
      rules: restrictedRules,
      status: 'PUBLISHED',
      createdAt,
      publishedAt,
      revision: 1,
      canonicalHash: digest(restrictedRules),
    }),
  ];

  const versions = [
    scopedRow(projectScope, {
      id: ID.expenseVersion,
      datasetId: ID.expenseDataset,
      inputArtifactVersionIds: [metadata.get('expenseCsv').versionId],
      schemaVersionId: ID.expenseSchema,
      mappingVersionId: ID.expenseMapping,
      ruleSetVersionId: ID.expenseRules,
      engineBuild: 'databreeze-engine-local-seed-1',
      contentFingerprint: digest(metadata.get('expenseCsv').contentSha256),
      rowCount: BigInt(3),
      qualityState: 'PASS',
      lineageManifestHash: digest('expense-lineage-v1'),
      createdAt: minutesBefore(11_800),
    }),
    scopedRow(projectScope, {
      id: ID.expenseVersionTwo,
      datasetId: ID.expenseDataset,
      inputArtifactVersionIds: [metadata.get('workbook').versionId],
      schemaVersionId: ID.expenseSchema,
      mappingVersionId: ID.expenseMapping,
      ruleSetVersionId: ID.expenseRules,
      engineBuild: 'databreeze-engine-local-seed-1',
      contentFingerprint: digest(metadata.get('workbook').contentSha256),
      rowCount: BigInt(3),
      qualityState: 'PASS_WITH_WARNINGS',
      lineageManifestHash: digest('expense-lineage-v2'),
      createdAt: minutesBefore(10_800),
    }),
    scopedRow(projectScope, {
      id: ID.folderVersion,
      datasetId: ID.folderDataset,
      inputArtifactVersionIds: [metadata.get('folder').versionId],
      schemaVersionId: ID.folderSchema,
      mappingVersionId: ID.folderMapping,
      ruleSetVersionId: ID.folderRules,
      engineBuild: 'databreeze-engine-local-seed-1',
      contentFingerprint: digest(metadata.get('folder').contentSha256),
      rowCount: BigInt(2),
      qualityState: 'PASS',
      lineageManifestHash: digest('folder-lineage-v1'),
      createdAt: minutesBefore(10_700),
    }),
    scopedRow(projectScope, {
      id: ID.restrictedVersion,
      datasetId: ID.restrictedDataset,
      inputArtifactVersionIds: [metadata.get('mismatch').versionId],
      schemaVersionId: ID.restrictedSchema,
      mappingVersionId: ID.restrictedMapping,
      ruleSetVersionId: ID.restrictedRules,
      engineBuild: 'databreeze-engine-local-seed-1',
      contentFingerprint: digest(metadata.get('mismatch').contentSha256),
      rowCount: BigInt(2),
      qualityState: 'BLOCKED',
      lineageManifestHash: digest('restricted-lineage-v1'),
      createdAt: minutesBefore(10_600),
    }),
  ];

  const quality = [
    scopedRow(projectScope, {
      id: ID.expenseQuality,
      datasetId: ID.expenseDataset,
      datasetVersionId: ID.expenseVersion,
      ruleSetVersionId: ID.expenseRules,
      profileFingerprint: digest('expense-profile-v1'),
      rowCountScanned: BigInt(3),
      qualityState: 'PASS',
      findings: [],
      resultFingerprint: digest('expense-quality-v1'),
      createdAt: minutesBefore(11_700),
    }),
    scopedRow(projectScope, {
      id: ID.expenseQualityTwo,
      datasetId: ID.expenseDataset,
      datasetVersionId: ID.expenseVersionTwo,
      ruleSetVersionId: ID.expenseRules,
      profileFingerprint: digest('expense-profile-v2'),
      rowCountScanned: BigInt(3),
      qualityState: 'PASS_WITH_WARNINGS',
      findings: [
        {
          findingId: ids(1_111),
          ruleId: expenseRules[3].ruleId,
          severity: 'WARNING',
          messageCode: 'DUPLICATE_CATEGORY_LABEL',
          occurrenceCount: 1,
          evidenceIds: [ID.expenseEvidence],
          detailHash: digest('expense-warning-v2'),
        },
      ],
      resultFingerprint: digest('expense-quality-v2'),
      createdAt: minutesBefore(10_700),
    }),
    scopedRow(projectScope, {
      id: ID.folderQuality,
      datasetId: ID.folderDataset,
      datasetVersionId: ID.folderVersion,
      ruleSetVersionId: ID.folderRules,
      profileFingerprint: digest('folder-profile-v1'),
      rowCountScanned: BigInt(2),
      qualityState: 'PASS',
      findings: [],
      resultFingerprint: digest('folder-quality-v1'),
      createdAt: minutesBefore(10_600),
    }),
    scopedRow(projectScope, {
      id: ID.restrictedQuality,
      datasetId: ID.restrictedDataset,
      datasetVersionId: ID.restrictedVersion,
      ruleSetVersionId: ID.restrictedRules,
      profileFingerprint: digest('restricted-profile-v1'),
      rowCountScanned: BigInt(2),
      qualityState: 'BLOCKED',
      findings: [qualityFinding],
      resultFingerprint: digest('restricted-quality-v1'),
      createdAt: minutesBefore(10_500),
    }),
  ];

  const profiles = [
    scopedRow(projectScope, {
      id: ID.expenseProfile,
      datasetVersionId: ID.expenseVersion,
      completeness: 'COMPLETE',
      samplingMethod: 'FULL_SCAN',
      samplingSeed: null,
      excludedScopes: [],
      rowCountScanned: BigInt(3),
      rowCountAvailable: BigInt(3),
      maxRows: BigInt(100_000),
      maxBytes: BigInt(10_000_000),
      maxDurationMs: BigInt(30_000),
      profileFingerprint: digest('expense-profile-v1'),
      createdAt: minutesBefore(11_750),
    }),
    scopedRow(projectScope, {
      id: ID.expenseProfileTwo,
      datasetVersionId: ID.expenseVersionTwo,
      completeness: 'COMPLETE',
      samplingMethod: 'FULL_SCAN',
      samplingSeed: null,
      excludedScopes: [],
      rowCountScanned: BigInt(3),
      rowCountAvailable: BigInt(3),
      maxRows: BigInt(100_000),
      maxBytes: BigInt(10_000_000),
      maxDurationMs: BigInt(30_000),
      profileFingerprint: digest('expense-profile-v2'),
      createdAt: minutesBefore(10_750),
    }),
    scopedRow(projectScope, {
      id: ID.folderProfile,
      datasetVersionId: ID.folderVersion,
      completeness: 'COMPLETE',
      samplingMethod: 'FULL_SCAN',
      samplingSeed: null,
      excludedScopes: [],
      rowCountScanned: BigInt(2),
      rowCountAvailable: BigInt(2),
      maxRows: BigInt(100_000),
      maxBytes: BigInt(10_000_000),
      maxDurationMs: BigInt(30_000),
      profileFingerprint: digest('folder-profile-v1'),
      createdAt: minutesBefore(10_650),
    }),
    scopedRow(projectScope, {
      id: ID.restrictedProfile,
      datasetVersionId: ID.restrictedVersion,
      completeness: 'COMPLETE',
      samplingMethod: 'FULL_SCAN',
      samplingSeed: null,
      excludedScopes: [],
      rowCountScanned: BigInt(2),
      rowCountAvailable: BigInt(2),
      maxRows: BigInt(100_000),
      maxBytes: BigInt(10_000_000),
      maxDurationMs: BigInt(30_000),
      profileFingerprint: digest('restricted-profile-v1'),
      createdAt: minutesBefore(10_550),
    }),
  ];

  const exports = [
    scopedRow(projectScope, {
      id: ID.expenseExport,
      datasetId: ID.expenseDataset,
      datasetVersionId: ID.expenseVersionTwo,
      dataMode: 'HYBRID',
      payloadClass: 'GOVERNED_DATA',
      format: 'CSV',
      rowCount: BigInt(3),
      byteSize: BigInt(metadata.get('workbook').byteSize),
      contentSha256: metadata.get('workbook').contentSha256,
      schemaVersionId: ID.expenseSchema,
      mappingVersionId: ID.expenseMapping,
      ruleSetVersionId: ID.expenseRules,
      semanticManifestHash: digest('expense-semantic-manifest'),
      metricManifestHash: digest('expense-metric-manifest'),
      qualityManifestHash: digest('expense-quality-v2'),
      lineageManifestHash: digest('expense-lineage-v2'),
      evidenceManifestHash: digest('expense-evidence-manifest'),
      policyHash: digest('hybrid-internal-policy'),
      qualityState: 'PASS_WITH_WARNINGS',
      approvalState: 'NOT_REQUIRED',
      createdAt: minutesBefore(10_650),
    }),
    scopedRow(projectScope, {
      id: ID.folderExport,
      datasetId: ID.folderDataset,
      datasetVersionId: ID.folderVersion,
      dataMode: 'HYBRID',
      payloadClass: 'GOVERNED_DATA',
      format: 'CSV',
      rowCount: BigInt(2),
      byteSize: BigInt(metadata.get('folder').byteSize),
      contentSha256: metadata.get('folder').contentSha256,
      schemaVersionId: ID.folderSchema,
      mappingVersionId: ID.folderMapping,
      ruleSetVersionId: ID.folderRules,
      semanticManifestHash: digest('folder-semantic-manifest'),
      metricManifestHash: digest('folder-metric-manifest'),
      qualityManifestHash: digest('folder-quality-v1'),
      lineageManifestHash: digest('folder-lineage-v1'),
      evidenceManifestHash: digest('folder-evidence-manifest'),
      policyHash: digest('hybrid-internal-policy'),
      qualityState: 'PASS',
      approvalState: 'NOT_REQUIRED',
      createdAt: minutesBefore(10_550),
    }),
  ];

  return Object.freeze({ definitions, mappings, rules, versions, quality, profiles, exports });
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stableCanonicalHash(parts) {
  const input = JSON.stringify(parts, Object.keys(parts).sort());
  let hashValue = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hashValue ^= input.charCodeAt(index);
    hashValue = Math.imul(hashValue, 16777619);
  }
  return (hashValue >>> 0).toString(16).padStart(8, '0').repeat(8);
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(',')}}`;
}

// JRA descriptors use the domain canonicalizer's UTF-16 key ordering. Keep
// this separate from the legacy fixture hashes above so reseeding does not
// rewrite unrelated immutable evidence rows.
function jraDescriptorCanonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => jraDescriptorCanonicalJson(item)).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${jraDescriptorCanonicalJson(value[key])}`)
    .join(',')}}`;
}

function materializationCacheHash(input) {
  return digest(
    JSON.stringify({
      adapterVersion: input.adapterVersion,
      analysisPlanVersionId: input.analysisPlanVersionId,
      dashboardVersionId: input.dashboardVersionId,
      datasetVersionId: input.datasetVersionId,
      effectivePolicyVersionId: input.effectivePolicyVersionId,
      engineVersion: input.engineVersion,
      locale: input.locale,
      metricVersionId: input.metricVersionId,
      parameterHash: input.parameterHash,
      permissionProjectionVersionId: input.permissionProjectionVersionId,
      semanticVersionId: input.semanticVersionId,
      tenantScope:
        'project|00000000-0000-4000-8000-000000000001|00000000-0000-4000-8000-000000000002|00000000-0000-4000-8000-000000000003',
      timezone: input.timezone,
      widgetId: input.widgetId,
    }),
  );
}

function snapshotInputSelectorHash(versionId, materializationIds) {
  return digest(JSON.stringify({ versionId, mats: [...new Set(materializationIds)].sort() }));
}

function snapshotBaseHash(snapshot) {
  return stableCanonicalHash({
    snapshotId: snapshot.id,
    tenantScope:
      'project|00000000-0000-4000-8000-000000000001|00000000-0000-4000-8000-000000000002|00000000-0000-4000-8000-000000000003',
    dashboardVersionId: snapshot.dashboardVersionId,
    materializationIds: [...snapshot.materializationIds].sort(),
    inputSelectorHash: snapshot.inputSelectorHash,
    permissionProjectionVersionId: snapshot.permissionProjectionVersionId,
    audience: snapshot.audience,
    freshnessState: snapshot.freshnessState,
    evidenceState: snapshot.evidenceState,
    createdAt: snapshot.createdAt,
  });
}

function publicationCanonicalHash(snapshot, bindingProof) {
  return digest(
    canonicalJson({
      baseHash: snapshotBaseHash(snapshot),
      bindingProof: [...bindingProof].sort((left, right) =>
        left.materializationId.localeCompare(right.materializationId),
      ),
    }),
  );
}

function buildDashboardRows(metadata) {
  const planHash = digest('analysis-plan-expense-v2');
  const dashboardHash = digest('dashboard-published-expense-v2');
  const layout = (versionId, parentVersionId, createdAt, title) => ({
    schemaVersion: 1,
    dashboardId: ID.dashboard,
    versionId,
    tenantScope: projectScope,
    ...(parentVersionId ? { parentVersionId } : {}),
    pages: [
      {
        pageId: ID.publishedPage,
        order: 1,
        title: { vi: 'Tổng quan chi phí', en: 'Expense overview' },
        layout: {
          desktop: [
            { widgetId: ID.publishedKpiWidget, x: 0, y: 0, w: 6, h: 4 },
            { widgetId: ID.publishedBarWidget, x: 6, y: 0, w: 6, h: 4 },
          ],
          tablet: [
            { widgetId: ID.publishedKpiWidget, x: 0, y: 0, w: 6, h: 4 },
            { widgetId: ID.publishedBarWidget, x: 0, y: 4, w: 6, h: 4 },
          ],
          mobile: [
            { widgetId: ID.publishedKpiWidget, x: 0, y: 0, w: 4, h: 4 },
            { widgetId: ID.publishedBarWidget, x: 0, y: 4, w: 4, h: 4 },
          ],
        },
      },
    ],
    widgets: [
      {
        widgetId: ID.publishedKpiWidget,
        type: 'KPI',
        pageId: ID.publishedPage,
        binding: {
          analysisPlanVersionId: ID.analysisPlanVersion,
          materializationDefinitionId: ID.kpiMaterialization,
        },
        title: { vi: title, en: 'Total expenses' },
      },
      {
        widgetId: ID.publishedBarWidget,
        type: 'BAR',
        pageId: ID.publishedPage,
        binding: {
          analysisPlanVersionId: ID.analysisPlanVersion,
          materializationDefinitionId: ID.barMaterialization,
        },
        title: { vi: 'Chi phí theo danh mục', en: 'Expenses by category' },
      },
    ],
    filters: [
      { filterId: ID.dashboardFilter, field: 'danh_muc', operator: 'IN', scope: 'DASHBOARD' },
    ],
    datasetBindings: [
      {
        datasetVersionId: ID.expenseVersionTwo,
        semanticVersionId: ID.semanticVersion,
        metricVersionId: ID.metricVersion,
      },
    ],
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh',
    freshnessPolicy: 'ON_CHANGE',
    publicationPolicy: 'REVIEWED',
    canonicalHash: dashboardHash,
    createdAt: createdAt.toISOString(),
  });
  const published = layout(
    ID.publishedDashboardVersion,
    undefined,
    minutesBefore(10_000),
    'Tổng chi phí',
  );
  const draft = layout(
    ID.draftDashboardVersion,
    ID.publishedDashboardVersion,
    minutesBefore(1_200),
    'Tổng chi phí (bản nháp)',
  );
  const planDocument = {
    schemaVersion: 1,
    planId: ID.analysisPlan,
    planVersionId: ID.analysisPlanVersion,
    tenantScope: projectScope,
    datasetVersionId: ID.expenseVersionTwo,
    semanticVersionId: ID.semanticVersion,
    metricVersionId: ID.metricVersion,
    dimensions: ['danh_muc'],
    filters: [{ field: 'year', operator: 'EQ', value: '2026' }],
    timeRange: {
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-12-31T23:59:59.000Z',
    },
    timeGrain: 'MONTH',
    joins: [],
    units: { so_tien: 'VND' },
    parameters: {},
    output: { form: 'TABLE', maxRows: 100 },
    assumptions: ['Synthetic local fixture; values are deterministic.'],
    estimate: { cpuMs: 100, memoryMb: 64 },
    permissionProjectionVersionId: ID.permissionProjection,
    planHash,
    createdAt: minutesBefore(9_900).toISOString(),
  };
  const dependencyEntries = [
    { kind: 'DATASET_VERSION', id: ID.expenseVersionTwo, hash: digest('expense-v2') },
    { kind: 'POLICY_VERSION', id: ID.policyVersion, hash: digest('policy-v1') },
    { kind: 'EVIDENCE_REFERENCE', id: ID.expenseEvidence, hash: digest('expense-evidence') },
  ];
  const dashboardRows = [
    scopedRow(projectScope, {
      id: ID.dashboard,
      titleVi: 'Bảng điều hành chi phí',
      titleEn: 'Expense operations dashboard',
      status: 'PUBLISHED',
      draftVersionId: ID.draftDashboardVersion,
      publishedVersionId: ID.publishedDashboardVersion,
      revision: 2,
      createdAt: minutesBefore(10_000),
      updatedAt: minutesBefore(1_200),
    }),
  ];
  const versionRows = [
    scopedRow(projectScope, {
      id: ID.publishedDashboardVersion,
      dashboardId: ID.dashboard,
      parentVersionId: null,
      layoutGraph: published,
      freshnessPolicy: 'ON_CHANGE',
      publicationPolicy: 'REVIEWED',
      locale: 'vi-VN',
      timezone: 'Asia/Ho_Chi_Minh',
      canonicalHash: dashboardHash,
      createdAt: minutesBefore(10_000),
    }),
    scopedRow(projectScope, {
      id: ID.draftDashboardVersion,
      dashboardId: ID.dashboard,
      parentVersionId: ID.publishedDashboardVersion,
      layoutGraph: draft,
      freshnessPolicy: 'ON_CHANGE',
      publicationPolicy: 'REVIEWED',
      locale: 'vi-VN',
      timezone: 'Asia/Ho_Chi_Minh',
      canonicalHash: digest('dashboard-draft-expense-v2'),
      createdAt: minutesBefore(1_200),
    }),
  ];
  const planRows = [
    scopedRow(projectScope, {
      id: ID.analysisPlanVersion,
      planId: ID.analysisPlan,
      datasetVersionId: ID.expenseVersionTwo,
      semanticVersionId: ID.semanticVersion,
      metricVersionId: ID.metricVersion,
      permissionProjectionVersionId: ID.permissionProjection,
      planDocument,
      planHash,
      createdAt: minutesBefore(9_900),
    }),
  ];
  const dashboardInputSelectorHash = snapshotInputSelectorHash(ID.publishedDashboardVersion, [
    ID.kpiMaterialization,
    ID.barMaterialization,
  ]);
  const dashboardResultEngineVersion = 'databreeze-engine-local-seed-1';
  const dashboardResultHandlerDigest = `sha256:${digest('local-seed-dashboard-handler-v1')}`;
  const dashboardResultSubjectBindings = (widgetId) => ({
    dashboardId: ID.dashboard,
    dashboardVersionId: ID.publishedDashboardVersion,
    widgetId,
    planVersionId: ID.analysisPlanVersion,
    metricVersionId: ID.metricVersion,
    datasetVersionId: ID.expenseVersionTwo,
    permissionProjectionVersionId: ID.permissionProjection,
    policyVersionId: ID.policyVersion,
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh',
    inputSelectorHash: dashboardInputSelectorHash,
    engineVersion: dashboardResultEngineVersion,
    handlerDigest: dashboardResultHandlerDigest,
  });
  const dashboardResultProvenance = (resultCellId) => ({
    resultCellId,
    planVersionId: ID.analysisPlanVersion,
    metricVersionId: ID.metricVersion,
    datasetVersionId: ID.expenseVersionTwo,
    evidenceRefs: [ID.expenseEvidence],
  });
  const dashboardKpiOutput = {
    schemaVersion: 4,
    kind: 'DASHBOARD_WIDGET_RESULT',
    widgetResult: {
      widgetId: ID.publishedKpiWidget,
      resultState: 'READY',
      rows: [
        {
          label: 'Tổng chi phí',
          displayValue: '₫5.090.000',
          numericValue: 5_090_000,
          unit: 'VND',
          provenance: dashboardResultProvenance(ID.widgetCellOne),
        },
      ],
    },
    subjectBindings: dashboardResultSubjectBindings(ID.publishedKpiWidget),
  };
  const dashboardBarOutput = {
    schemaVersion: 4,
    kind: 'DASHBOARD_WIDGET_RESULT',
    widgetResult: {
      widgetId: ID.publishedBarWidget,
      resultState: 'READY',
      rows: [
        {
          label: 'Văn phòng',
          displayValue: '₫3.390.000',
          numericValue: 3_390_000,
          unit: 'VND',
          provenance: dashboardResultProvenance(ID.widgetCellOne),
        },
        {
          label: 'Di chuyển',
          displayValue: '₫780.000',
          numericValue: 780_000,
          unit: 'VND',
          provenance: dashboardResultProvenance(ID.widgetCellTwo),
        },
        {
          label: 'Ăn uống',
          displayValue: '₫920.000',
          numericValue: 920_000,
          unit: 'VND',
          provenance: dashboardResultProvenance(ID.widgetCellThree),
        },
      ],
    },
    subjectBindings: dashboardResultSubjectBindings(ID.publishedBarWidget),
  };
  const outputMetadata = [
    {
      key: 'dashboardKpiResult',
      fileName: 'local-dashboard-kpi-result.json',
      artifactId: ID.dashboardKpiResultArtifact,
      versionId: ID.dashboardKpiResultVersion,
      placementId: ID.dashboardKpiResultPlacement,
      bytes: Buffer.from(JSON.stringify(dashboardKpiOutput), 'utf8'),
    },
    {
      key: 'dashboardBarResult',
      fileName: 'local-dashboard-bar-result.json',
      artifactId: ID.dashboardBarResultArtifact,
      versionId: ID.dashboardBarResultVersion,
      placementId: ID.dashboardBarResultPlacement,
      bytes: Buffer.from(JSON.stringify(dashboardBarOutput), 'utf8'),
    },
  ].map((output) => ({
    ...output,
    contentSha256: sha256Bytes(output.bytes),
    byteSize: output.bytes.byteLength,
    mediaType: 'application/json',
  }));
  const materializationInputs = [
    {
      id: ID.kpiMaterialization,
      widgetId: ID.publishedKpiWidget,
      resultManifestId: ID.kpiResultManifest,
      parameterHash: digest('local-dashboard-kpi-parameters-v1'),
      createdAt: minutesBefore(9_700),
    },
    {
      id: ID.barMaterialization,
      widgetId: ID.publishedBarWidget,
      resultManifestId: ID.barResultManifest,
      parameterHash: digest('local-dashboard-bar-parameters-v1'),
      createdAt: minutesBefore(9_700),
    },
  ];
  const materializationRows = materializationInputs.map((input) => {
    const cacheIdentityHash = materializationCacheHash({
      dashboardVersionId: ID.publishedDashboardVersion,
      widgetId: input.widgetId,
      analysisPlanVersionId: ID.analysisPlanVersion,
      datasetVersionId: ID.expenseVersionTwo,
      semanticVersionId: ID.semanticVersion,
      metricVersionId: ID.metricVersion,
      permissionProjectionVersionId: ID.permissionProjection,
      parameterHash: input.parameterHash,
      locale: 'vi-VN',
      timezone: 'Asia/Ho_Chi_Minh',
      engineVersion: 'databreeze-engine-local-seed-1',
      adapterVersion: 'local-seed-v1',
      effectivePolicyVersionId: ID.policyVersion,
    });
    return scopedRow(projectScope, {
      id: input.id,
      dashboardVersionId: ID.publishedDashboardVersion,
      widgetId: input.widgetId,
      analysisPlanVersionId: ID.analysisPlanVersion,
      resultManifestId: input.resultManifestId,
      cacheIdentityHash,
      dependencyEntries,
      createdAt: input.createdAt,
    });
  });
  const inputSelectorHash = dashboardInputSelectorHash;
  const bindingProof = materializationInputs.map((input) => ({
    schemaVersion: 1,
    materializationId: input.id,
    tenantScope: projectScope,
    dashboardVersionId: ID.publishedDashboardVersion,
    widgetId: input.widgetId,
    analysisPlanVersionId: ID.analysisPlanVersion,
    datasetVersionId: ID.expenseVersionTwo,
    semanticVersionId: ID.semanticVersion,
    metricVersionId: ID.metricVersion,
    materializationDefinitionId: input.id,
    resultManifestId: input.resultManifestId,
    permissionProjectionVersionId: ID.permissionProjection,
    parameterHash: input.parameterHash,
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh',
    engineVersion: 'databreeze-engine-local-seed-1',
    adapterVersion: 'local-seed-v1',
    effectivePolicyVersionId: ID.policyVersion,
    cacheIdentityHash: materializationRows.find((row) => row.id === input.id).cacheIdentityHash,
    materializationCreatedAt: input.createdAt.toISOString(),
  }));
  const snapshot = {
    id: ID.dashboardSnapshot,
    dashboardVersionId: ID.publishedDashboardVersion,
    materializationIds: [ID.kpiMaterialization, ID.barMaterialization],
    inputSelectorHash,
    permissionProjectionVersionId: ID.permissionProjection,
    audience: 'WORKSPACE_VIEWERS',
    freshnessState: 'FRESH',
    evidenceState: 'AVAILABLE',
    createdAt: minutesBefore(9_600).toISOString(),
  };
  const canonicalHash = publicationCanonicalHash(snapshot, bindingProof);
  const snapshotRows = [
    scopedRow(projectScope, {
      id: snapshot.id,
      dashboardVersionId: snapshot.dashboardVersionId,
      materializationIds: {
        ids: snapshot.materializationIds,
        bindingProofVersion: 1,
        bindingProof,
        inputSelectorHash,
      },
      bindingProof,
      bindingProofVersion: 1,
      inputSelectorHash,
      permissionProjectionVersionId: snapshot.permissionProjectionVersionId,
      audience: snapshot.audience,
      freshnessState: snapshot.freshnessState,
      evidenceState: snapshot.evidenceState,
      evidenceReferenceId: ID.expenseEvidence,
      canonicalHash,
      createdAt: new Date(snapshot.createdAt),
    }),
  ];
  const resultAttemptRows = [
    scopedRow(projectScope, {
      id: ID.kpiResultAttempt,
      jobId: ID.job,
      attemptNumber: 2,
      executorType: 'CLOUD_WORKER',
      executorId: ID.device,
      leaseTokenHash: digest('local-seed-kpi-result-lease'),
      leaseExpiresAt: minutesAfter(42_000),
      state: 'SUCCEEDED',
      createdAt: minutesBefore(9_595),
      heartbeatAt: minutesBefore(9_592),
      startedAt: minutesBefore(9_594),
      finishedAt: minutesBefore(9_590),
      resultManifestHash: digest('local-seed-kpi-result-manifest-v1'),
      revision: 2,
    }),
    scopedRow(projectScope, {
      id: ID.barResultAttempt,
      jobId: ID.job,
      attemptNumber: 3,
      executorType: 'CLOUD_WORKER',
      executorId: ID.device,
      leaseTokenHash: digest('local-seed-bar-result-lease'),
      leaseExpiresAt: minutesAfter(42_000),
      state: 'SUCCEEDED',
      createdAt: minutesBefore(9_595),
      heartbeatAt: minutesBefore(9_592),
      startedAt: minutesBefore(9_594),
      finishedAt: minutesBefore(9_590),
      resultManifestHash: digest('local-seed-bar-result-manifest-v1'),
      revision: 2,
    }),
  ];
  const resultManifestRows = [
    scopedRow(projectScope, {
      id: ID.kpiResultManifest,
      jobId: ID.job,
      attemptId: ID.kpiResultAttempt,
      sourceArtifactVersionIds: [ID.expenseArtifactVersion],
      outputIds: [ID.dashboardKpiResultVersion],
      outputHashes: [outputMetadata[0].contentSha256],
      evidenceCoverage: 'COMPLETE',
      handlerDigest: digest('local-seed-dashboard-handler-v1'),
      engineVersion: 'databreeze-engine-local-seed-1',
      attemptNumber: 2,
      reviewerId: null,
      approvalState: 'NOT_REQUIRED',
      manifestHash: digest('local-seed-kpi-result-manifest-v1'),
      generatedAt: minutesBefore(9_590),
    }),
    scopedRow(projectScope, {
      id: ID.barResultManifest,
      jobId: ID.job,
      attemptId: ID.barResultAttempt,
      sourceArtifactVersionIds: [ID.expenseArtifactVersion],
      outputIds: [ID.dashboardBarResultVersion],
      outputHashes: [outputMetadata[1].contentSha256],
      evidenceCoverage: 'COMPLETE',
      handlerDigest: digest('local-seed-dashboard-handler-v1'),
      engineVersion: 'databreeze-engine-local-seed-1',
      attemptNumber: 3,
      reviewerId: null,
      approvalState: 'NOT_REQUIRED',
      manifestHash: digest('local-seed-bar-result-manifest-v1'),
      generatedAt: minutesBefore(9_590),
    }),
  ];
  const dashboardResultLineageHash = digest('local-seed-dashboard-result-lineage-v1');
  const dashboardFinalizationRows = [
    scopedRow(projectScope, {
      submissionId: ID.kpiFinalization,
      jobId: ID.job,
      attemptId: ID.kpiResultAttempt,
      resultManifestId: ID.kpiResultManifest,
      workerId: ID.device,
      securityEpoch: 1,
      descriptorId: ID.executionDescriptor,
      descriptorHash: digest('local-seed-kpi-descriptor-binding-v1'),
      outputSchemaId: 'dda.dashboard-widget-result.v4',
      engineVersion: dashboardResultEngineVersion,
      sourceArtifactVersionIds: [ID.expenseArtifactVersion],
      sourceLineageHash: dashboardResultLineageHash,
      subjectBindings: dashboardResultSubjectBindings(ID.publishedKpiWidget),
      attestationReferences: [
        {
          attestationId: ID.kpiAttestation,
          outputName: 'dashboardKpiResult',
          artifactVersionId: ID.dashboardKpiResultVersion,
          contentSha256: outputMetadata[0].contentSha256,
          contentLength: outputMetadata[0].byteSize,
          mediaType: outputMetadata[0].mediaType,
        },
      ],
      fingerprint: digest('local-seed-kpi-finalization-v1'),
      resultManifestHash: digest('local-seed-kpi-result-manifest-v1'),
      attemptRevision: 2,
      jobRevision: 2,
      finalizedAt: minutesBefore(9_590),
    }),
    scopedRow(projectScope, {
      submissionId: ID.barFinalization,
      jobId: ID.job,
      attemptId: ID.barResultAttempt,
      resultManifestId: ID.barResultManifest,
      workerId: ID.device,
      securityEpoch: 1,
      descriptorId: ID.executionDescriptor,
      descriptorHash: digest('local-seed-bar-descriptor-binding-v1'),
      outputSchemaId: 'dda.dashboard-widget-result.v4',
      engineVersion: dashboardResultEngineVersion,
      sourceArtifactVersionIds: [ID.expenseArtifactVersion],
      sourceLineageHash: dashboardResultLineageHash,
      subjectBindings: dashboardResultSubjectBindings(ID.publishedBarWidget),
      attestationReferences: [
        {
          attestationId: ID.barAttestation,
          outputName: 'dashboardBarResult',
          artifactVersionId: ID.dashboardBarResultVersion,
          contentSha256: outputMetadata[1].contentSha256,
          contentLength: outputMetadata[1].byteSize,
          mediaType: outputMetadata[1].mediaType,
        },
      ],
      fingerprint: digest('local-seed-bar-finalization-v1'),
      resultManifestHash: digest('local-seed-bar-result-manifest-v1'),
      attemptRevision: 2,
      jobRevision: 2,
      finalizedAt: minutesBefore(9_590),
    }),
  ];
  const dashboardPreparationRows = [
    scopedRow(projectScope, {
      submissionId: ID.kpiFinalization,
      jobId: ID.job,
      attemptId: ID.kpiResultAttempt,
      workerId: ID.device,
      securityEpoch: 1,
      leaseTokenHash: digest('local-seed-kpi-result-lease'),
      expectedRevision: 2,
      descriptorId: ID.executionDescriptor,
      descriptorHash: digest('local-seed-kpi-descriptor-binding-v1'),
      attemptBindingHash: digest('local-seed-kpi-attempt-binding-v1'),
      resultUsageSettlementBindingId: ID.settlementBinding,
      outputSchemaId: 'dda.dashboard-widget-result.v4',
      outputPolicy: [
        {
          kind: 'JSON_RESULT',
          outputName: 'dashboardKpiResult',
          schemaId: 'dda.dashboard-widget-result.v4',
          mediaType: outputMetadata[0].mediaType,
          contentSha256: outputMetadata[0].contentSha256,
          byteLength: outputMetadata[0].byteSize,
          sourceLineageHash: dashboardResultLineageHash,
          objectId: outputMetadata[0].versionId,
          maxBytes: 4 * 1024 * 1024,
          allowedMediaTypes: [outputMetadata[0].mediaType],
          sourceArtifactVersionIds: [ID.expenseArtifactVersion],
          processorVersion: dashboardResultEngineVersion,
          dataMode: 'Hybrid',
          payloadClass: 'APPROVED_DERIVED_RESULT',
        },
      ],
      outputPolicyHash: digest('local-seed-kpi-output-policy-v1'),
      subjectBindings: dashboardResultSubjectBindings(ID.publishedKpiWidget),
      idempotencyKey: 'local-seed-kpi-result-preparation',
      fingerprint: digest('local-seed-kpi-result-preparation-v1'),
      createdAt: minutesBefore(9_590),
    }),
    scopedRow(projectScope, {
      submissionId: ID.barFinalization,
      jobId: ID.job,
      attemptId: ID.barResultAttempt,
      workerId: ID.device,
      securityEpoch: 1,
      leaseTokenHash: digest('local-seed-bar-result-lease'),
      expectedRevision: 2,
      descriptorId: ID.executionDescriptor,
      descriptorHash: digest('local-seed-bar-descriptor-binding-v1'),
      attemptBindingHash: digest('local-seed-bar-attempt-binding-v1'),
      resultUsageSettlementBindingId: ID.settlementBinding,
      outputSchemaId: 'dda.dashboard-widget-result.v4',
      outputPolicy: [
        {
          kind: 'JSON_RESULT',
          outputName: 'dashboardBarResult',
          schemaId: 'dda.dashboard-widget-result.v4',
          mediaType: outputMetadata[1].mediaType,
          contentSha256: outputMetadata[1].contentSha256,
          byteLength: outputMetadata[1].byteSize,
          sourceLineageHash: dashboardResultLineageHash,
          objectId: outputMetadata[1].versionId,
          maxBytes: 4 * 1024 * 1024,
          allowedMediaTypes: [outputMetadata[1].mediaType],
          sourceArtifactVersionIds: [ID.expenseArtifactVersion],
          processorVersion: dashboardResultEngineVersion,
          dataMode: 'Hybrid',
          payloadClass: 'APPROVED_DERIVED_RESULT',
        },
      ],
      outputPolicyHash: digest('local-seed-bar-output-policy-v1'),
      subjectBindings: dashboardResultSubjectBindings(ID.publishedBarWidget),
      idempotencyKey: 'local-seed-bar-result-preparation',
      fingerprint: digest('local-seed-bar-result-preparation-v1'),
      createdAt: minutesBefore(9_590),
    }),
  ];
  const dashboardOutputArtifactRows = outputMetadata.flatMap((output) => [
    scopedRow(projectScope, {
      id: output.versionId,
      artifactId: output.artifactId,
      sourceKind: 'GENERATED',
      dataMode: 'Hybrid',
      contentSha256: output.contentSha256,
      byteSize: BigInt(output.byteSize),
      mediaType: output.mediaType,
      displayName: output.fileName,
      createdAt: minutesBefore(9_580),
      status: 'ACTIVE',
      scanState: 'CLEAN',
    }),
  ]);
  const dashboardOutputPlacementRows = outputMetadata.map((output) =>
    scopedRow(projectScope, {
      id: output.placementId,
      artifactVersionId: output.versionId,
      kind: 'CLOUD',
      opaqueReference: `local-${output.versionId}`,
      contentSha256: output.contentSha256,
      payloadClass: 'APPROVED_DERIVED_RESULT',
      available: true,
      revision: 1,
      createdAt: minutesBefore(9_580),
      updatedAt: minutesBefore(9_580),
    }),
  );
  const refreshStateRows = [
    scopedRow(projectScope, {
      id: ID.refreshState,
      dashboardId: ID.dashboard,
      freshnessPolicy: 'ON_CHANGE',
      lastSnapshotId: ID.dashboardSnapshot,
      lastJobId: ID.job,
      status: 'CURRENT',
      reasonCode: null,
      updatedAt: minutesBefore(9_500),
    }),
  ];
  const refreshExecutionRows = [
    scopedRow(projectScope, {
      id: ID.refreshExecution,
      dashboardId: ID.dashboard,
      dashboardVersionId: ID.publishedDashboardVersion,
      permissionProjectionVersionId: ID.permissionProjection,
      datasetVersionId: ID.expenseVersionTwo,
      definitionIds: [ID.kpiMaterialization, ID.barMaterialization],
      inputSelectorHash,
      sourceEventIds: [ID.refreshEvent],
      clientRequestIds: ['local-seed-refresh-request'],
      folderReplayKeys: [],
      state: 'COMMITTED',
      revision: 2,
      openKey: null,
      leaseId: null,
      debounceWindowMs: 500,
      openedAtMs: BigInt(minutesBefore(9_600).getTime()),
      updatedAtMs: BigInt(minutesBefore(9_500).getTime()),
      updatedAt: minutesBefore(9_500),
    }),
  ];
  const refreshEventRows = [
    scopedRow(projectScope, {
      eventId: ID.refreshEvent,
      sequence: BigInt(1),
      dashboardId: ID.dashboard,
      snapshotId: ID.dashboardSnapshot,
      freshnessState: 'FRESH',
      eventKind: 'SNAPSHOT_COMMITTED',
      metadata: { source: 'LOCAL_SEED', reason: 'INITIAL_SNAPSHOT' },
      occurredAt: minutesBefore(9_500),
      correlationId: ID.refreshCorrelation,
      authorizationEpoch: 1,
      eventHash: digest('refresh-event-expense-v2'),
      createdAt: minutesBefore(9_500),
    }),
  ];
  const refreshCorrelationRows = [
    scopedRow(projectScope, {
      eventId: ID.refreshEvent,
      dashboardId: ID.dashboard,
      snapshotId: ID.dashboardSnapshot,
      freshnessState: 'FRESH',
      occurredAt: minutesBefore(9_500),
      eventHash: digest('refresh-event-expense-v2'),
    }),
  ];
  return Object.freeze({
    dashboardRows,
    versionRows,
    planRows,
    materializationRows,
    snapshotRows,
    dashboardOutputArtifactRows,
    dashboardOutputPlacementRows,
    dashboardOutputMetadata: outputMetadata,
    resultAttemptRows,
    resultManifestRows,
    dashboardPreparationRows,
    dashboardFinalizationRows,
    refreshStateRows,
    refreshExecutionRows,
    refreshEventRows,
    refreshCorrelationRows,
    published,
    draft,
    planDocument,
    metadata,
  });
}

export function buildConversationAndNotifications() {
  const messages = [
    scopedRow(projectScope, {
      id: ID.conversationMessageOne,
      conversationId: ID.conversation,
      sequence: 1,
      idempotencyKey: 'local-seed-message-1',
      requestFingerprint: digest('local-seed-message-1'),
      role: 'USER',
      text: 'Tổng chi phí tháng 1 theo danh mục là bao nhiêu?',
      textDigest: digest('Tổng chi phí tháng 1 theo danh mục là bao nhiêu?'),
      textLength: 'Tổng chi phí tháng 1 theo danh mục là bao nhiêu?'.length,
      datasetVersionId: ID.expenseVersionTwo,
      createdAt: minutesBefore(8_000),
    }),
    scopedRow(projectScope, {
      id: ID.conversationMessageTwo,
      conversationId: ID.conversation,
      sequence: 2,
      idempotencyKey: 'local-seed-message-2',
      requestFingerprint: digest('local-seed-message-2'),
      role: 'AGENT',
      text: 'Tôi đã lập kế hoạch phân tích theo danh mục và giữ lại bằng chứng từ phiên bản dữ liệu đã duyệt.',
      textDigest: digest(
        'Tôi đã lập kế hoạch phân tích theo danh mục và giữ lại bằng chứng từ phiên bản dữ liệu đã duyệt.',
      ),
      textLength:
        'Tôi đã lập kế hoạch phân tích theo danh mục và giữ lại bằng chứng từ phiên bản dữ liệu đã duyệt.'
          .length,
      datasetVersionId: ID.expenseVersionTwo,
      createdAt: minutesBefore(7_990),
    }),
    scopedRow(projectScope, {
      id: ID.conversationMessageThree,
      conversationId: ID.conversation,
      sequence: 3,
      idempotencyKey: 'local-seed-message-3',
      requestFingerprint: digest('local-seed-message-3'),
      role: 'SYSTEM',
      text: 'Phiên bản nguồn đã chuyển từ 1 sang 2; dashboard có thể làm mới theo chính sách ON_CHANGE.',
      textDigest: digest(
        'Phiên bản nguồn đã chuyển từ 1 sang 2; dashboard có thể làm mới theo chính sách ON_CHANGE.',
      ),
      textLength:
        'Phiên bản nguồn đã chuyển từ 1 sang 2; dashboard có thể làm mới theo chính sách ON_CHANGE.'
          .length,
      datasetVersionId: ID.expenseVersionTwo,
      createdAt: minutesBefore(7_980),
    }),
  ];
  const conversationRows = [
    scopedRow(projectScope, {
      id: ID.conversation,
      title: 'Phân tích chi phí vận hành',
      activeDatasetIds: [ID.expenseDataset],
      activeDatasetVersionIds: { [ID.expenseDataset]: ID.expenseVersionTwo },
      dashboardId: ID.dashboard,
      filterContext: JSON.stringify({ danh_muc: ['an_uong', 'di_lai', 'van_phong'] }),
      retentionState: 'ACTIVE',
      retentionHold: false,
      nextSequence: 4,
      revision: 3,
      createIdempotencyScopeKey: `workspace:${ID.organization}:${ID.workspace}`,
      createIdempotencyKey: 'local-seed-conversation',
      createRequestFingerprint: digest('local-seed-conversation'),
      createdAt: minutesBefore(8_100),
      updatedAt: minutesBefore(7_980),
    }),
  ];
  const contextEventRows = [
    scopedRow(projectScope, {
      id: ID.conversationContextEvent,
      conversationId: ID.conversation,
      sequence: 1,
      datasetId: ID.expenseDataset,
      idempotencyScopeKey: `conversation:${ID.conversation}`,
      idempotencyKey: 'local-seed-context-advance',
      requestFingerprint: digest('local-seed-context-advance'),
      kind: 'DATASET_VERSION_ADVANCED',
      beforeVersionId: ID.expenseVersion,
      afterVersionId: ID.expenseVersionTwo,
      occurredAt: minutesBefore(7_990),
      createdAt: minutesBefore(7_990),
    }),
  ];
  const summaryRows = [
    {
      conversationId: ID.conversation,
      ...projectScope,
      text: 'Đang theo dõi chi phí vận hành phiên bản 2 với bằng chứng nguồn và bộ lọc theo danh mục.',
      summaryDigest: digest('conversation-summary-expense-v2'),
      revision: 1,
      updatedAt: minutesBefore(7_970),
    },
  ];
  const viewRows = [
    {
      id: ID.namedDashboardView,
      organizationId: ID.organization,
      workspaceId: ID.workspace,
      projectId: ID.project,
      dashboardId: ID.dashboard,
      dashboardVersionId: ID.publishedDashboardVersion,
      name: 'Chi phí văn phòng',
      filterDocument: { danh_muc: ['van_phong'] },
      revision: 1,
      createdAt: minutesBefore(7_500),
      updatedAt: minutesBefore(7_500),
    },
  ];
  const notificationRows = [
    scopedRow(
      { organizationId: ID.organization, workspaceId: ID.workspace },
      {
        id: ID.notification,
        eventId: ID.refreshEvent,
        eventHash: digest('refresh-event-expense-v2'),
        recipientId: ID.owner,
        subjectId: ID.dashboard,
        kind: 'SYNC_FAILED',
        action: 'OPEN_DASHBOARDS',
        labelVi: 'Dashboard chi phí đã có snapshot mới',
        labelEn: 'Expense dashboard has a new snapshot',
        createdAt: minutesBefore(7_400),
        correlationId: ID.refreshCorrelation,
        occurrenceCount: 1,
        firstOccurredAt: minutesBefore(7_400),
        lastOccurredAt: minutesBefore(7_400),
        bundleKey: digest('notification-dashboard-refresh'),
        bundleWindowStart: minutesBefore(7_400),
        state: 'UNREAD',
        revision: 1,
        dismissedAt: null,
      },
    ),
  ];
  const notificationProjectionReceiptRows = [
    {
      id: ID.notificationProjectionReceipt,
      organizationId: ID.organization,
      workspaceId: ID.workspace,
      recipientId: ID.owner,
      eventId: ID.refreshEvent,
      eventHash: digest('refresh-event-expense-v2'),
      notificationId: ID.notification,
      bundleKey: digest('notification-dashboard-refresh'),
      createdAt: minutesBefore(7_400),
    },
  ];
  const notificationStateReceiptRows = [
    {
      id: ID.notificationStateReceipt,
      organizationId: ID.organization,
      workspaceId: ID.workspace,
      recipientId: ID.owner,
      notificationId: ID.notification,
      expectedRevision: 1,
      targetState: 'READ',
      idempotencyKey: 'local-seed-notification-read',
      fingerprint: digest('local-seed-notification-read'),
      resultDocument: { schemaVersion: 3, state: 'READ', revision: 2 },
      createdAt: minutesBefore(7_300),
    },
  ];
  const notificationCheckpointRows = [
    {
      organizationId: ID.organization,
      workspaceId: ID.workspace,
      consumerKey: 'web-owner-notifications',
      lastEventId: ID.refreshEvent,
      lastEventHash: digest('refresh-event-expense-v2'),
      lastOccurredAt: minutesBefore(7_400),
      revision: 1,
      updatedAt: minutesBefore(7_300),
    },
  ];
  return Object.freeze({
    conversationRows,
    messages,
    contextEventRows,
    summaryRows,
    viewRows,
    notificationRows,
    notificationProjectionReceiptRows,
    notificationStateReceiptRows,
    notificationCheckpointRows,
  });
}

async function main() {
  const argumentsSet = new Set(process.argv.slice(2));
  if (argumentsSet.has('--help')) {
    console.log('Usage: pnpm seed:local [--skip-objects]');
    console.log('  --skip-objects  Seed metadata without uploading fixture bytes to MinIO');
    return;
  }
  const skipObjects = argumentsSet.has('--skip-objects');
  const environment = localEnvironment();
  const connectionString = localDatabaseUrl(environment);
  const prismaConstructor = await loadPrismaClient();
  const adapter = new PrismaPg({ connectionString });
  const database = new prismaConstructor({ adapter });
  const fixtures = buildFixtureRows();
  const metadata = fixtures.metadata;
  const platformAnalytics = buildPlatformAnalyticsRows();
  const placements = skipObjects
    ? fixtures.placements.map((placement) => ({ ...placement, available: false }))
    : fixtures.placements;

  const password =
    environment.DATABREEZE_LOCAL_SEED_PASSWORD?.trim() ||
    `DataBreeze-${randomBytes(18).toString('base64url')}`;
  if (password.length < 12) throw new Error('LOCAL_SEED_PASSWORD_TOO_SHORT');
  const workerBearer =
    environment.DATABREEZE_LOCAL_WORKER_BEARER?.trim() ||
    'databreeze-local-worker-bearer-change-me';
  if (workerBearer.length < 16 || /[\p{Cc}\s]/u.test(workerBearer))
    throw new Error('LOCAL_WORKER_BEARER_INVALID');
  const encodedPassword = await hash(password, PASSWORD_HASH_OPTIONS);
  const datasets = buildDatasetRows(metadata);
  const dashboard = buildDashboardRows(metadata);
  if (!skipObjects) {
    console.log('Uploading synthetic fixture bytes to local MinIO...');
    await uploadFixtures(environment, [...metadata.values(), ...dashboard.dashboardOutputMetadata]);
  }
  const conversations = buildConversationAndNotifications();
  const policyCanonicalInput = {
    schemaVersion: 1,
    policyId: ID.policy,
    policyVersionId: ID.policyVersion,
    organizationId: ID.organization,
    workspaceId: ID.workspace,
    revision: 1,
    mode: 'HYBRID',
    allowedPayloadClasses: {
      PUBLIC: ['CONTROL_METADATA', 'APPROVED_DERIVED_RESULT'],
      INTERNAL: ['CONTROL_METADATA', 'APPROVED_DERIVED_RESULT', 'ORIGINAL_CONTENT'],
      CONFIDENTIAL: ['CONTROL_METADATA'],
      RESTRICTED: ['CONTROL_METADATA'],
    },
    allowedPlacementKinds: ['LOCAL', 'CLOUD'],
    allowedExecutorClasses: ['DESKTOP', 'CLOUD'],
    allowedDestinationClasses: ['WEB', 'DESKTOP'],
    publishedAt: minutesBefore(13_100).toISOString(),
  };
  const policyHash = digest(policyCanonicalInput);
  const actionHandlerHash = digest('local-seed-analysis-handler');
  const usageScopeKey = `project:${ID.organization}:${ID.workspace}:${ID.project}`;
  const workspaceEntitlementScopeKey = `workspace:${ID.organization}:${ID.workspace}`;
  // CRF's canonical scopeKey always has four colon-delimited components;
  // the workspace form therefore ends with the empty project component.
  const reportWorkspaceScopeKey = `workspace:${ID.organization}:${ID.workspace}:`;
  const executionDescriptorHash = digest('local-seed-execution-descriptor');
  // AUD accepts only the governed action vocabulary and summary keys. Build
  // the seed digest from the same canonical event shape the repository
  // verifies after restart, so the audit page is a real immutable chain.
  const auditCanonicalRecord = JSON.stringify({
    schemaVersion: 1,
    eventId: ID.auditEvent,
    action: 'job.completed',
    tenantScope: projectScope,
    actor: { actorType: 'USER', actorId: ID.owner },
    entityType: 'DASHBOARD',
    entityId: ID.dashboard,
    entityRevision: 2,
    sequence: 1,
    occurredAt: minutesBefore(6_400).toISOString(),
    correlationId: ID.refreshCorrelation,
    idempotencyKey: 'local-seed-audit-event',
    summary: { resourceType: 'DASHBOARD', status: 'COMPLETED' },
    previousDigest: null,
  });
  const auditDigest = createHash('sha256').update(auditCanonicalRecord, 'utf8').digest('base64url');
  const auditRootDigest = createHash('sha256').update(auditDigest, 'utf8').digest('base64url');
  const widgetHandlerHash = '4418b6da9b59b7d3c7694599c2ffd4b5af89c6f097e69fc5160941842200e272';
  const widgetActionType = 'dda.materialize.widget-result';
  const widgetInputSchemaId = 'dda.dashboard-widget-result-parameters.v1';
  const widgetOutputSchemaId = 'dda.dashboard-widget-result.v4';
  const widgetInputManifestHash = digest({
    objectId: ID.expenseArtifactVersion,
    contentSha256: metadata.get('expenseCsv').contentSha256,
    byteSize: metadata.get('expenseCsv').byteSize,
  });
  const widgetParameters = {
    engineVersion: '0.1.0',
    dataMode: 'Hybrid',
    payloadClass: 'APPROVED_DERIVED_RESULT',
    dashboardId: ID.dashboard,
    dashboardVersionId: ID.publishedDashboardVersion,
    widgetId: ID.publishedBarWidget,
    planVersionId: ID.analysisPlanVersion,
    metricVersionId: ID.metricVersion,
    datasetVersionId: ID.expenseVersionTwo,
    permissionProjectionVersionId: ID.permissionProjection,
    policyVersionId: ID.policyVersion,
    inputSelectorHash: dashboard.snapshotRows[0].inputSelectorHash,
    timezone: 'Asia/Ho_Chi_Minh',
    unit: 'VND',
    resultState: 'READY',
    maximumRows: 100,
    labelColumn: 'danh_muc',
    valueColumn: 'so_tien',
    cellIds: [ID.widgetCellOne, ID.widgetCellTwo, ID.widgetCellThree, ID.widgetCellFour],
    evidenceRefs: [ID.expenseEvidence],
  };
  const widgetOutputObjectId = ID.widgetOutputObject;
  // Keep the executable local job within the descriptor's 24-hour lifetime
  // regardless of when the developer reloads the seed. The rest of the
  // fixture remains deterministic; this job is intentionally runnable now.
  const widgetCreatedAt = new Date(Math.max(NOW.getTime(), Date.now()));
  const widgetDeadline = new Date(widgetCreatedAt.getTime() + 12 * 60 * 60 * 1_000);
  const widgetDescriptorInput = {
    schemaVersion: 1,
    descriptorId: ID.widgetDescriptor,
    resultUsageSettlementBindingId: ID.widgetSettlementBinding,
    // The domain normalizes workspace scopes by omitting projectId; hash the
    // normalized shape rather than the database convenience object (which
    // carries projectId: null).
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ID.organization,
      workspaceId: ID.workspace,
    },
    jobId: ID.widgetJob,
    stepId: ID.analysisPlanVersion,
    action: {
      type: widgetActionType,
      version: 1,
      inputSchemaId: widgetInputSchemaId,
      outputSchemaId: widgetOutputSchemaId,
      handlerDigest: widgetHandlerHash,
      requiredCapabilities: ['metadata.read'],
      sideEffectClass: 'NONE',
      riskClass: 'READ_ONLY',
    },
    inputObjectIds: [ID.expenseArtifactVersion],
    inputManifestHash: widgetInputManifestHash,
    parameters: widgetParameters,
    outputPolicy: {
      outputObjectId: widgetOutputObjectId,
      maxBytes: 4 * 1024 * 1024,
      mediaType: 'application/json',
    },
    deadline: widgetDeadline.toISOString(),
    locale: 'vi-VN',
    createdAt: widgetCreatedAt.toISOString(),
  };
  const widgetDescriptorCanonicalHash = createHash('sha256')
    .update(jraDescriptorCanonicalJson(widgetDescriptorInput), 'utf8')
    .digest('hex');

  await database.$connect();
  try {
    await database.$transaction(
      async (transaction) => {
        // A prior local fixture used immutable descriptor 426 with an
        // already-expired lifetime. Retire its queued job if it is still
        // present; never mutate the immutable descriptor itself.
        await transaction.jobRecord.updateMany({
          where: {
            id: {
              in: [
                ids(421),
                ids(431),
                ids(441),
                ids(451),
                ids(461),
                ids(471),
                ids(481),
                ids(491),
                ids(501),
                ids(511),
                ids(521),
                ids(531),
                ids(541),
                ids(551),
                ids(571),
                ids(577),
                ids(584),
              ],
            },
            state: { in: ['QUEUED', 'DISPATCHED', 'RUNNING'] },
          },
          data: { state: 'CANCELLED', revision: { increment: 1 }, finishedAt: widgetCreatedAt },
        });
        await upsertRows(transaction, 'organizationIdentity', [
          {
            id: ID.organization,
            name: 'DataBreeze Local QA',
            personal: true,
            status: 'ACTIVE',
            createdAt: minutesBefore(13_500),
            updatedAt: minutesBefore(13_500),
          },
          ...platformAnalytics.organizations,
        ]);
        await upsertRows(transaction, 'userIdentity', [
          {
            id: ID.owner,
            email: 'owner@databreeze.local',
            displayName: 'Nguyễn Minh Anh',
            locale: 'vi-VN',
            status: 'ACTIVE',
            securityEpoch: 1,
            mfaReenrollmentRequired: false,
            createdAt: minutesBefore(13_400),
            updatedAt: minutesBefore(13_400),
          },
          {
            id: ID.admin,
            email: 'admin@databreeze.local',
            displayName: 'DataBreeze Local Admin',
            locale: 'vi-VN',
            status: 'ACTIVE',
            securityEpoch: 1,
            mfaReenrollmentRequired: false,
            createdAt: minutesBefore(13_395),
            updatedAt: minutesBefore(13_395),
          },
          {
            id: ID.platformOwner,
            email: 'platform-owner@databreeze.local',
            displayName: 'DataBreeze Platform Owner',
            locale: 'vi-VN',
            status: 'ACTIVE',
            securityEpoch: 1,
            mfaReenrollmentRequired: false,
            createdAt: minutesBefore(90),
            updatedAt: minutesBefore(90),
          },
          {
            id: ID.analyst,
            email: 'analyst@databreeze.local',
            displayName: 'Trần An',
            locale: 'vi-VN',
            status: 'ACTIVE',
            securityEpoch: 1,
            mfaReenrollmentRequired: false,
            createdAt: minutesBefore(13_390),
            updatedAt: minutesBefore(13_390),
          },
          {
            id: ID.viewer,
            email: 'viewer@databreeze.local',
            displayName: 'Lê Linh',
            locale: 'en',
            status: 'ACTIVE',
            securityEpoch: 1,
            mfaReenrollmentRequired: false,
            createdAt: minutesBefore(13_380),
            updatedAt: minutesBefore(13_380),
          },
          ...platformAnalytics.users.map((user) => {
            const { organizationId, ...identity } = user;
            void organizationId;
            return identity;
          }),
        ]);
        await upsertRows(transaction, 'serviceAccountRecord', [
          {
            id: ID.workerServiceAccount,
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            name: 'Local execution worker',
            permissions: ['job.execution.run'],
            status: 'ACTIVE',
            secretDigest: digest(workerBearer),
            secretVersion: 1,
            secretIssuedAt: minutesBefore(13_300),
            // The domain caps service-account lifetime at 365 days. Derive
            // expiry from the issued timestamp rather than from seed NOW so
            // the deterministic fixture remains valid when NOW moves.
            secretExpiresAt: new Date(minutesBefore(13_300).getTime() + 365 * 24 * 60 * 60 * 1_000),
            lastUsedAt: null,
            createdAt: minutesBefore(13_300),
            revokedAt: null,
            revision: 1,
            createdByActorId: ID.owner,
            createIdempotencyKey: null,
            createRequestHash: null,
            createSecretEnvelope: null,
            createIdempotencyExpiresAt: null,
            createAccountSnapshot: null,
          },
        ]);
        await upsertRows(
          transaction,
          'passwordCredential',
          [
            { id: ids(13), userId: ID.owner },
            { id: ids(14), userId: ID.analyst },
            { id: ids(15), userId: ID.viewer },
            { id: ids(17), userId: ID.admin },
            { id: ids(7005), userId: ID.platformOwner },
          ].map(({ id, userId }) => ({
            id,
            userId,
            algorithm: 'argon2id',
            encodedHash: encodedPassword,
            createdAt: minutesBefore(13_300),
            rotatedAt: minutesBefore(13_300),
          })),
          'userId',
        );
        await upsertRows(
          transaction,
          'platformOperatorRecord',
          [
            {
              userId: ID.platformOwner,
              role: 'PLATFORM_OWNER',
              status: 'ACTIVE',
              assignedBy: null,
              assignedAt: minutesBefore(90),
              revokedAt: null,
              revision: 1,
              updatedAt: minutesBefore(90),
            },
          ],
          'userId',
        );
        await upsertRows(transaction, 'landingFeedbackRecord', buildLandingFeedbackRows());
        await upsertRows(transaction, 'deviceDataModePolicyRecord', [
          {
            id: ID.policyVersion,
            policyId: ID.policy,
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            revision: 1,
            mode: 'HYBRID',
            allowedPayloadClasses: policyCanonicalInput.allowedPayloadClasses,
            allowedPlacementKinds: policyCanonicalInput.allowedPlacementKinds,
            allowedExecutorClasses: policyCanonicalInput.allowedExecutorClasses,
            allowedDestinationClasses: policyCanonicalInput.allowedDestinationClasses,
            canonicalHash: policyHash,
            publishedAt: minutesBefore(13_100),
          },
        ]);
        await upsertRows(transaction, 'workspaceDataModePolicyRecord', [
          {
            id: ID.policy,
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            currentVersionId: ID.policyVersion,
            currentVersionHash: policyHash,
            revision: 1,
            createdAt: minutesBefore(13_100),
            updatedAt: minutesBefore(13_100),
          },
        ]);
        await upsertRows(transaction, 'workspacePolicyActivationRecord', [
          {
            id: ID.policyActivation,
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            idempotencyKey: 'local-seed-policy-activation',
            requestHash: digest('local-seed-policy-activation'),
            policySnapshot: policyCanonicalInput,
            aggregateRevision: 1,
            authorizationEpoch: 1,
            createdAt: minutesBefore(13_090),
          },
        ]);
        await upsertRows(transaction, 'workspaceIdentity', [
          {
            id: ID.workspace,
            organizationId: ID.organization,
            name: 'Không gian kiểm thử cục bộ',
            status: 'ACTIVE',
            dataModePolicyId: ID.policy,
            currentDataModePolicyVersionId: ID.policyVersion,
            dataModeProjection: 'HYBRID',
            authorizationEpoch: 1,
            createdAt: minutesBefore(13_300),
            updatedAt: minutesBefore(13_300),
          },
        ]);
        await upsertRows(transaction, 'projectIdentity', [
          {
            id: ID.project,
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            kind: 'INTERNAL',
            name: 'Bảng điều hành chi phí',
            status: 'ACTIVE',
            createdAt: minutesBefore(13_200),
            updatedAt: minutesBefore(13_200),
          },
          {
            id: ID.financeProject,
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            kind: 'CLIENT',
            name: 'Khu vực tài chính hạn chế',
            status: 'ACTIVE',
            createdAt: minutesBefore(13_190),
            updatedAt: minutesBefore(13_190),
          },
        ]);
        await upsertRows(transaction, 'membershipIdentity', [
          {
            id: ID.ownerOrganizationMembership,
            principalType: 'USER',
            principalId: ID.owner,
            scopeType: 'ORGANIZATION',
            organizationId: ID.organization,
            workspaceId: null,
            projectId: null,
            roleId: 'owner',
            status: 'ACTIVE',
            startsAt: minutesBefore(13_400),
            expiresAt: null,
            revision: 1,
            createdAt: minutesBefore(13_400),
            updatedAt: minutesBefore(13_400),
          },
          {
            id: ID.ownerWorkspaceMembership,
            principalType: 'USER',
            principalId: ID.owner,
            scopeType: 'WORKSPACE',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: null,
            roleId: 'owner',
            status: 'ACTIVE',
            startsAt: minutesBefore(13_400),
            expiresAt: null,
            revision: 1,
            createdAt: minutesBefore(13_400),
            updatedAt: minutesBefore(13_400),
          },
          {
            id: ID.ownerProjectMembership,
            principalType: 'USER',
            principalId: ID.owner,
            scopeType: 'PROJECT',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            roleId: 'owner',
            status: 'ACTIVE',
            startsAt: minutesBefore(13_400),
            expiresAt: null,
            revision: 1,
            createdAt: minutesBefore(13_400),
            updatedAt: minutesBefore(13_400),
          },
          {
            id: ID.adminOrganizationMembership,
            principalType: 'USER',
            principalId: ID.admin,
            scopeType: 'ORGANIZATION',
            organizationId: ID.organization,
            workspaceId: null,
            projectId: null,
            roleId: 'owner',
            status: 'ACTIVE',
            startsAt: minutesBefore(13_395),
            expiresAt: null,
            revision: 1,
            createdAt: minutesBefore(13_395),
            updatedAt: minutesBefore(13_395),
          },
          {
            id: ID.adminWorkspaceMembership,
            principalType: 'USER',
            principalId: ID.admin,
            scopeType: 'WORKSPACE',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: null,
            // The customer-facing settings projection deliberately maps only
            // Owner/Editor/Viewer presets. Keep this deterministic fixture
            // inside that public surface while the account remains an
            // organization Owner for management tests.
            roleId: 'analyst',
            status: 'ACTIVE',
            startsAt: minutesBefore(13_395),
            expiresAt: null,
            revision: 1,
            createdAt: minutesBefore(13_395),
            updatedAt: minutesBefore(13_395),
          },
          {
            id: ID.adminProjectMembership,
            principalType: 'USER',
            principalId: ID.admin,
            scopeType: 'PROJECT',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            roleId: 'analyst',
            status: 'ACTIVE',
            startsAt: minutesBefore(13_395),
            expiresAt: null,
            revision: 1,
            createdAt: minutesBefore(13_395),
            updatedAt: minutesBefore(13_395),
          },
          {
            id: ID.platformOwnerOrganizationMembership,
            principalType: 'USER',
            principalId: ID.platformOwner,
            scopeType: 'ORGANIZATION',
            organizationId: ID.organization,
            workspaceId: null,
            projectId: null,
            roleId: 'owner',
            status: 'ACTIVE',
            startsAt: minutesBefore(90),
            expiresAt: null,
            revision: 1,
            createdAt: minutesBefore(90),
            updatedAt: minutesBefore(90),
          },
          {
            id: ID.platformOwnerWorkspaceMembership,
            principalType: 'USER',
            principalId: ID.platformOwner,
            scopeType: 'WORKSPACE',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: null,
            // Platform operations are granted by platformOperatorRecord; keep
            // the synthetic tenant membership on a customer-visible preset so
            // workspace settings can project every active member safely.
            roleId: 'analyst',
            status: 'ACTIVE',
            startsAt: minutesBefore(90),
            expiresAt: null,
            revision: 1,
            createdAt: minutesBefore(90),
            updatedAt: minutesBefore(90),
          },
          {
            id: ID.platformOwnerProjectMembership,
            principalType: 'USER',
            principalId: ID.platformOwner,
            scopeType: 'PROJECT',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            roleId: 'analyst',
            status: 'ACTIVE',
            startsAt: minutesBefore(90),
            expiresAt: null,
            revision: 1,
            createdAt: minutesBefore(90),
            updatedAt: minutesBefore(90),
          },
          {
            id: ID.analystWorkspaceMembership,
            principalType: 'USER',
            principalId: ID.analyst,
            scopeType: 'WORKSPACE',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: null,
            roleId: 'analyst',
            status: 'ACTIVE',
            startsAt: minutesBefore(13_390),
            expiresAt: null,
            revision: 1,
            createdAt: minutesBefore(13_390),
            updatedAt: minutesBefore(13_390),
          },
          {
            id: ID.analystProjectMembership,
            principalType: 'USER',
            principalId: ID.analyst,
            scopeType: 'PROJECT',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            roleId: 'analyst',
            status: 'ACTIVE',
            startsAt: minutesBefore(13_390),
            expiresAt: null,
            revision: 1,
            createdAt: minutesBefore(13_390),
            updatedAt: minutesBefore(13_390),
          },
          {
            id: ID.viewerWorkspaceMembership,
            principalType: 'USER',
            principalId: ID.viewer,
            scopeType: 'WORKSPACE',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: null,
            roleId: 'viewer',
            status: 'ACTIVE',
            startsAt: minutesBefore(13_380),
            expiresAt: null,
            revision: 1,
            createdAt: minutesBefore(13_380),
            updatedAt: minutesBefore(13_380),
          },
          {
            id: ID.viewerProjectMembership,
            principalType: 'USER',
            principalId: ID.viewer,
            scopeType: 'PROJECT',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            roleId: 'viewer',
            status: 'ACTIVE',
            startsAt: minutesBefore(13_380),
            expiresAt: null,
            revision: 1,
            createdAt: minutesBefore(13_380),
            updatedAt: minutesBefore(13_380),
          },
          ...platformAnalytics.memberships,
        ]);
        await upsertRows(transaction, 'workspaceAgentGrant', [
          {
            id: ids(35),
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            memberId: ID.ownerWorkspaceMembership,
            level: 'APPLY_CONFIRMED_CHANGES',
            revision: 1,
            createdAt: minutesBefore(13_000),
            updatedAt: minutesBefore(13_000),
          },
          {
            id: ids(36),
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            memberId: ID.analystWorkspaceMembership,
            level: 'PROPOSE_CHANGES',
            revision: 1,
            createdAt: minutesBefore(12_990),
            updatedAt: minutesBefore(12_990),
          },
          {
            id: ids(37),
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            memberId: ID.viewerWorkspaceMembership,
            level: 'NONE',
            revision: 1,
            createdAt: minutesBefore(12_980),
            updatedAt: minutesBefore(12_980),
          },
        ]);
        await upsertRows(transaction, 'workspaceDatasetRestriction', [
          {
            id: ids(38),
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            memberId: ID.viewerWorkspaceMembership,
            memberScopeType: 'WORKSPACE',
            deniedDatasetIds: [ID.restrictedDataset],
            revision: 1,
            createdAt: minutesBefore(12_970),
            updatedAt: minutesBefore(12_970),
          },
        ]);
        await upsertRows(transaction, 'deviceIdentity', [
          {
            id: ID.device,
            userId: ID.owner,
            organizationId: ID.organization,
            platform: 'WINDOWS',
            publicKey: 'local-seed-ed25519-public-key',
            keyAlgorithm: 'ED25519',
            installationIdHash: digest('local-seed-installation'),
            status: 'ACTIVE',
            securityEpoch: 1,
            revision: 1,
            enrolledAt: minutesBefore(12_900),
            activatedAt: minutesBefore(12_890),
            revokedAt: null,
          },
        ]);
        await upsertRows(transaction, 'deviceCapabilityRecord', [
          {
            id: ID.deviceCapability,
            deviceId: ID.device,
            organizationId: ID.organization,
            capabilityType: 'ANALYSIS_ENGINE',
            opaqueLocalHandle: 'synthetic-local-engine',
            constraintDigest: digest('local-seed-device-constraint'),
            status: 'ACTIVE',
            reportedAt: minutesBefore(12_800),
            revision: 1,
          },
        ]);
        await upsertRows(transaction, 'deviceGrantRecord', [
          {
            id: ID.deviceGrant,
            deviceId: ID.device,
            scopeType: 'workspace',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: null,
            bindingId: ID.deviceCapability,
            capabilityDigest: digest('local-seed-device-grant'),
            authorizationEpoch: 1,
            effects: { actions: ['ANALYZE'], dataClassifications: ['INTERNAL'] },
            issuedAt: minutesBefore(12_700),
            expiresAt: minutesAfter(43_200),
            status: 'ACTIVE',
            revision: 1,
          },
        ]);
        await upsertRows(transaction, 'artifactVersion', [
          ...fixtures.artifacts,
          ...dashboard.dashboardOutputArtifactRows,
        ]);
        await upsertRows(transaction, 'contentPlacement', [
          ...placements,
          ...dashboard.dashboardOutputPlacementRows,
        ]);
        await upsertRows(transaction, 'inboxItem', fixtures.inbox);
        await upsertRows(transaction, 'evidenceReference', [
          scopedRow(workspaceScope, {
            id: ID.expenseEvidence,
            artifactVersionId: ID.expenseArtifactVersion,
            coordinate: { kind: 'CELL', sheet: 'Sheet1', address: 'B2' },
            sourceState: 'AVAILABLE',
            excerpt: 'Synthetic VND amount from local fixture',
            createdAt: minutesBefore(12_600),
          }),
          scopedRow(workspaceScope, {
            id: ID.receiptEvidence,
            artifactVersionId: ID.receiptArtifactVersion,
            coordinate: { kind: 'PAGE', page: 1, label: 'receipt-summary' },
            sourceState: 'AVAILABLE',
            excerpt: 'Synthetic receipt evidence',
            createdAt: minutesBefore(12_590),
          }),
        ]);
        await upsertRows(transaction, 'artifactLineageRecord', [
          scopedRow(workspaceScope, {
            id: ID.workbookLineage,
            derivedArtifactVersionId: ID.workbookArtifactVersion,
            sourceVersionIds: [ID.expenseArtifactVersion],
            processorVersion: 'local-seed-folder-replay-1',
            recipeVersion: 'folder-replay-v1',
            coordinateLineage: { source: 'synthetic-csv', rows: 'content-free-lineage' },
            createdAt: minutesBefore(12_580),
          }),
        ]);
        await upsertRows(transaction, 'spreadsheetAuditResultRecord', [
          scopedRow(workspaceScope, {
            id: ID.spreadsheetAudit,
            artifactVersionId: ID.workbookArtifactVersion,
            workbookSha256: metadata.get('workbook').contentSha256,
            sheets: [{ name: 'Sheet1', maxRow: 4, maxColumn: 3 }],
            findings: [{ code: 'NO_MACROS', severity: 'INFO' }],
            blockedReasons: [],
            processorVersion: 'spreadsheet-audit-local-seed-1',
            createdAt: minutesBefore(12_570),
          }),
        ]);
        await upsertRows(transaction, 'datasetDefinitionRecord', datasets.definitions);
        await upsertRows(transaction, 'mappingDefinitionRecord', datasets.mappings);
        await upsertRows(transaction, 'ruleSetDefinitionRecord', datasets.rules);
        await upsertRows(transaction, 'datasetVersionRecord', datasets.versions);
        await upsertRows(transaction, 'datasetQualityResultRecord', datasets.quality);
        await upsertRows(transaction, 'datasetProfileRecord', datasets.profiles);
        await upsertRows(transaction, 'datasetExportManifestRecord', datasets.exports);
        await upsertRows(transaction, 'ddaDatasetSource', [
          {
            id: ID.expenseSource,
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            dsmDatasetId: ID.expenseDataset,
            iaeArtifactVersionId: ID.expenseArtifactVersion,
            sourceType: 'CSV',
            safeDisplayLabel: 'Chi phí vận hành CSV',
            status: 'ACTIVE',
            health: 'HEALTHY',
            dataMode: 'HYBRID',
            revision: 1,
            createdAt: minutesBefore(12_500),
            updatedAt: minutesBefore(12_500),
          },
          {
            id: ID.workbookSource,
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            dsmDatasetId: ID.expenseDataset,
            iaeArtifactVersionId: ID.workbookArtifactVersion,
            sourceType: 'XLSX',
            safeDisplayLabel: 'Chi phí vận hành Excel',
            status: 'ACTIVE',
            health: 'WARNING',
            dataMode: 'HYBRID',
            revision: 2,
            createdAt: minutesBefore(12_490),
            updatedAt: minutesBefore(12_490),
          },
          {
            id: ID.restrictedSource,
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            dsmDatasetId: ID.restrictedDataset,
            iaeArtifactVersionId: ID.mismatchArtifactVersion,
            sourceType: 'CSV',
            safeDisplayLabel: 'Nguồn cần kiểm tra',
            status: 'QUARANTINED',
            health: 'BLOCKED',
            dataMode: 'HYBRID',
            revision: 1,
            createdAt: minutesBefore(12_480),
            updatedAt: minutesBefore(12_480),
          },
          {
            id: ID.folderSource,
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            dsmDatasetId: ID.folderDataset,
            iaeArtifactVersionId: ID.folderArtifactVersion,
            sourceType: 'CSV',
            safeDisplayLabel: 'Cập nhật từ thư mục',
            status: 'REVIEW',
            health: 'WARNING',
            dataMode: 'HYBRID',
            revision: 1,
            createdAt: minutesBefore(12_470),
            updatedAt: minutesBefore(12_470),
          },
          {
            id: ID.receiptSource,
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            dsmDatasetId: ID.expenseDataset,
            iaeArtifactVersionId: ID.receiptArtifactVersion,
            sourceType: 'RECEIPT',
            safeDisplayLabel: 'Biên lai mẫu',
            status: 'REVIEW',
            health: 'WARNING',
            dataMode: 'HYBRID',
            revision: 1,
            createdAt: minutesBefore(12_460),
            updatedAt: minutesBefore(12_460),
          },
        ]);
        await upsertRows(transaction, 'ddaSourceAssignment', [
          {
            id: ID.folderAssignment,
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            sourceId: ID.folderSource,
            dsmDatasetId: ID.folderDataset,
            status: 'ACTIVE',
            createdAt: minutesBefore(12_450),
            updatedAt: minutesBefore(12_450),
          },
          {
            id: ID.restrictedAssignment,
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            sourceId: ID.restrictedSource,
            dsmDatasetId: ID.restrictedDataset,
            status: 'PENDING_REVIEW',
            createdAt: minutesBefore(12_440),
            updatedAt: minutesBefore(12_440),
          },
        ]);
        await upsertRows(transaction, 'ddaFolderPlacementReview', [
          {
            id: ID.folderPlacementReview,
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            sourceId: ID.folderSource,
            decision: 'APPROVED',
            reasonCode: 'EXPECTED_FOLDER_MISMATCH',
            revision: 1,
            createdAt: minutesBefore(12_430),
            updatedAt: minutesBefore(12_430),
          },
        ]);
        await upsertRows(transaction, 'ddaFolderMoveReceipt', [
          {
            id: ID.folderMoveReceipt,
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            reviewId: ID.folderPlacementReview,
            sourceId: ID.folderSource,
            receiptHash: digest('folder-move-receipt'),
            occurredAt: minutesBefore(12_420),
            createdAt: minutesBefore(12_420),
          },
        ]);
        await upsertRows(transaction, 'typedActionDefinitionRecord', [
          {
            id: ID.typedAction,
            actionType: 'DDA_REFRESH_DASHBOARD',
            version: 1,
            inputSchemaId: 'dda.refresh.request.v1',
            outputSchemaId: 'dda.refresh.result.v1',
            handlerDigest: actionHandlerHash,
            requiredCapabilities: ['analysis.execute'],
            sideEffectClass: 'NONE',
            riskClass: 'READ_ONLY',
            defaultTimeoutSeconds: 60,
            maxAttempts: 3,
            approvalClass: 'NONE',
            createdAt: minutesBefore(12_300),
          },
        ]);
        await upsertRows(transaction, 'typedActionDefinitionRecord', [
          {
            id: ID.widgetAction,
            actionType: widgetActionType,
            version: 1,
            inputSchemaId: widgetInputSchemaId,
            outputSchemaId: widgetOutputSchemaId,
            handlerDigest: widgetHandlerHash,
            requiredCapabilities: ['metadata.read'],
            sideEffectClass: 'NONE',
            riskClass: 'READ_ONLY',
            defaultTimeoutSeconds: 60,
            maxAttempts: 3,
            approvalClass: 'NONE',
            createdAt: widgetCreatedAt,
          },
        ]);
        await upsertRows(transaction, 'paymentOrderRecord', platformAnalytics.paymentOrders);
        await upsertRows(transaction, 'subscriptionRecord', platformAnalytics.subscriptions);
        await upsertRows(transaction, 'invoiceRecord', platformAnalytics.invoices);
        await upsertRows(
          transaction,
          'entitlementPlanRecord',
          [
            {
              planCode: 'development',
              schemaVersion: 1,
              displayNameKey: 'plan.development',
              features: ['DASHBOARD', 'ANALYSIS', 'LOCAL_INTAKE', 'AGENT'],
              quotas: [
                { metric: 'artifact_bytes', limit: 100_000_000 },
                { metric: 'processing_seconds', limit: 3_600 },
                { metric: 'job_count', limit: 1_000 },
                { metric: 'member_count', limit: 50 },
                { metric: 'ocr_pages', limit: 500 },
              ],
              providerIndependent: true,
              createdAt: minutesBefore(12_200),
            },
          ],
          'planCode',
        );
        await upsertRows(transaction, 'entitlementSnapshotRecord', [
          {
            id: ID.entitlementSnapshot,
            schemaVersion: 1,
            scopeKey: workspaceEntitlementScopeKey,
            scopeType: 'workspace',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            planCode: 'development',
            status: 'ACTIVE',
            revision: 1,
            securityEpoch: 1,
            effectiveAt: minutesBefore(12_190),
            expiresAt: null,
            features: ['DASHBOARD', 'ANALYSIS', 'LOCAL_INTAKE', 'AGENT'],
            quotas: [{ metric: 'job_count', limit: 1_000 }],
            createdAt: minutesBefore(12_190),
          },
        ]);
        await upsertRows(transaction, 'usageReservationRecord', [
          {
            id: ID.reservation,
            scopeKey: usageScopeKey,
            scopeType: 'project',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            metric: 'job_count',
            reservedUnits: BigInt(1),
            status: 'FINALIZED',
            createdAt: minutesBefore(12_100),
            revision: 2,
            updatedAt: minutesBefore(12_090),
          },
        ]);
        await upsertRows(transaction, 'resultUsageSettlementBindingRecord', [
          {
            id: ID.settlementBinding,
            schemaVersion: 1,
            scopeKey: usageScopeKey,
            scopeType: 'project',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            jobId: ID.job,
            reservationId: ID.reservation,
            meter: 'job_count',
            settlementFormula: 'SUCCESSFUL_JOB_UNIT',
            maximumAdmittedUnits: BigInt(1),
            entitlementDecisionSubjectHash: digest('local-seed-entitlement-decision'),
            admissionIdempotencyKey: 'local-seed-job-admission',
            state: 'SETTLED',
            createdAt: minutesBefore(12_080),
            expiresAt: minutesAfter(43_000),
            revision: 2,
          },
        ]);
        await upsertRows(transaction, 'usageReservationRecord', [
          {
            id: ID.widgetReservation,
            scopeKey: workspaceEntitlementScopeKey,
            scopeType: 'workspace',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: null,
            metric: 'job_count',
            reservedUnits: BigInt(1),
            status: 'ACTIVE',
            createdAt: widgetCreatedAt,
            revision: 1,
            updatedAt: widgetCreatedAt,
          },
        ]);
        await upsertRows(transaction, 'resultUsageSettlementBindingRecord', [
          {
            id: ID.widgetSettlementBinding,
            schemaVersion: 1,
            scopeKey: workspaceEntitlementScopeKey,
            scopeType: 'workspace',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: null,
            jobId: ID.widgetJob,
            reservationId: ID.widgetReservation,
            meter: 'job_count',
            settlementFormula: 'SUCCESSFUL_JOB_UNIT',
            maximumAdmittedUnits: BigInt(1),
            entitlementDecisionSubjectHash: digest('local-seed-widget-entitlement-decision'),
            admissionIdempotencyKey: 'local-seed-widget-result-job-v18',
            state: 'PREPARED',
            createdAt: widgetCreatedAt,
            expiresAt: widgetDeadline,
            revision: 1,
          },
        ]);
        await upsertRows(transaction, 'usageLedgerEntryRecord', [
          {
            id: ID.usageEntry,
            schemaVersion: 1,
            scopeKey: usageScopeKey,
            scopeType: 'project',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            metric: 'job_count',
            bucket: 'COMMITTED',
            deltaUnits: BigInt(1),
            sequence: 1,
            reservationId: ID.reservation,
            idempotencyKey: 'local-seed-job-settlement',
            occurredAt: minutesBefore(12_070),
            createdAt: minutesBefore(12_070),
          },
        ]);
        await upsertRows(transaction, 'jobRecord', [
          {
            id: ID.job,
            scopeType: 'project',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            requestedBy: ID.owner,
            actionType: 'DDA_REFRESH_DASHBOARD',
            actionVersion: 1,
            inputManifestHash: digest('local-seed-job-input'),
            idempotencyKey: 'local-seed-dashboard-refresh-job',
            state: 'SUCCEEDED',
            revision: 4,
            createdAt: minutesBefore(12_000),
            startedAt: minutesBefore(11_990),
            finishedAt: minutesBefore(11_970),
          },
        ]);
        await upsertRows(transaction, 'jobRecord', [
          {
            id: ID.widgetJob,
            scopeType: 'workspace',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: null,
            requestedBy: ID.owner,
            actionType: widgetActionType,
            actionVersion: 1,
            inputManifestHash: widgetInputManifestHash,
            idempotencyKey: 'local-seed-widget-result-job-v18',
            state: 'QUEUED',
            revision: 2,
            createdAt: widgetCreatedAt,
            startedAt: null,
            finishedAt: null,
          },
        ]);
        await upsertRows(transaction, 'jobTransitionRecord', [
          {
            id: ID.jobTransitionCreated,
            jobId: ID.job,
            fromState: null,
            toState: 'CREATED',
            actorId: ID.owner,
            occurredAt: minutesBefore(12_000),
            revision: 1,
          },
          {
            id: ID.jobTransitionQueued,
            jobId: ID.job,
            fromState: 'CREATED',
            toState: 'QUEUED',
            actorId: ID.owner,
            occurredAt: minutesBefore(11_999),
            revision: 2,
          },
          {
            id: ID.jobTransitionRunning,
            jobId: ID.job,
            fromState: 'QUEUED',
            toState: 'RUNNING',
            actorId: ID.owner,
            occurredAt: minutesBefore(11_990),
            revision: 3,
          },
          {
            id: ID.jobTransitionSucceeded,
            jobId: ID.job,
            fromState: 'RUNNING',
            toState: 'SUCCEEDED',
            actorId: ID.owner,
            occurredAt: minutesBefore(11_970),
            revision: 4,
          },
        ]);
        await upsertRows(transaction, 'jobTransitionRecord', [
          {
            id: ID.widgetTransitionCreated,
            jobId: ID.widgetJob,
            fromState: null,
            toState: 'CREATED',
            actorId: ID.owner,
            occurredAt: widgetCreatedAt,
            revision: 1,
          },
          {
            id: ID.widgetTransitionQueued,
            jobId: ID.widgetJob,
            fromState: 'CREATED',
            toState: 'QUEUED',
            actorId: ID.owner,
            occurredAt: widgetCreatedAt,
            revision: 2,
          },
        ]);
        await upsertRows(transaction, 'executionAttemptRecord', [
          {
            id: ID.executionAttempt,
            jobId: ID.job,
            scopeType: 'project',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            attemptNumber: 1,
            executorType: 'CLOUD_WORKER',
            executorId: ID.device,
            leaseTokenHash: digest('local-seed-lease'),
            leaseExpiresAt: minutesAfter(42_000),
            state: 'SUCCEEDED',
            createdAt: minutesBefore(11_995),
            heartbeatAt: minutesBefore(11_975),
            startedAt: minutesBefore(11_990),
            finishedAt: minutesBefore(11_970),
            resultManifestHash: digest('local-seed-result-manifest'),
            revision: 2,
          },
        ]);
        await upsertRows(transaction, 'executionAttemptRecord', dashboard.resultAttemptRows);
        await upsertRows(transaction, 'resultManifestRecord', [
          {
            id: ID.resultManifest,
            jobId: ID.job,
            attemptId: ID.executionAttempt,
            scopeType: 'project',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            sourceArtifactVersionIds: [ID.workbookArtifactVersion],
            outputIds: [ID.dashboardSnapshot],
            outputHashes: [digest('dashboard-snapshot-expense-v2')],
            evidenceCoverage: 'COMPLETE',
            handlerDigest: actionHandlerHash,
            engineVersion: 'databreeze-engine-local-seed-1',
            attemptNumber: 1,
            reviewerId: null,
            approvalState: 'NOT_REQUIRED',
            manifestHash: digest('local-seed-result-manifest'),
            generatedAt: minutesBefore(11_970),
          },
        ]);
        await upsertRows(transaction, 'resultManifestRecord', dashboard.resultManifestRows);
        await upsertRows(
          transaction,
          'workerResultPreparationRecord',
          dashboard.dashboardPreparationRows,
          'submissionId',
        );
        await upsertRows(
          transaction,
          'workerResultFinalizationRecord',
          dashboard.dashboardFinalizationRows,
          'submissionId',
        );
        await createRows(transaction, 'executionRequestDescriptorRecord', [
          {
            id: ID.executionDescriptor,
            resultUsageSettlementBindingId: ID.settlementBinding,
            jobId: ID.job,
            stepId: ID.analysisPlanVersion,
            scopeType: 'project',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            actionType: 'DDA_REFRESH_DASHBOARD',
            actionVersion: 1,
            inputSchemaId: 'dda.refresh.request.v1',
            outputSchemaId: 'dda.refresh.result.v1',
            handlerDigest: actionHandlerHash,
            requiredCapabilities: ['analysis.execute'],
            sideEffectClass: 'NONE',
            riskClass: 'READ_ONLY',
            inputObjectIds: [ID.workbookArtifactVersion],
            inputManifestHash: digest('local-seed-job-input'),
            parameters: { dashboardId: ID.dashboard, snapshotId: ID.dashboardSnapshot },
            outputObjectId: 'local-seed-dashboard-result',
            outputMaxBytes: 1_000_000,
            outputMediaType: 'application/json',
            deadline: minutesAfter(42_000),
            locale: 'vi-VN',
            canonicalHash: executionDescriptorHash,
            createdAt: minutesBefore(11_980),
          },
        ]);
        await createRows(transaction, 'executionRequestDescriptorRecord', [
          {
            id: ID.widgetDescriptor,
            resultUsageSettlementBindingId: ID.widgetSettlementBinding,
            jobId: ID.widgetJob,
            stepId: ID.analysisPlanVersion,
            scopeType: 'workspace',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: null,
            actionType: widgetActionType,
            actionVersion: 1,
            inputSchemaId: widgetInputSchemaId,
            outputSchemaId: widgetOutputSchemaId,
            handlerDigest: widgetHandlerHash,
            requiredCapabilities: ['metadata.read'],
            sideEffectClass: 'NONE',
            riskClass: 'READ_ONLY',
            inputObjectIds: [ID.expenseArtifactVersion],
            inputManifestHash: widgetInputManifestHash,
            parameters: widgetParameters,
            outputObjectId: widgetOutputObjectId,
            outputMaxBytes: 4 * 1024 * 1024,
            outputMediaType: 'application/json',
            deadline: widgetDeadline,
            locale: 'vi-VN',
            canonicalHash: widgetDescriptorCanonicalHash,
            createdAt: widgetCreatedAt,
          },
        ]);
        await upsertRows(transaction, 'jobOutboxRecord', [
          {
            id: ID.jobOutbox,
            jobId: ID.job,
            eventType: 'JOB_SUCCEEDED',
            payload: { jobId: ID.job, state: 'SUCCEEDED', resultManifestId: ID.resultManifest },
            createdAt: minutesBefore(11_960),
            deliveredAt: minutesBefore(11_950),
          },
        ]);
        await upsertRows(transaction, 'jobOutboxRecord', [
          {
            id: ID.widgetOutbox,
            jobId: ID.widgetJob,
            eventType: 'JOB_QUEUED',
            payload: {
              schemaVersion: 1,
              jobId: ID.widgetJob,
              actionType: widgetActionType,
              state: 'QUEUED',
              descriptorId: ID.widgetDescriptor,
              descriptorHash: widgetDescriptorCanonicalHash,
            },
            createdAt: widgetCreatedAt,
            deliveredAt: null,
          },
        ]);
        await upsertRows(transaction, 'deviceSyncOperationRecord', [
          {
            id: ID.syncOperation,
            scopeType: 'project',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            deviceId: ID.device,
            entityType: 'DASHBOARD_VERSION',
            entityId: ID.draftDashboardVersion,
            kind: 'UPDATE',
            payloadClass: 'CONTROL_METADATA',
            payloadDigest: digest('local-seed-sync-payload'),
            encryptedPayload: null,
            dependencyIds: [ID.publishedDashboardVersion],
            baseRevision: 1,
            status: 'CONFLICT',
            revision: 1,
            createdAt: minutesBefore(11_800),
            acknowledgedAt: null,
            idempotencyKey: 'local-seed-sync-operation',
          },
        ]);
        await upsertRows(transaction, 'deviceSyncConflictRecord', [
          {
            id: ID.syncConflict,
            operationId: ID.syncOperation,
            scopeType: 'project',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            deviceId: ID.device,
            entityType: 'DASHBOARD_VERSION',
            entityId: ID.draftDashboardVersion,
            reason: 'REVISION_MISMATCH',
            status: 'OPEN',
            expectedRevision: 1,
            actualRevision: 2,
            detectedAt: minutesBefore(11_790),
            resolvedAt: null,
          },
        ]);
        await upsertRows(transaction, 'strictLocalPackageManifestRecord', [
          {
            id: ID.localPackage,
            scopeType: 'project',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            deviceId: ID.device,
            purpose: 'Local dashboard metadata replay',
            destinationClass: 'DESKTOP',
            itemDigests: [digest('local-seed-sync-payload')],
            packageDigest: digest('local-seed-package'),
            issuedAt: minutesBefore(11_780),
            expiresAt: minutesAfter(42_000),
            status: 'PENDING',
            revision: 1,
          },
        ]);
        await upsertRows(transaction, 'deviceTransferReceiptRecord', [
          {
            id: ID.transferReceipt,
            packageId: ID.localPackage,
            deviceId: ID.device,
            destinationClass: 'DESKTOP',
            packageDigest: digest('local-seed-package'),
            receivedAt: minutesBefore(11_770),
            manifestVerified: false,
            status: 'PENDING',
          },
        ]);
        await upsertRows(transaction, 'dashboardRecord', dashboard.dashboardRows);
        await upsertRows(transaction, 'dashboardVersionRecord', dashboard.versionRows);
        await upsertRows(transaction, 'analysisPlanRecord', dashboard.planRows);
        await upsertRows(
          transaction,
          'materializationDefinitionRecord',
          dashboard.materializationRows,
        );
        await upsertRows(transaction, 'dashboardSnapshotRecord', dashboard.snapshotRows);
        await upsertRows(transaction, 'dashboardRefreshStateRecord', dashboard.refreshStateRows);
        await upsertRows(
          transaction,
          'dashboardRefreshExecutionRecord',
          dashboard.refreshExecutionRows,
        );
        await upsertRows(
          transaction,
          'dashboardRefreshEventRecord',
          dashboard.refreshEventRows,
          'eventId',
        );
        await upsertRows(
          transaction,
          'dashboardRefreshEventCorrelationRecord',
          dashboard.refreshCorrelationRows,
          'eventId',
        );
        await createRows(transaction, 'dashboardRefreshIdempotencyRecord', [
          {
            keyKind: 'CLIENT_REQUEST',
            keyValue: 'local-seed-refresh-request',
            refreshId: ID.refreshExecution,
            ...projectScope,
          },
        ]);
        await createRows(transaction, 'dashboardRefreshEventSequenceRecord', [
          {
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            dashboardId: ID.dashboard,
            nextSequence: BigInt(2),
          },
        ]);
        await createRows(transaction, 'dependencySequenceRecord', [
          {
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            highestSequence: 1,
          },
        ]);
        await upsertRows(
          transaction,
          'dependencyProcessedEventRecord',
          [{ eventId: ID.refreshEvent, sequence: 1 }],
          'eventId',
        );
        await upsertRows(transaction, 'ddaConversation', conversations.conversationRows);
        await upsertRows(transaction, 'ddaConversationMessage', conversations.messages);
        await upsertRows(
          transaction,
          'ddaConversationContextEvent',
          conversations.contextEventRows,
        );
        await upsertRows(
          transaction,
          'ddaConversationSummary',
          conversations.summaryRows,
          'conversationId',
        );
        await upsertRows(transaction, 'ddaNamedDashboardView', conversations.viewRows);
        await upsertRows(transaction, 'ddaExtractionCandidate', [
          {
            id: ID.extractionCandidate,
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            iaeArtifactVersionId: ID.receiptArtifactVersion,
            profileVersion: 'TABLE_V1',
            candidateHash: digest('local-seed-receipt-candidate'),
            pageCount: 1,
            columnCount: 4,
            cellCount: 8,
            evidenceReferenceId: ID.receiptEvidence,
            status: 'NEEDS_REVIEW',
            createdAt: minutesBefore(7_200),
            updatedAt: minutesBefore(7_200),
          },
        ]);
        await upsertRows(transaction, 'receiptExtractionCommandRecord', [
          {
            id: ID.receiptCommand,
            scopeKey: usageScopeKey,
            scopeType: 'project',
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            operation: 'EXTRACT',
            artifactVersionId: ID.receiptArtifactVersion,
            sourceId: ID.receiptSource,
            commandKey: 'local-seed-receipt-extraction',
            payloadFingerprint: digest('local-seed-receipt-extraction'),
            state: 'COMPLETED',
            ownerToken: null,
            leaseExpiresAt: null,
            failureCode: null,
            candidateId: ID.extractionCandidate,
            candidateDocument: {
              profileVersion: 'TABLE_V1',
              evidenceReferenceId: ID.receiptEvidence,
            },
            createdAt: minutesBefore(7_250),
            updatedAt: minutesBefore(7_200),
            completedAt: minutesBefore(7_200),
          },
        ]);
        await upsertRows(transaction, 'dashboardProposalRecord', [
          scopedRow(projectScope, {
            id: ID.dashboardProposal,
            dashboardId: ID.dashboard,
            parentVersionId: ID.publishedDashboardVersion,
            analysisPlanVersionId: ID.analysisPlanVersion,
            expectedRevision: 2,
            state: 'PROPOSED',
            proposalDocument: {
              schemaVersion: 1,
              status: 'PROPOSED',
              widgets: [{ type: 'LINE', title: { vi: 'Xu hướng chi phí', en: 'Expense trend' } }],
              rationale: {
                vi: 'Đề xuất từ dữ liệu đã được cấp quyền.',
                en: 'Proposed from authorized data.',
              },
            },
            actorId: ID.owner,
            acceptedVersionId: null,
            createdAt: minutesBefore(6_900),
            updatedAt: minutesBefore(6_900),
          }),
        ]);
        await upsertRows(transaction, 'etlProposalRecord', [
          scopedRow(projectScope, {
            id: ID.etlProposal,
            revision: 1,
            state: 'PENDING_REVIEW',
            blockingReasons: [],
            planDocument: {
              inputArtifactVersionId: ID.workbookArtifactVersion,
              mappingVersionId: ID.expenseMapping,
              ruleSetVersionId: ID.expenseRules,
              transformations: ['PARSE_DATE', 'PARSE_DECIMAL', 'TRIM'],
              dataClassification: 'INTERNAL',
            },
            reviewDocument: {
              qualityState: 'PASS_WITH_WARNINGS',
              evidenceReferenceIds: [ID.expenseEvidence],
              reviewerRequired: true,
            },
            createdAt: minutesBefore(6_800),
            updatedAt: minutesBefore(6_800),
          }),
        ]);
        await upsertRows(transaction, 'etlAcceptanceCommandRecord', [
          scopedRow(projectScope, {
            id: ID.etlAcceptance,
            proposalId: ID.etlProposal,
            expectedRevision: 1,
            commandKey: 'local-seed-etl-acceptance',
            payloadFingerprint: digest('local-seed-etl-acceptance'),
            state: 'COMPLETED',
            ownerToken: 'local-seed-review-owner',
            leaseExpiresAt: null,
            resultDocument: {
              accepted: true,
              acceptedBy: ID.owner,
              acceptedAt: minutesBefore(6_780).toISOString(),
            },
            failureCode: null,
            createdAt: minutesBefore(6_790),
            updatedAt: minutesBefore(6_790),
            completedAt: minutesBefore(6_780),
          }),
        ]);
        await upsertRows(transaction, 'clientReportDefinitionRecord', [
          // Reports are listed from the authenticated workspace scope. Keep
          // the seed row workspace-scoped while retaining the server-owned
          // client/project reference so the Reports page has a real fixture.
          scopedRow(workspaceScope, {
            id: ID.reportDefinition,
            scopeKey: reportWorkspaceScopeKey,
            clientId: ID.reportClient,
            name: 'Báo cáo vận hành chi phí',
            period: '2026-08',
            datasetId: ID.expenseDataset,
            datasetVersionId: ID.expenseVersion,
            templateId: ID.reportTemplate,
            templateVersion: 1,
            supportedFormats: ['WEB', 'PDF'],
            blocks: [],
            status: 'DRAFT',
            reportVersion: 1,
            idempotencyKey: 'local-seed-report-definition',
            canonicalHash: digest('local-seed-report-definition'),
            createdAt: minutesBefore(6_200),
            updatedAt: minutesBefore(6_200),
          }),
        ]);
        await createRows(transaction, 'dashboardAuthoringCommandRecord', [
          {
            commandId: ID.dashboardAuthoringCommand,
            dashboardId: ID.dashboard,
            organizationId: ID.organization,
            workspaceId: ID.workspace,
            projectId: ID.project,
            versionId: ID.draftDashboardVersion,
            revision: 2,
            savedAt: minutesBefore(6_700),
            publishes: false,
            resultDocument: {
              schemaVersion: 1,
              outcome: 'ACCEPTED',
              dashboardId: ID.dashboard,
              versionId: ID.draftDashboardVersion,
              revision: 2,
            },
          },
        ]);
        await createRows(transaction, 'dashboardPublicationIdempotencyRecord', [
          {
            keyValue: 'local-seed-publication',
            snapshotId: ID.dashboardSnapshot,
            dashboardId: ID.dashboard,
            versionId: ID.publishedDashboardVersion,
            requestHash: digest('local-seed-publication'),
            revision: 2,
            ...projectScope,
            createdAt: minutesBefore(6_600),
          },
        ]);
        await upsertRows(transaction, 'dashboardPublicationAuditOutboxRecord', [
          scopedRow(projectScope, {
            id: ID.publicationAudit,
            keyValue: 'local-seed-publication',
            dashboardId: ID.dashboard,
            versionId: ID.publishedDashboardVersion,
            snapshotId: ID.dashboardSnapshot,
            actorId: ID.owner,
            correlationId: ID.refreshCorrelation,
            authorizationEpoch: 1,
            approvalId: null,
            priorPublishedVersionId: null,
            audience: 'WORKSPACE_VIEWERS',
            action: 'PUBLISH',
            createdAt: minutesBefore(6_600),
          }),
        ]);
        await upsertRows(transaction, 'dashboardPublicationApprovalInvalidationOutboxRecord', [
          scopedRow(projectScope, {
            id: ID.publicationInvalidation,
            keyValue: 'local-seed-publication-invalidation',
            snapshotId: ID.dashboardSnapshot,
            dashboardId: ID.dashboard,
            priorPublishedVersionId: ID.publishedDashboardVersion,
            action: 'INVALIDATE_PRIOR_APPROVALS',
            state: 'COMPLETED',
            attempts: 1,
            leaseOwner: null,
            leaseExpiresAt: null,
            nextAttemptAt: null,
            lastError: null,
            completedAt: minutesBefore(6_590),
            createdAt: minutesBefore(6_600),
          }),
        ]);
        await upsertRows(transaction, 'ddaNotificationIntent', conversations.notificationRows);
        await upsertRows(
          transaction,
          'ddaNotificationProjectionReceipt',
          conversations.notificationProjectionReceiptRows,
        );
        await upsertRows(
          transaction,
          'ddaNotificationStateCommandReceipt',
          conversations.notificationStateReceiptRows,
        );
        await createRows(
          transaction,
          'ddaNotificationProjectionCheckpoint',
          conversations.notificationCheckpointRows,
        );
        await upsertRows(transaction, 'agentConsequentialCommandRecord', [
          scopedRow(projectScope, {
            id: ID.agentCommand,
            tenantScopeKey: usageScopeKey,
            actorId: ID.owner,
            toolName: 'dashboard.refresh',
            idempotencyKey: 'local-seed-agent-refresh',
            inputFingerprint: digest('local-seed-agent-refresh'),
            correlationId: ID.refreshCorrelation,
            state: 'COMMITTED',
            ownerToken: 'local-seed-agent-owner',
            leaseExpiresAt: null,
            auditIntentAt: minutesBefore(6_500),
            auditAttemptedAt: minutesBefore(6_500),
            auditSucceededAt: minutesBefore(6_500),
            auditFailureCode: null,
            resultReferenceId: ID.dashboardSnapshot,
            resultDocument: { state: 'SUCCEEDED', snapshotId: ID.dashboardSnapshot },
            failureCode: null,
            reconciliationRequiredAt: null,
            createdAt: minutesBefore(6_500),
            updatedAt: minutesBefore(6_500),
            completedAt: minutesBefore(6_500),
          }),
        ]);
        await upsertRows(transaction, 'auditEventRecord', [
          scopedRow(projectScope, {
            id: ID.auditEvent,
            schemaVersion: 1,
            action: 'job.completed',
            scopeKey: usageScopeKey,
            actorType: 'USER',
            actorId: ID.owner,
            entityType: 'DASHBOARD',
            entityId: ID.dashboard,
            entityRevision: 2,
            sequence: 1,
            occurredAt: minutesBefore(6_400),
            correlationId: ID.refreshCorrelation,
            idempotencyKey: 'local-seed-audit-event',
            summary: { resourceType: 'DASHBOARD', status: 'COMPLETED' },
            previousDigest: null,
            digest: auditDigest,
            createdAt: minutesBefore(6_400),
          }),
        ]);
        await upsertRows(transaction, 'auditSealRecord', [
          scopedRow(projectScope, {
            id: ID.auditSeal,
            schemaVersion: 1,
            scopeKey: usageScopeKey,
            firstSequence: 1,
            lastSequence: 1,
            eventCount: 1,
            rootDigest: auditRootDigest,
            sealedAt: minutesBefore(6_300),
            createdAt: minutesBefore(6_300),
          }),
        ]);
      },
      { timeout: 120_000 },
    );
  } finally {
    await database.$disconnect();
  }

  console.log('');
  console.log('DataBreeze local seed completed.');
  console.log(`Organization: ${ID.organization}`);
  console.log(`Workspace:    ${ID.workspace}`);
  console.log(`Project:      ${ID.project}`);
  console.log('Landing feedbacks: 12 deterministic synthetic rows (lfb.landing_feedbacks)');
  console.log('Reports:           1 synthetic governed definition (CRF, draft/no run)');
  console.log(`Executable dashboard job: ${ID.widgetJob} (dda.materialize.widget-result)`);
  console.log('Run the local worker profile to materialize the seeded dashboard widget.');
  console.log('');
  console.log('Synthetic sign-in accounts (all use the same generated password):');
  console.log('  platform-owner@databreeze.local PLATFORM_OWNER / internal product overview');
  console.log('  owner@databreeze.local   OWNER / APPLY_CONFIRMED_CHANGES');
  console.log('  admin@databreeze.local   OWNER org / EDITOR workspace + project');
  console.log('  analyst@databreeze.local ANALYST / PROPOSE_CHANGES');
  console.log('  viewer@databreeze.local  VIEWER / NONE + restricted dataset denied');
  console.log('Password: read DATABREEZE_LOCAL_SEED_PASSWORD from infrastructure/local/.env');
  console.log('');
  console.log(
    skipObjects
      ? 'MinIO upload skipped; seeded placements were marked unavailable.'
      : 'Synthetic CSV/XLSX/PNG fixture bytes uploaded to local MinIO.',
  );
  console.log('Use --skip-objects only when MinIO is intentionally unavailable.');
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

export type ProductStage = 'analyze' | 'assure' | 'intake' | 'publish';

export interface ProductModuleCopy {
  readonly action: string;
  readonly capabilities: readonly string[];
  readonly description: string;
  readonly name: string;
}

export interface ProductModuleRegistration {
  readonly code: string;
  readonly copy: Readonly<Record<SupportedLocaleV1, ProductModuleCopy>>;
  readonly requirementRange: string;
  readonly slug: string;
  readonly stage: ProductStage;
}

function moduleRegistration(registration: ProductModuleRegistration): ProductModuleRegistration {
  return Object.freeze({
    ...registration,
    copy: Object.freeze({
      en: Object.freeze({
        ...registration.copy.en,
        capabilities: Object.freeze([...registration.copy.en.capabilities]),
      }),
      'vi-VN': Object.freeze({
        ...registration.copy['vi-VN'],
        capabilities: Object.freeze([...registration.copy['vi-VN'].capabilities]),
      }),
    }),
  });
}

/**
 * Build-time product registry for the Web responsibilities in the platform feature matrix.
 * These entries advertise governed surfaces; they do not imply API availability or access.
 * Requirement families: FA, SA, QI, OC, ILD, CRF, PDA, MR, DQG, EI.
 */
export const PRODUCT_MODULE_REGISTRY = Object.freeze([
  moduleRegistration({
    code: 'FA',
    slug: 'folder-autopilot',
    stage: 'intake',
    requirementRange: 'FA-001–FA-034',
    copy: {
      'vi-VN': {
        name: 'Tự động hóa thư mục',
        description:
          'Điều phối quy trình tệp trên các thư mục Windows đã được phê duyệt mà không cấp quyền duyệt hệ thống tệp từ xa.',
        action: 'Tạo công thức quy trình',
        capabilities: [
          'Soạn công thức có kiểu và liên kết thiết bị, thư mục được phê duyệt',
          'Thiết lập cổng phê duyệt và xem trước tác động an toàn',
          'Theo dõi hàng đợi, lần chạy, tình trạng và nhật ký kiểm toán',
        ],
      },
      en: {
        name: 'Folder Autopilot',
        description:
          'Orchestrate file workflows on approved Windows folders without granting remote filesystem browsing.',
        action: 'Create recipe',
        capabilities: [
          'Author typed recipes and bind approved devices and folders',
          'Configure approval gates and preview safe effects',
          'Monitor queues, executions, health, and audit history',
        ],
      },
    },
  }),
  moduleRegistration({
    code: 'SA',
    slug: 'spreadsheet-auditor',
    stage: 'assure',
    requirementRange: 'SA-001–SA-027',
    copy: {
      'vi-VN': {
        name: 'Kiểm toán bảng tính',
        description:
          'Định cấu hình và quản trị việc kiểm toán bảng tính, xử lý phát hiện và phê duyệt kế hoạch sửa chữa.',
        action: 'Tạo hồ sơ kiểm toán',
        capabilities: [
          'Định cấu hình hồ sơ kiểm toán và lịch chạy',
          'Phân loại phát hiện, giao việc và theo dõi xử lý',
          'Phê duyệt kế hoạch sửa chữa và xem xu hướng chất lượng',
        ],
      },
      en: {
        name: 'Spreadsheet Auditor',
        description:
          'Configure and govern spreadsheet audits, finding triage, and repair-plan approval.',
        action: 'Create audit profile',
        capabilities: [
          'Configure audit profiles and schedules',
          'Triage findings, assign work, and follow remediation',
          'Approve repair plans and review quality trends',
        ],
      },
    },
  }),
  moduleRegistration({
    code: 'QI',
    slug: 'quote-intelligence',
    stage: 'analyze',
    requirementRange: 'QI-001–QI-027',
    copy: {
      'vi-VN': {
        name: 'Phân tích báo giá',
        description:
          'Chuẩn hóa việc so sánh nhà cung cấp bằng tiêu chí chấm điểm, cộng tác và phê duyệt có bằng chứng.',
        action: 'Tạo yêu cầu báo giá',
        capabilities: [
          'Định cấu hình yêu cầu báo giá, nhà cung cấp và tiêu chí chấm điểm',
          'Cộng tác, phê duyệt và xem lại lịch sử quyết định',
          'Xuất bản báo cáo so sánh được quản trị',
        ],
      },
      en: {
        name: 'Quote Intelligence',
        description:
          'Standardize supplier comparison with governed scoring, collaboration, approval, and evidence.',
        action: 'Create RFQ',
        capabilities: [
          'Configure RFQs, suppliers, and scoring',
          'Collaborate, approve, and review history',
          'Publish governed comparison reports',
        ],
      },
    },
  }),
  moduleRegistration({
    code: 'OC',
    slug: 'operations-capture',
    stage: 'intake',
    requirementRange: 'OC-001–OC-040',
    copy: {
      'vi-VN': {
        name: 'Ghi nhận vận hành',
        description:
          'Thiết kế và quản trị quy trình ghi nhận dữ liệu hiện trường với biểu mẫu có phiên bản và xử lý ngoại lệ.',
        action: 'Tạo biểu mẫu',
        capabilities: [
          'Thiết kế, lập phiên bản biểu mẫu và phát hành dữ liệu tham chiếu',
          'Cấu hình phân công, chính sách và theo dõi công việc hiện trường',
          'Xem xét ngoại lệ, báo cáo và xuất dữ liệu được phép',
        ],
      },
      en: {
        name: 'Operations Capture',
        description:
          'Design and govern field-data capture with versioned forms, assignments, and exception handling.',
        action: 'Create form',
        capabilities: [
          'Design and version forms and publish reference data',
          'Configure assignments and policy and monitor field work',
          'Review exceptions, report, and export permitted data',
        ],
      },
    },
  }),
  moduleRegistration({
    code: 'ILD',
    slug: 'invoice-leak-detector',
    stage: 'analyze',
    requirementRange: 'ILD-001–ILD-027',
    copy: {
      'vi-VN': {
        name: 'Phát hiện thất thoát hóa đơn',
        description:
          'Điều tra các ngoại lệ phải trả và xây dựng hồ sơ bằng chứng có thể phê duyệt cho khoản thất thoát.',
        action: 'Tạo cuộc điều tra',
        capabilities: [
          'Quản trị thư viện nhà cung cấp và biểu phí',
          'Điều tra ngoại lệ, quản lý vụ việc và giao người phụ trách',
          'Phê duyệt gói bằng chứng và phân tích phơi nhiễm, thu hồi',
        ],
      },
      en: {
        name: 'Invoice Leak Detector',
        description:
          'Investigate payable exceptions and build approvable evidence packages for leakage.',
        action: 'Create investigation',
        capabilities: [
          'Govern supplier and rate libraries',
          'Investigate exceptions, manage cases, and assign owners',
          'Approve evidence packages and analyze exposure and recovery',
        ],
      },
    },
  }),
  moduleRegistration({
    code: 'CRF',
    slug: 'client-report-factory',
    stage: 'publish',
    requirementRange: 'CRF-001–CRF-027',
    copy: {
      'vi-VN': {
        name: 'Xưởng báo cáo khách hàng',
        description:
          'Biến kết quả đã được quản trị thành báo cáo khách hàng ổn định, có thể xem xét và phát hành.',
        action: 'Tạo báo cáo',
        capabilities: [
          'Quản lý khách hàng, liên kết dữ liệu, mẫu, thương hiệu và lịch',
          'Điều phối tạo báo cáo trên đám mây và quy trình phê duyệt',
          'Xuất bản, chia sẻ và theo dõi lịch sử phát hành',
        ],
      },
      en: {
        name: 'Client Report Factory',
        description:
          'Turn governed results into stable client reports with review, approval, and release history.',
        action: 'Create report',
        capabilities: [
          'Manage clients, data bindings, templates, brands, and schedules',
          'Coordinate cloud generation and approval workflows',
          'Publish, share, and review release history',
        ],
      },
    },
  }),
  moduleRegistration({
    code: 'PDA',
    slug: 'private-data-analyst',
    stage: 'analyze',
    requirementRange: 'PDA-001–PDA-037',
    copy: {
      'vi-VN': {
        name: 'Nhà phân tích dữ liệu riêng tư',
        description:
          'Đặt câu hỏi trên dữ liệu được phép, kiểm tra kế hoạch có kiểu và quản trị việc chia sẻ kết quả phân tích.',
        action: 'Bắt đầu phân tích',
        capabilities: [
          'Đặt câu hỏi được quản trị và kiểm tra kế hoạch phân tích có kiểu',
          'Tạo bảng, biểu đồ và chứng nhận kết quả',
          'Lên lịch, chia sẻ, nhúng và quản trị chính sách AI, xuất dữ liệu',
        ],
      },
      en: {
        name: 'Private Data Analyst',
        description:
          'Ask questions over authorized data, inspect typed plans, and govern analytical publication.',
        action: 'Start analysis',
        capabilities: [
          'Ask governed questions and inspect typed analytical plans',
          'Create tables and charts and certify results',
          'Schedule, share, embed, and administer AI and egress policy',
        ],
      },
    },
  }),
  moduleRegistration({
    code: 'MR',
    slug: 'migration-ready',
    stage: 'assure',
    requirementRange: 'MR-001–MR-032',
    copy: {
      'vi-VN': {
        name: 'Sẵn sàng di chuyển dữ liệu',
        description:
          'Chuẩn bị, đối soát và phê duyệt dữ liệu cho một đợt chuyển hệ thống có giới hạn thời gian.',
        action: 'Tạo dự án di chuyển',
        capabilities: [
          'Quản trị dự án, lược đồ, ánh xạ, quy tắc và hồ sơ dữ liệu',
          'Xử lý trùng lặp, chính sách đối soát và ngoại lệ',
          'Phê duyệt phát hành, gói chuyển giao và báo cáo',
        ],
      },
      en: {
        name: 'Migration Ready',
        description: 'Prepare, reconcile, and approve data for a time-bounded system migration.',
        action: 'Create migration project',
        capabilities: [
          'Govern projects, schemas, mappings, rules, and profiling',
          'Handle duplicates, reconciliation policy, and exceptions',
          'Approve releases, migration packages, and reports',
        ],
      },
    },
  }),
  moduleRegistration({
    code: 'DQG',
    slug: 'data-quality-guard',
    stage: 'assure',
    requirementRange: 'DQG-001–DQG-035',
    copy: {
      'vi-VN': {
        name: 'Giám sát chất lượng dữ liệu',
        description:
          'Theo dõi liên tục các hợp đồng chất lượng, sự cố và biện pháp sửa chữa trên dữ liệu được quản trị.',
        action: 'Tạo hợp đồng chất lượng',
        capabilities: [
          'Định nghĩa hợp đồng chất lượng, bộ giám sát và đường cơ sở',
          'Quản lý chủ sở hữu, leo thang, miễn trừ và sửa chữa',
          'Theo dõi xu hướng, báo cáo và thực thi trên đám mây',
        ],
      },
      en: {
        name: 'Data Quality Guard',
        description:
          'Continuously monitor quality contracts, incidents, and repairs for governed data.',
        action: 'Create quality contract',
        capabilities: [
          'Define quality contracts, monitors, and baselines',
          'Manage ownership, escalation, waivers, and repairs',
          'Review trends, reports, and cloud execution',
        ],
      },
    },
  }),
  moduleRegistration({
    code: 'EI',
    slug: 'embedded-importer',
    stage: 'intake',
    requirementRange: 'EI-001–EI-027',
    copy: {
      'vi-VN': {
        name: 'Trình nhập dữ liệu nhúng',
        description:
          'Đưa quy trình nhập dữ liệu được quản trị vào sản phẩm khác với lược đồ, ánh xạ và nguồn gốc rõ ràng.',
        action: 'Tạo lược đồ nhập',
        capabilities: [
          'Quản lý lược đồ, ánh xạ, thương hiệu và nguồn gốc được phép',
          'Quản trị thông tin xác thực API, webhook và giao diện nhập được lưu trữ',
          'Theo dõi nhật ký, mức sử dụng và công cụ hỗ trợ',
        ],
      },
      en: {
        name: 'Embedded Importer',
        description:
          'Embed governed data import in another product with explicit schemas, mappings, and origins.',
        action: 'Create import schema',
        capabilities: [
          'Manage schemas, mappings, branding, and allowed origins',
          'Govern API credentials, webhooks, and the hosted import UI',
          'Review logs, usage, and support tools',
        ],
      },
    },
  }),
] satisfies readonly ProductModuleRegistration[]);

export function getProductModuleCopy(
  module: ProductModuleRegistration,
  locale: SupportedLocaleV1,
): ProductModuleCopy {
  return module.copy[locale];
}

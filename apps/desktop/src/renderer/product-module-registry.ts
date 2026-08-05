import type { DesktopLocale } from '../shared/desktop-contract-v1.ts';

export interface DesktopProductModuleCopy {
  readonly action: string;
  readonly capabilities: readonly string[];
  readonly description: string;
  readonly name: string;
}

export interface DesktopProductModule {
  readonly code: string;
  readonly copy: Readonly<Record<DesktopLocale, DesktopProductModuleCopy>>;
  readonly requirementRange: string;
  readonly slug: string;
}

/**
 * Renderer-owned, build-time product metadata from the approved Desktop feature matrix.
 * It contains no customer records, local paths, commands, or runtime authorization claims.
 */
export const DESKTOP_PRODUCT_MODULES = Object.freeze([
  {
    code: 'FA',
    slug: 'folder-autopilot',
    requirementRange: 'FA-001–FA-034',
    copy: {
      'vi-VN': {
        name: 'Tự động hóa thư mục',
        description:
          'Xử lý tệp cục bộ bằng công thức có kiểu trên các thư mục đã được người dùng phê duyệt.',
        action: 'Tạo công thức cục bộ',
        capabilities: [
          'Theo dõi và tạo dấu vân tay cho tệp trong thư mục đã được phê duyệt',
          'Chạy xử lý cục bộ có kiểu và xem trước tác động trước khi áp dụng',
          'Áp dụng hành động đã phê duyệt, giữ nhật ký hoàn tác và làm việc ngoại tuyến',
        ],
      },
      en: {
        name: 'Folder Autopilot',
        description: 'Run typed local file workflows on explicitly approved folders.',
        action: 'Create local recipe',
        capabilities: [
          'Watch and fingerprint files in approved folders',
          'Run typed local processing and preview effects before applying them',
          'Apply approved actions, retain undo journals, and work offline',
        ],
      },
    },
  },
  {
    code: 'SA',
    slug: 'spreadsheet-auditor',
    requirementRange: 'SA-001–SA-027',
    copy: {
      'vi-VN': {
        name: 'Kiểm toán bảng tính',
        description:
          'Kiểm toán bảng tính lớn hoặc cục bộ với bằng chứng chi tiết và quy trình sửa chữa an toàn.',
        action: 'Bắt đầu kiểm toán',
        capabilities: [
          'Kiểm toán bảng tính lớn, tệp cục bộ và thư mục theo dõi đã được phê duyệt',
          'Kiểm tra công thức, ô và bằng chứng chi tiết',
          'Tạo bản sao đã sửa chữa và tiếp tục công việc khi ngoại tuyến',
        ],
      },
      en: {
        name: 'Spreadsheet Auditor',
        description:
          'Audit large or local workbooks with detailed evidence and safe repair workflows.',
        action: 'Start audit',
        capabilities: [
          'Audit large workbooks, local files, and approved watched folders',
          'Inspect formulas, cells, and detailed evidence',
          'Create repaired copies and continue working offline',
        ],
      },
    },
  },
  {
    code: 'QI',
    slug: 'quote-intelligence',
    requirementRange: 'QI-001–QI-027',
    copy: {
      'vi-VN': {
        name: 'Phân tích báo giá',
        description:
          'Trích xuất và so sánh báo giá cục bộ với bằng chứng có thể kiểm tra và bản xuất đã phê duyệt.',
        action: 'So sánh báo giá',
        capabilities: [
          'Trích xuất và so sánh tệp báo giá cục bộ hoặc lô lớn',
          'Kiểm tra bằng chứng chi tiết được giữ trên thiết bị',
          'Xuất bản sao đã được phê duyệt mà không thay đổi bản gốc',
        ],
      },
      en: {
        name: 'Quote Intelligence',
        description:
          'Extract and compare local quotes with inspectable evidence and approved exports.',
        action: 'Compare quotes',
        capabilities: [
          'Extract and compare local quote files or large batches',
          'Inspect detailed evidence retained on the device',
          'Export approved copies without changing source originals',
        ],
      },
    },
  },
  {
    code: 'OC',
    slug: 'operations-capture',
    requirementRange: 'OC-001–OC-040',
    copy: {
      'vi-VN': {
        name: 'Ghi nhận vận hành',
        description:
          'Tiếp nhận tài liệu từ nguồn cục bộ, xử lý trích xuất lớn và đối soát bản ghi an toàn.',
        action: 'Nhập bản ghi',
        capabilities: [
          'Nhập tệp từ thư mục máy quét đã được phê duyệt',
          'Chạy OCR, trích xuất lớn và xem xét hàng loạt trên thiết bị',
          'Đối soát bản gửi và tạo bản xuất được phép',
        ],
      },
      en: {
        name: 'Operations Capture',
        description:
          'Ingest approved local documents, run large extraction, and safely reconcile records.',
        action: 'Import records',
        capabilities: [
          'Import files from an approved scanner folder',
          'Run large OCR, extraction, and bulk review on the device',
          'Reconcile submissions and generate permitted exports',
        ],
      },
    },
  },
  {
    code: 'ILD',
    slug: 'invoice-leak-detector',
    requirementRange: 'ILD-001–ILD-027',
    copy: {
      'vi-VN': {
        name: 'Phát hiện thất thoát hóa đơn',
        description:
          'Xử lý hóa đơn nhạy cảm hoặc khối lượng lớn trên thiết bị với bằng chứng được bảo toàn.',
        action: 'Phân tích hóa đơn',
        capabilities: [
          'Theo dõi thư mục hóa đơn đã được phê duyệt',
          'Xử lý tài liệu nhạy cảm hoặc khối lượng lớn cục bộ',
          'Giải quyết bằng chứng và tạo bản sao xuất được phép',
        ],
      },
      en: {
        name: 'Invoice Leak Detector',
        description:
          'Process sensitive or high-volume invoices on-device while preserving evidence.',
        action: 'Analyze invoices',
        capabilities: [
          'Watch an approved invoice folder',
          'Process sensitive or high-volume documents locally',
          'Resolve evidence and generate permitted export copies',
        ],
      },
    },
  },
  {
    code: 'CRF',
    slug: 'client-report-factory',
    requirementRange: 'CRF-001–CRF-027',
    copy: {
      'vi-VN': {
        name: 'Xưởng báo cáo khách hàng',
        description:
          'Chuẩn bị dữ liệu và kết xuất báo cáo Office hoặc PDF lớn, nhạy cảm trên thiết bị.',
        action: 'Kết xuất báo cáo',
        capabilities: [
          'Chuẩn bị tập dữ liệu cục bộ và kiểm tra bằng chứng',
          'Kết xuất lô Office hoặc PDF lớn, nhạy cảm trên thiết bị',
          'Đóng gói đầu ra đã được phê duyệt mà không thay đổi nguồn',
        ],
      },
      en: {
        name: 'Client Report Factory',
        description: 'Prepare data and render large or sensitive Office and PDF reports on-device.',
        action: 'Render report',
        capabilities: [
          'Prepare local datasets and inspect evidence',
          'Render large or sensitive Office and PDF batches on-device',
          'Package approved outputs without changing source data',
        ],
      },
    },
  },
  {
    code: 'PDA',
    slug: 'private-data-analyst',
    requirementRange: 'PDA-001–PDA-037',
    copy: {
      'vi-VN': {
        name: 'Nhà phân tích dữ liệu riêng tư',
        description:
          'Phân tích tập dữ liệu cục bộ được chỉ định rõ ràng với AI cục bộ tùy chọn và bằng chứng chi tiết.',
        action: 'Bắt đầu phân tích cục bộ',
        capabilities: [
          'Lập danh mục và phân tích tập dữ liệu cục bộ được cho phép rõ ràng',
          'Dùng AI cục bộ tùy chọn và kiểm tra bằng chứng chi tiết',
          'Lưu phân tích ngoại tuyến và đồng bộ kết quả được phép',
        ],
      },
      en: {
        name: 'Private Data Analyst',
        description:
          'Analyze explicitly authorized local datasets with optional local AI and detailed evidence.',
        action: 'Start local analysis',
        capabilities: [
          'Catalog and analyze explicitly authorized local datasets',
          'Use optional local AI and inspect detailed evidence',
          'Save offline analyses and synchronize permitted results',
        ],
      },
    },
  },
  {
    code: 'MR',
    slug: 'migration-ready',
    requirementRange: 'MR-001–MR-032',
    copy: {
      'vi-VN': {
        name: 'Sẵn sàng di chuyển dữ liệu',
        description:
          'Lập hồ sơ và chuyển đổi nguồn dữ liệu lớn hoặc nhạy cảm cục bộ trước khi phát hành.',
        action: 'Chạy thử di chuyển',
        capabilities: [
          'Lập hồ sơ và chuyển đổi nguồn cục bộ lớn hoặc nhạy cảm',
          'Chạy thử có bằng chứng trước khi tạo tác động',
          'Phân giai đoạn gói chuyển giao và tiếp tục khi ngoại tuyến',
        ],
      },
      en: {
        name: 'Migration Ready',
        description:
          'Profile and transform large or sensitive local sources before a governed release.',
        action: 'Run migration dry run',
        capabilities: [
          'Profile and transform large or sensitive local sources',
          'Run evidence-backed dry runs before creating effects',
          'Stage migration packages and continue working offline',
        ],
      },
    },
  },
  {
    code: 'DQG',
    slug: 'data-quality-guard',
    requirementRange: 'DQG-001–DQG-035',
    copy: {
      'vi-VN': {
        name: 'Giám sát chất lượng dữ liệu',
        description:
          'Kiểm tra và sửa chữa tập dữ liệu lớn hoặc nhạy cảm cục bộ với bằng chứng cấp hàng và ô.',
        action: 'Chạy kiểm tra chất lượng',
        capabilities: [
          'Kiểm tra tập dữ liệu lớn hoặc nhạy cảm trên thiết bị',
          'Chạy lịch ngoại tuyến và kiểm tra bằng chứng cấp hàng hoặc ô',
          'Tạo tệp đã sửa chữa dẫn xuất, không ghi đè nguồn',
        ],
      },
      en: {
        name: 'Data Quality Guard',
        description:
          'Check and repair large or sensitive local datasets with row- and cell-level evidence.',
        action: 'Run quality check',
        capabilities: [
          'Check large or sensitive datasets on-device',
          'Run offline schedules and inspect row- or cell-level evidence',
          'Create derived repaired files without overwriting sources',
        ],
      },
    },
  },
  {
    code: 'EI',
    slug: 'embedded-importer',
    requirementRange: 'EI-001–EI-027',
    copy: {
      'vi-VN': {
        name: 'Trình nhập dữ liệu nhúng',
        description:
          'Kiểm thử và xác thực nhập dữ liệu cục bộ qua cổng chỉ kết nối ra ngoài cho tệp đã được phê duyệt.',
        action: 'Chạy bộ kiểm thử SDK',
        capabilities: [
          'Chạy bộ kiểm thử SDK cục bộ trong ranh giới ứng dụng',
          'Tiếp nhận tệp đã được phê duyệt qua cổng chỉ kết nối ra ngoài',
          'Phân tích cú pháp và xác thực dữ liệu trên thiết bị',
        ],
      },
      en: {
        name: 'Embedded Importer',
        description:
          'Test and validate local imports through an outbound-only gateway for approved files.',
        action: 'Run SDK harness',
        capabilities: [
          'Run the local SDK harness inside the application boundary',
          'Accept approved files through an outbound-only gateway',
          'Parse and validate data on-device',
        ],
      },
    },
  },
] satisfies readonly DesktopProductModule[]);

export function desktopProductModuleCopy(
  module: DesktopProductModule,
  locale: DesktopLocale,
): DesktopProductModuleCopy {
  return module.copy[locale];
}

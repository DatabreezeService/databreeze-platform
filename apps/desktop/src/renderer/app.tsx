import wordmarkUrl from '@databreeze/design-tokens/brand/generated/web/navigation-wordmark-blue-204x50.png';
import { useEffect, useState } from 'react';
import type {
  DesktopLocale,
  DesktopSafeState,
  SidecarSafeStatus,
} from '../shared/desktop-contract-v1.ts';
import { FolderBindingPage } from './features/folders/folder-binding-page.tsx';
import { ProductModuleWorkbench } from './product-module-workbench.tsx';

type DesktopShellView = 'status' | 'folders';

const messages = {
  'vi-VN': {
    agentDetail: 'Tác nhân chỉ hiển thị trạng thái an toàn, không chứa dữ liệu công việc.',
    engine: 'Engine',
    engineStates: {
      failed: 'Engine gặp lỗi an toàn',
      'not-installed': 'Engine chưa được cài trong phần nền tảng này',
      ready: 'Engine đã sẵn sàng',
      starting: 'Engine đang khởi động',
      stopped: 'Engine đã dừng',
    },
    enrollment: 'Đăng ký thiết bị',
    locked: 'Tác nhân cục bộ đang khóa',
    mode: 'Chế độ dữ liệu',
    notEnrolled: 'Chưa đăng ký thiết bị',
    platformStatus: 'Trạng thái nền tảng cục bộ',
    privacy: 'Không có đường dẫn hoặc nội dung tệp nào được gửi tới giao diện này.',
    privacyDetail:
      'Mọi thao tác trong tương lai vẫn phải tuân thủ phạm vi đối tượng thuê, chế độ dữ liệu, bằng chứng và phê duyệt.',
    privacyTitle: 'Ranh giới riêng tư',
    skipWorkbench: 'Bỏ qua để đến bàn làm việc mô-đun',
    navStatus: 'Trạng thái nền tảng',
    navFolders: 'Thư mục dữ liệu',
    platformNavLabel: 'Điều hướng nền tảng',
    version: 'Phiên bản ứng dụng',
    workbench: {
      capabilitiesCaption:
        'Phạm vi Desktop được phê duyệt cho mô-đun này; chưa có thao tác nào được kết nối.',
      capabilitiesHeading: 'Khả năng trên Desktop',
      dataMode: 'Chế độ dữ liệu',
      engine: 'Trạng thái engine',
      engineNotInstalled: 'Engine chưa được cài',
      evidence: 'Bằng chứng, phê duyệt và nhật ký kiểm toán phải được giữ nguyên',
      governanceCaption:
        'Bàn làm việc này không cấp quyền đọc tệp, chạy lệnh hoặc vượt qua chính sách.',
      governanceHeading: 'Ranh giới quản trị',
      navigationLabel: 'Mô-đun sản phẩm',
      workspaceLabel: 'Bàn làm việc mô-đun',
      noData:
        'Chưa tải tập dữ liệu và sẽ không chạy thao tác tệp nào cho đến khi thiết bị, engine, quyền và API mô-đun đều sẵn sàng.',
      notConnected: 'API mô-đun chưa được kết nối',
      requirements: 'Yêu cầu',
      tenantScope: 'Phạm vi tổ chức và không gian làm việc luôn bắt buộc',
    },
  },
  en: {
    agentDetail: 'The agent shows safe status only and contains no workspace data.',
    engine: 'Engine',
    engineStates: {
      failed: 'Engine failed safely',
      'not-installed': 'The engine is not installed in this foundation slice',
      ready: 'Engine is ready',
      starting: 'Engine is starting',
      stopped: 'Engine is stopped',
    },
    enrollment: 'Device enrollment',
    locked: 'Local agent is locked',
    mode: 'Data mode',
    notEnrolled: 'Device is not enrolled',
    platformStatus: 'Local platform status',
    privacy: 'No file path or file content is sent to this interface.',
    privacyDetail:
      'Every future action must still honor tenant scope, data mode, evidence, and approval policy.',
    privacyTitle: 'Privacy boundary',
    skipWorkbench: 'Skip to module workbench',
    navStatus: 'Platform status',
    navFolders: 'Data folders',
    platformNavLabel: 'Platform navigation',
    version: 'Application version',
    workbench: {
      capabilitiesCaption:
        'The approved Desktop scope for this module; no operation is connected yet.',
      capabilitiesHeading: 'Desktop capabilities',
      dataMode: 'Data mode',
      engine: 'Engine status',
      engineNotInstalled: 'Engine not installed',
      evidence: 'Evidence, approvals, and audit history must be preserved',
      governanceCaption:
        'This workbench grants no file access, command execution, or policy bypass.',
      governanceHeading: 'Governance boundaries',
      navigationLabel: 'Product modules',
      workspaceLabel: 'Module workbench',
      noData:
        'No dataset is loaded and no file action will run until the device, engine, permissions, and module API are all ready.',
      notConnected: 'Module API not connected',
      requirements: 'Requirements',
      tenantScope: 'Organization and workspace scope remain mandatory',
    },
  },
} as const;

const initialState: DesktopSafeState = {
  applicationVersion: '0.0.0',
  dataMode: 'LOCAL',
  deviceState: 'locked',
  enrollmentState: 'not-enrolled',
  locale: 'vi-VN',
};
const initialSidecar: SidecarSafeStatus = {
  engineVersion: null,
  lifecycle: 'not-installed',
  protocolVersion: null,
};

export function DesktopApp() {
  const [locale, setLocale] = useState<DesktopLocale>('vi-VN');
  const [safeState, setSafeState] = useState(initialState);
  const [sidecarStatus, setSidecarStatus] = useState(initialSidecar);
  const [view, setView] = useState<DesktopShellView>('status');
  const copy = messages[locale];

  useEffect(() => {
    globalThis.document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    let active = true;
    const bridge = window.databreezeDesktop;
    if (bridge === undefined) return () => undefined;
    void Promise.all([bridge.v1.session.getSafeState(), bridge.v1.sidecar.getStatus()])
      .then(([nextState, nextSidecar]) => {
        if (!active) return;
        setSafeState(nextState);
        setSidecarStatus(nextSidecar);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="desktop-shell">
      <a className="skip-link" href="#module-workbench">
        {copy.skipWorkbench}
      </a>
      <header className="shell-header">
        <img className="wordmark" src={wordmarkUrl} alt="DataBreeze" />
        <nav className="shell-primary-nav" aria-label={copy.platformNavLabel}>
          <button
            aria-pressed={view === 'status'}
            className="locale-button"
            onClick={() => setView('status')}
            type="button"
          >
            {copy.navStatus}
          </button>
          <button
            aria-pressed={view === 'folders'}
            className="locale-button"
            onClick={() => setView('folders')}
            type="button"
          >
            {copy.navFolders}
          </button>
        </nav>
        <nav className="locale-switch" aria-label="Language / Ngôn ngữ">
          <button
            aria-pressed={locale === 'vi-VN'}
            className="locale-button"
            onClick={() => setLocale('vi-VN')}
            type="button"
          >
            Tiếng Việt
          </button>
          <button
            aria-pressed={locale === 'en'}
            className="locale-button"
            onClick={() => setLocale('en')}
            type="button"
          >
            English
          </button>
        </nav>
      </header>

      <main id="module-workbench">
        {view === 'folders' ? (
          <FolderBindingPage
            locale={locale}
            capabilityGrantId="00000000-0000-4000-8000-0000000000d1"
            organizationId="00000000-0000-4000-8000-000000000001"
            workspaceId="00000000-0000-4000-8000-000000000002"
          />
        ) : (
          <>
            <section className="agent-summary" aria-labelledby="agent-title">
              <div className="lock-symbol" aria-hidden="true">
                ×
              </div>
              <div>
                <h1 id="agent-title">{copy.locked}</h1>
                <p className="summary-copy">{copy.agentDetail}</p>
              </div>
            </section>

            <dl aria-label={copy.platformStatus} className="status-list">
              <div className="status-row">
                <dt>{copy.enrollment}</dt>
                <dd>
                  <span className="status-dot" aria-hidden="true" />
                  {copy.notEnrolled}
                </dd>
              </div>
              <div className="status-row">
                <dt>{copy.engine}</dt>
                <dd>
                  <span className="status-dot" aria-hidden="true" />
                  {copy.engineStates[sidecarStatus.lifecycle]}
                </dd>
              </div>
              <div className="status-row">
                <dt>{copy.mode}</dt>
                <dd>{safeState.dataMode}</dd>
              </div>
              <div className="status-row">
                <dt>{copy.version}</dt>
                <dd className="numeric">{safeState.applicationVersion}</dd>
              </div>
            </dl>

            <ProductModuleWorkbench
              copy={copy.workbench}
              locale={locale}
              safeState={safeState}
              sidecarStatus={sidecarStatus}
            />

            <aside className="privacy-note" aria-labelledby="privacy-title">
              <span className="privacy-icon" aria-hidden="true">
                i
              </span>
              <div>
                <h2 id="privacy-title">{copy.privacyTitle}</h2>
                <p>{copy.privacy}</p>
                <p>{copy.privacyDetail}</p>
              </div>
            </aside>
          </>
        )}
      </main>
    </div>
  );
}

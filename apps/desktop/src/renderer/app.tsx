import { useEffect, useState } from 'react';
import wordmarkUrl from '@databreeze/design-tokens/brand/generated/web/navigation-wordmark-blue-204x50.png';
import type {
  DesktopLocale,
  DesktopSafeState,
  FolderGrantState,
  SidecarSafeStatus,
} from '../shared/desktop-contract-v1.ts';

const messages = {
  'vi-VN': {
    agentDetail: 'Tác nhân chỉ hiển thị trạng thái an toàn, không chứa dữ liệu công việc.',
    engine: 'Engine',
    engineUnavailable: 'Engine chưa được cài trong phần nền tảng này',
    enrollment: 'Đăng ký thiết bị',
    locked: 'Tác nhân cục bộ đang khóa',
    mode: 'Chế độ dữ liệu',
    notEnrolled: 'Chưa đăng ký thiết bị',
    privacy: 'Không có đường dẫn hoặc nội dung tệp nào được gửi tới giao diện này.',
    privacyTitle: 'Ranh giới riêng tư',
    version: 'Phiên bản ứng dụng',
    folderTitle: 'Thư mục được cấp quyền',
    folderPick: 'Chọn thư mục để kiểm tra',
    folderGranted: 'Đã cấp quyền cục bộ',
    folderNotGranted: 'Chưa cấp quyền',
    folderFiles: 'Tệp đã phát hiện',
  },
  en: {
    agentDetail: 'The agent shows safe status only and contains no workspace data.',
    engine: 'Engine',
    engineUnavailable: 'The engine is not installed in this foundation slice',
    enrollment: 'Device enrollment',
    locked: 'Local agent is locked',
    mode: 'Data mode',
    notEnrolled: 'Device is not enrolled',
    privacy: 'No file path or file content is sent to this interface.',
    privacyTitle: 'Privacy boundary',
    version: 'Application version',
    folderTitle: 'Approved folder',
    folderPick: 'Choose a folder to audit',
    folderGranted: 'Local permission granted',
    folderNotGranted: 'No folder granted',
    folderFiles: 'Files discovered',
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
const initialFolder: FolderGrantState = {
  fileCount: 0,
  lastScanAt: null,
  status: 'not-granted',
};

export function DesktopApp() {
  const [locale, setLocale] = useState<DesktopLocale>('vi-VN');
  const [safeState, setSafeState] = useState(initialState);
  const [sidecarStatus, setSidecarStatus] = useState(initialSidecar);
  const [folderState, setFolderState] = useState(initialFolder);
  const copy = messages[locale];

  async function grantFolder(): Promise<void> {
    const folder = window.databreezeDesktop?.v1.folder;
    if (folder === undefined) return;
    try {
      setFolderState(await folder.grant());
    } catch {
      setFolderState(initialFolder);
    }
  }

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
    <main className="desktop-shell">
      <header className="shell-header">
        <img className="wordmark" src={wordmarkUrl} alt="DataBreeze" />
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

      <section className="agent-summary" aria-labelledby="agent-title">
        <div className="lock-symbol" aria-hidden="true">
          ×
        </div>
        <div>
          <h1 id="agent-title">{copy.locked}</h1>
          <p className="summary-copy">{copy.agentDetail}</p>
        </div>
      </section>

      <dl className="status-list">
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
            {copy.engineUnavailable}
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

      <section className="folder-grant" aria-labelledby="folder-title">
        <div>
          <h2 id="folder-title">{copy.folderTitle}</h2>
          <p>{folderState.status === 'granted' ? copy.folderGranted : copy.folderNotGranted}</p>
        </div>
        <div className="folder-grant__actions">
          <span className="numeric">
            {copy.folderFiles}: {new Intl.NumberFormat(locale).format(folderState.fileCount)}
          </span>
          <button className="locale-button" onClick={() => void grantFolder()} type="button">
            {copy.folderPick}
          </button>
        </div>
      </section>

      <aside className="privacy-note" aria-labelledby="privacy-title">
        <span className="privacy-icon" aria-hidden="true">
          i
        </span>
        <div>
          <h2 id="privacy-title">{copy.privacyTitle}</h2>
          <p>{copy.privacy}</p>
        </div>
      </aside>
      <span className="visually-hidden">{sidecarStatus.lifecycle}</span>
    </main>
  );
}

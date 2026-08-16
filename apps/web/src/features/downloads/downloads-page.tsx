import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

import { normalizeRouteLocale } from '../../app/locale-context.tsx';
import {
  downloadArtifactForPlatformV1,
  EMPTY_DOWNLOAD_RELEASE_MANIFEST_V1,
  localizedDownloadsPathV1,
  type DownloadPlatformV1,
  type DownloadReleaseManifestV1,
} from './downloads-release-manifest.ts';
import '../../styles/downloads-page.css';

const PLATFORM_ORDER: readonly DownloadPlatformV1[] = ['windows', 'android'];

const COPY = {
  'vi-VN': {
    pageLabel: 'Trung tâm tải xuống DataBreeze',
    homeLabel: 'DataBreeze, về trang chủ',
    primaryNavigation: 'Điều hướng chính',
    product: 'Sản phẩm',
    verifiedAi: 'AI có kiểm chứng',
    dataModes: 'Chế độ dữ liệu',
    apps: 'Ứng dụng',
    pricing: 'Bảng giá',
    signIn: 'Đăng nhập',
    explore: 'Khám phá',
    language: 'English',
    heroEyebrow: 'Ứng dụng Desktop · Android',
    heroTitleBrand: 'DataBreeze',
    heroTitleLine: 'trên mọi thiết bị.',
    introduction:
      'Làm việc với dữ liệu cục bộ trên Desktop. Chụp và đồng bộ tại hiện trường trên Android. Cùng một không gian, cùng một dấu vết kiểm chứng.',
    viewReleases: 'Xem bản phát hành',
    viewVerification: 'Cách chúng tôi xác minh',
    liveStatus: 'Kênh stable đang được chuẩn bị',
    desktopScene: 'Desktop workspace',
    androidScene: 'Android capture',
    releaseIndex: '01 / BẢN PHÁT HÀNH',
    releaseEyebrow: 'Chọn nền tảng',
    releaseTitle: 'Bản phát hành theo thiết bị.',
    releaseDescription:
      'Chọn thiết bị để xem kênh phân phối, trạng thái và bằng chứng đi kèm gói cài đặt.',
    selectPlatform: 'Chọn nền tảng',
    desktop: 'Desktop',
    desktopDetail: 'Windows · dữ liệu tại chỗ',
    android: 'Android',
    androidDetail: 'Di động · vận hành hiện trường',
    windowsTitle: 'DataBreeze cho Windows',
    windowsDescription:
      'Không gian làm việc lai cho dữ liệu đám mây, tệp cục bộ và bằng chứng trên cùng một màn hình.',
    androidTitle: 'DataBreeze cho Android',
    androidDescription:
      'Ứng dụng gọn cho việc chụp, kiểm tra và đồng bộ công việc ngay tại hiện trường.',
    releasePreparing: 'Đang chuẩn bị bản phát hành',
    releaseReady: 'Gói đã sẵn sàng',
    notPublished: 'Chưa phát hành',
    download: 'Tải bản cài đặt',
    openStore: 'Mở Google Play',
    channel: 'Kênh phân phối',
    direct: 'Tải trực tiếp',
    googlePlay: 'Google Play',
    version: 'Phiên bản',
    artifact: 'Gói phát hành',
    checksum: 'Hash SHA-256',
    signature: 'Chữ ký',
    manifest: 'Manifest',
    pending: 'Chờ manifest đã ký',
    nextStep: 'Nút tải xuống sẽ mở khi gói được ký và công bố lên kho phát hành an toàn.',
    readyNote: 'Kiểm tra hash và chữ ký trước khi cài đặt.',
    trustIndex: '02 / KIỂM CHỨNG',
    trustEyebrow: 'Không chỉ là một file tải xuống',
    trustTitle: 'Một gói cài đặt. Ba lớp kiểm tra.',
    trustDescription:
      'Mỗi bản phát hành đi từ build đã ký đến manifest bất biến trước khi xuất hiện trên trang này.',
    build: 'Build & ký',
    buildDetail: 'Đóng gói đúng nền tảng và ký bằng khóa phát hành.',
    publish: 'Công bố manifest',
    publishDetail: 'Ghim phiên bản, kích thước, checksum và chữ ký.',
    verify: 'Xác minh & cài đặt',
    verifyDetail: 'Thiết bị nhận đúng artifact đã được công bố.',
    supportEyebrow: 'Bạn chưa cần cài đặt?',
    supportTitle: 'Bắt đầu ngay trên web.',
    supportDescription:
      'Đăng nhập vào không gian làm việc hoặc tạo tài khoản mới cho nhóm của bạn.',
    createAccount: 'Tạo tài khoản',
    footerLabel: 'Ứng dụng DataBreeze',
  },
  en: {
    pageLabel: 'DataBreeze downloads',
    homeLabel: 'DataBreeze, back to home',
    primaryNavigation: 'Primary navigation',
    product: 'Product',
    verifiedAi: 'Verified AI',
    dataModes: 'Data modes',
    apps: 'Apps',
    pricing: 'Pricing',
    signIn: 'Sign in',
    explore: 'Explore',
    language: 'Tiếng Việt',
    heroEyebrow: 'Desktop · Android apps',
    heroTitleBrand: 'DataBreeze',
    heroTitleLine: 'on every device.',
    introduction:
      'Work with local data on Desktop. Capture and sync in the field on Android. One workspace, one verifiable trail.',
    viewReleases: 'View releases',
    viewVerification: 'How verification works',
    liveStatus: 'Stable channel is being prepared',
    desktopScene: 'Desktop workspace',
    androidScene: 'Android capture',
    releaseIndex: '01 / RELEASES',
    releaseEyebrow: 'Choose a platform',
    releaseTitle: 'A release for each device.',
    releaseDescription:
      'Choose a device to inspect its distribution channel, status, and installation evidence.',
    selectPlatform: 'Choose a platform',
    desktop: 'Desktop',
    desktopDetail: 'Windows · local data',
    android: 'Android',
    androidDetail: 'Mobile · field operations',
    windowsTitle: 'DataBreeze for Windows',
    windowsDescription:
      'A hybrid workspace for cloud data, local files, and evidence on the same screen.',
    androidTitle: 'DataBreeze for Android',
    androidDescription:
      'A focused app for capturing, checking, and syncing work directly in the field.',
    releasePreparing: 'Release preparing',
    releaseReady: 'Artifact ready',
    notPublished: 'Not published',
    download: 'Download installer',
    openStore: 'Open Google Play',
    channel: 'Distribution channel',
    direct: 'Direct download',
    googlePlay: 'Google Play',
    version: 'Version',
    artifact: 'Release artifact',
    checksum: 'SHA-256 hash',
    signature: 'Signature',
    manifest: 'Manifest',
    pending: 'Waiting for signed manifest',
    nextStep: 'The download opens after the artifact is signed and published to the secure store.',
    readyNote: 'Verify the hash and signature before installation.',
    trustIndex: '02 / VERIFICATION',
    trustEyebrow: 'More than a download',
    trustTitle: 'One installer. Three checks.',
    trustDescription:
      'Every release moves from a signed build to an immutable manifest before it appears here.',
    build: 'Build & sign',
    buildDetail: 'Package for the target platform and sign with the release key.',
    publish: 'Publish manifest',
    publishDetail: 'Pin the version, size, checksum, and signature.',
    verify: 'Verify & install',
    verifyDetail: 'The device receives the exact artifact that was published.',
    supportEyebrow: 'No installation needed?',
    supportTitle: 'Start on the web.',
    supportDescription: 'Sign in to your workspace or create a new account for your team.',
    createAccount: 'Create an account',
    footerLabel: 'DataBreeze apps',
  },
} as const satisfies Record<SupportedLocaleV1, Record<string, string>>;

function platformCopy(locale: SupportedLocaleV1, platform: DownloadPlatformV1) {
  const copy = COPY[locale];
  return platform === 'windows'
    ? {
        name: copy.desktop,
        detail: copy.desktopDetail,
        title: copy.windowsTitle,
        description: copy.windowsDescription,
      }
    : {
        name: copy.android,
        detail: copy.androidDetail,
        title: copy.androidTitle,
        description: copy.androidDescription,
      };
}

function otherLocale(locale: SupportedLocaleV1): SupportedLocaleV1 {
  return locale === 'vi-VN' ? 'en' : 'vi-VN';
}

function PlatformGlyph({ platform }: { readonly platform: DownloadPlatformV1 }) {
  return platform === 'windows' ? (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M5 8.5 21.7 6v16H5V8.5Zm19.3-2.9L43 3v19H24.3V5.6ZM5 25h16.7v16L5 38.5V25Zm19.3 0H43v19l-18.7-2.6V25Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M15.2 16.4h17.6A4.2 4.2 0 0 1 37 20.6V37a4 4 0 0 1-4 4h-2v4h-4v-4h-6v4h-4v-4h-2a4 4 0 0 1-4-4V20.6a4.2 4.2 0 0 1 4.2-4.2Z" />
      <path d="m14.8 14.6-3-4.8 2-1.2 3.2 5.1a16 16 0 0 1 14 0l3.2-5.1 2 1.2-3 4.8H14.8Z" />
      <circle cx="18" cy="22.5" r="1.5" fill="#03040f" />
      <circle cx="30" cy="22.5" r="1.5" fill="#03040f" />
    </svg>
  );
}

function DeviceScene({
  desktopLabel,
  androidLabel,
}: {
  readonly desktopLabel: string;
  readonly androidLabel: string;
}) {
  return (
    <div className="downloads-device-stage" aria-hidden="true">
      <div className="downloads-device-stage__axis" />
      <div className="downloads-device downloads-device--desktop">
        <div className="downloads-device__topbar">
          <span className="downloads-device__brand">
            <img src="/landing/assets/databreeze-mark.png" alt="" />
            <span>{desktopLabel}</span>
          </span>
          <span className="downloads-device__sync">
            <i /> LIVE DATA
          </span>
        </div>
        <div className="downloads-device__body">
          <div className="downloads-device__rail">
            <i className="is-active" />
            <i />
            <i />
          </div>
          <div className="downloads-device__workspace">
            <div className="downloads-device__heading">
              <span>
                <small>WORKSPACE / OVERVIEW</small>
                <strong>Nhịp tăng trưởng</strong>
              </span>
              <em>STABLE</em>
            </div>
            <div className="downloads-device__metrics">
              <span>
                <small>DOANH THU</small>
                <strong>2,49 tỷ ₫</strong>
              </span>
              <span>
                <small>ĐƠN HÀNG</small>
                <strong>12.847</strong>
              </span>
              <span>
                <small>BIÊN LỢI NHUẬN</small>
                <strong>36,8%</strong>
              </span>
            </div>
            <div className="downloads-device__chart">
              <svg viewBox="0 0 540 176" preserveAspectRatio="none">
                <path className="downloads-device__chart-grid" d="M0 35H540M0 88H540M0 141H540" />
                <path
                  className="downloads-device__chart-line"
                  d="M0 139 C42 130 62 136 96 115 S151 120 185 93 S248 105 286 73 S349 82 391 51 S445 67 486 38 S520 30 540 28"
                />
                <path
                  className="downloads-device__chart-fill"
                  d="M0 139 C42 130 62 136 96 115 S151 120 185 93 S248 105 286 73 S349 82 391 51 S445 67 486 38 S520 30 540 28V176H0Z"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="downloads-device downloads-device--phone">
        <div className="downloads-phone__sensor" />
        <div className="downloads-phone__brand">
          <img src="/landing/assets/databreeze-mark.png" alt="" />
          <span>{androidLabel}</span>
        </div>
        <div className="downloads-phone__capture">
          <span className="downloads-phone__scan" />
          <i />
          <i />
          <i />
          <i />
          <b>CAPTURE / 04</b>
        </div>
        <div className="downloads-phone__status">
          <span>
            <i /> SYNC READY
          </span>
          <b>04</b>
        </div>
      </div>
    </div>
  );
}

export function DownloadsPage({
  locale,
  manifest = EMPTY_DOWNLOAD_RELEASE_MANIFEST_V1,
}: {
  readonly locale: SupportedLocaleV1;
  readonly manifest?: DownloadReleaseManifestV1;
}) {
  const copy = COPY[locale];
  const [selectedPlatform, setSelectedPlatform] = useState<DownloadPlatformV1>('windows');
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const selectedArtifact = downloadArtifactForPlatformV1(manifest, selectedPlatform);
  const selectedPlatformCopy = platformCopy(locale, selectedPlatform);
  const alternateLocale = otherLocale(locale);

  useEffect(() => {
    const updateHeader = () => setHeaderScrolled(window.scrollY > 24);
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
    return () => window.removeEventListener('scroll', updateHeader);
  }, []);

  return (
    <div className="downloads-page">
      <header
        className={`downloads-site-header${headerScrolled ? ' is-scrolled' : ''}`}
        data-downloads-header
      >
        <a className="downloads-wordmark" href={`/${locale}`} aria-label={copy.homeLabel}>
          <img src="/landing/assets/databreeze-mark.png" alt="" />
          <span>DataBreeze</span>
        </a>

        <nav className="downloads-site-nav" aria-label={copy.primaryNavigation}>
          <a href={`/${locale}#flow`}>{copy.product}</a>
          <a href={`/${locale}#intelligence`}>{copy.verifiedAi}</a>
          <a href={`/${locale}#modes`}>{copy.dataModes}</a>
          <a href={localizedDownloadsPathV1(locale)} aria-current="page">
            {copy.apps}
          </a>
          <a href={`/${locale}#pricing`}>{copy.pricing}</a>
        </nav>

        <div className="downloads-site-actions">
          <a className="downloads-header-action" href={`/${locale}/sign-in`}>
            <span>{copy.signIn}</span>
            <span aria-hidden="true">↗</span>
          </a>
          <a className="downloads-header-action" href={`/${locale}#experience`}>
            <span>{copy.explore}</span>
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>

      <main className="downloads-main" aria-label={copy.pageLabel}>
        <section className="downloads-hero" aria-labelledby="downloads-hero-title">
          <div className="downloads-hero__matrix" aria-hidden="true" />
          <div className="downloads-hero__inner">
            <div className="downloads-hero__copy">
              <p className="downloads-hero__eyebrow">
                <span aria-hidden="true" />
                {copy.heroEyebrow}
              </p>
              <h1 id="downloads-hero-title">
                <span>{copy.heroTitleBrand}</span> <span>{copy.heroTitleLine}</span>
              </h1>
              <p className="downloads-hero__introduction">{copy.introduction}</p>
              <div className="downloads-hero__actions">
                <a
                  className="downloads-button downloads-button--primary"
                  href="#downloads-releases"
                >
                  <span>{copy.viewReleases}</span>
                  <span aria-hidden="true">↓</span>
                </a>
                <a
                  className="downloads-button downloads-button--ghost"
                  href="#downloads-verification"
                >
                  <span>{copy.viewVerification}</span>
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
              <p className="downloads-hero__status">
                <span aria-hidden="true" />
                {copy.liveStatus}
              </p>
            </div>

            <DeviceScene desktopLabel={copy.desktopScene} androidLabel={copy.androidScene} />
          </div>
        </section>

        <section
          className="downloads-release"
          id="downloads-releases"
          aria-labelledby="downloads-release-title"
        >
          <div className="downloads-section-heading">
            <p className="downloads-section-index">{copy.releaseIndex}</p>
            <div>
              <p className="downloads-section-eyebrow">{copy.releaseEyebrow}</p>
              <h2 id="downloads-release-title">{copy.releaseTitle}</h2>
              <p className="downloads-section-description">{copy.releaseDescription}</p>
            </div>
          </div>

          <div className="downloads-release-frame">
            <div className="downloads-release-frame__meta" aria-label={copy.manifest}>
              <span>RELEASE.MANIFEST/V{manifest.schemaVersion}</span>
              <span>CHANNEL / {manifest.channel.toUpperCase()}</span>
              <span>{manifest.generatedAt === null ? copy.pending : manifest.generatedAt}</span>
            </div>

            <div
              className="downloads-platform-picker"
              role="tablist"
              aria-label={copy.selectPlatform}
            >
              {PLATFORM_ORDER.map((platform, index) => {
                const item = platformCopy(locale, platform);
                const isSelected = platform === selectedPlatform;
                return (
                  <button
                    className={`downloads-platform-tab${isSelected ? ' downloads-platform-tab--selected' : ''}`}
                    id={`downloads-tab-${platform}`}
                    key={platform}
                    role="tab"
                    aria-controls="downloads-release-panel"
                    aria-selected={isSelected}
                    type="button"
                    onClick={() => setSelectedPlatform(platform)}
                  >
                    <span className="downloads-platform-tab__number">0{index + 1}</span>
                    <span className="downloads-platform-tab__glyph">
                      <PlatformGlyph platform={platform} />
                    </span>
                    <span className="downloads-platform-tab__copy">
                      <strong>{item.name}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <span className="downloads-platform-tab__arrow" aria-hidden="true">
                      ↗
                    </span>
                  </button>
                );
              })}
            </div>

            <article
              className="downloads-release-panel"
              id="downloads-release-panel"
              key={selectedPlatform}
              role="tabpanel"
              aria-labelledby={`downloads-tab-${selectedPlatform}`}
              tabIndex={0}
            >
              <div className="downloads-release-panel__main">
                <div className="downloads-release-panel__identity">
                  <span className="downloads-release-panel__glyph">
                    <PlatformGlyph platform={selectedPlatform} />
                  </span>
                  <div>
                    <p>{selectedPlatformCopy.name} / DATA BREEZE</p>
                    <h3>{selectedPlatformCopy.title}</h3>
                    <p>{selectedPlatformCopy.description}</p>
                  </div>
                </div>

                <div className="downloads-release-panel__action">
                  <span
                    className={`downloads-release-status${
                      selectedArtifact.availability === 'available'
                        ? ' downloads-release-status--ready'
                        : ''
                    }`}
                  >
                    <i aria-hidden="true" />
                    {selectedArtifact.availability === 'available'
                      ? copy.releaseReady
                      : copy.releasePreparing}
                  </span>

                  {selectedArtifact.availability === 'available' ? (
                    <a
                      className="downloads-button downloads-button--primary"
                      href={selectedArtifact.downloadUrl}
                    >
                      <span>
                        {selectedArtifact.distribution === 'google-play'
                          ? copy.openStore
                          : copy.download}
                      </span>
                      <span aria-hidden="true">↗</span>
                    </a>
                  ) : (
                    <button
                      className="downloads-button downloads-button--disabled"
                      disabled
                      type="button"
                    >
                      {copy.releasePreparing}
                    </button>
                  )}
                  <p>
                    {selectedArtifact.availability === 'available' ? copy.readyNote : copy.nextStep}
                  </p>
                </div>
              </div>

              <dl className="downloads-release-facts">
                <div>
                  <dt>{copy.channel}</dt>
                  <dd>
                    {selectedArtifact.distribution === 'google-play'
                      ? copy.googlePlay
                      : copy.direct}
                  </dd>
                </div>
                <div>
                  <dt>{copy.version}</dt>
                  <dd>
                    {selectedArtifact.availability === 'available'
                      ? selectedArtifact.version
                      : copy.notPublished}
                  </dd>
                </div>
                <div>
                  <dt>{copy.artifact}</dt>
                  <dd>
                    {selectedArtifact.availability === 'available'
                      ? selectedArtifact.sizeLabel
                      : copy.pending}
                  </dd>
                </div>
                <div>
                  <dt>{copy.checksum}</dt>
                  <dd>
                    {selectedArtifact.availability === 'available' ? (
                      <a href={selectedArtifact.checksumUrl}>SHA-256</a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{copy.signature}</dt>
                  <dd>
                    {selectedArtifact.availability === 'available' ? (
                      <a href={selectedArtifact.signatureUrl}>Verified</a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              </dl>
            </article>
          </div>
        </section>

        <section
          className="downloads-verification"
          id="downloads-verification"
          aria-labelledby="downloads-verification-title"
        >
          <div className="downloads-verification__intro">
            <p className="downloads-section-index">{copy.trustIndex}</p>
            <p className="downloads-section-eyebrow">{copy.trustEyebrow}</p>
            <h2 id="downloads-verification-title">{copy.trustTitle}</h2>
            <p className="downloads-section-description">{copy.trustDescription}</p>
          </div>

          <ol className="downloads-verification__steps">
            <li>
              <span>01</span>
              <div>
                <strong>{copy.build}</strong>
                <p>{copy.buildDetail}</p>
              </div>
              <b aria-hidden="true">→</b>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>{copy.publish}</strong>
                <p>{copy.publishDetail}</p>
              </div>
              <b aria-hidden="true">→</b>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>{copy.verify}</strong>
                <p>{copy.verifyDetail}</p>
              </div>
              <b aria-hidden="true">✓</b>
            </li>
          </ol>
        </section>

        <section className="downloads-support" aria-labelledby="downloads-support-title">
          <p className="downloads-section-eyebrow">{copy.supportEyebrow}</p>
          <h2 id="downloads-support-title">{copy.supportTitle}</h2>
          <p>{copy.supportDescription}</p>
          <div className="downloads-support__actions">
            <a className="downloads-button downloads-button--primary" href={`/${locale}/sign-in`}>
              <span>{copy.signIn}</span>
              <span aria-hidden="true">↗</span>
            </a>
            <a className="downloads-button downloads-button--ghost" href={`/${locale}/register`}>
              <span>{copy.createAccount}</span>
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </section>
      </main>

      <footer className="downloads-footer">
        <span>© DataBreeze</span>
        <span>{copy.footerLabel}</span>
        <a href={localizedDownloadsPathV1(alternateLocale)}>{copy.language}</a>
      </footer>
    </div>
  );
}

export function DownloadsRoutePage() {
  const { locale: routeLocale } = useParams();
  return <DownloadsPage locale={normalizeRouteLocale(routeLocale)} />;
}

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';
import wordmarkUrl from '@databreeze/design-tokens/brand/generated/web/navigation-wordmark-blue-204x50.png';

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
    signIn: 'Đăng nhập',
    language: 'English',
    pageLabel: 'Trung tâm tải xuống DataBreeze',
    eyebrow: 'Trung tâm phát hành · 01',
    title: 'DataBreeze, trên đúng thiết bị của bạn.',
    introduction:
      'Chọn nền tảng để xem kênh phát hành, cách xác minh và trạng thái bản build mới nhất.',
    liveStatus: 'Kênh phát hành đang được chuẩn bị',
    releaseEyebrow: 'Bản phát hành có kiểm chứng',
    releaseTitle: 'Bản phát hành, có dấu vết rõ ràng.',
    releaseDescription:
      'Mỗi gói cài đặt sẽ đi cùng manifest, hash và chữ ký để bạn biết chính xác mình đang cài gì.',
    selectPlatform: 'Chọn nền tảng',
    desktop: 'Desktop',
    desktopDetail: 'Windows · làm việc tại chỗ',
    android: 'Android',
    androidDetail: 'Ứng dụng di động · vận hành hiện trường',
    windowsTitle: 'DataBreeze cho Windows',
    windowsDescription:
      'Không gian làm việc lai cho các nhóm cần dữ liệu, tệp cục bộ và bằng chứng ở cùng một nơi.',
    androidTitle: 'DataBreeze cho Android',
    androidDescription:
      'Ứng dụng gọn cho các nhiệm vụ cần chụp, kiểm tra và đồng bộ ngay tại hiện trường.',
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
    signature: 'Chữ ký phát hành',
    pending: 'Chờ manifest đã ký',
    nextStep: 'Sẽ xuất hiện khi bản phát hành được ký và đẩy lên kho an toàn.',
    readyNote: 'Luôn kiểm tra hash và chữ ký trước khi cài đặt.',
    flowEyebrow: 'Release path',
    flowTitle: 'Một đường đi gọn từ build đến thiết bị.',
    flowDescription:
      'Trang này chỉ trỏ đến artifact đã được phát hành. S3 giữ file riêng tư; CloudFront phân phối đúng bản đã công bố.',
    build: 'Build & sign',
    buildDetail: 'Đóng gói, ký và tạo checksum.',
    publish: 'Publish manifest',
    publishDetail: 'Công bố version bất biến cùng metadata.',
    verify: 'Verify & install',
    verifyDetail: 'Thiết bị nhận đúng file đã được xác minh.',
    supportEyebrow: 'Cần một tay?',
    supportTitle: 'Chúng tôi sẽ giúp bạn đi vào không gian làm việc.',
    supportDescription: 'Đăng nhập để tiếp tục hoặc tạo tài khoản mới cho nhóm của bạn.',
    createAccount: 'Tạo tài khoản',
    statusReady: 'READY',
    statusWaiting: 'WAITING',
    platformSignal: 'PLATFORM SIGNAL',
    signedRelease: 'SIGNED RELEASE',
    secureStorage: 'PRIVATE ARTIFACT STORAGE',
  },
  en: {
    signIn: 'Sign in',
    language: 'Tiếng Việt',
    pageLabel: 'DataBreeze downloads',
    eyebrow: 'Release control · 01',
    title: 'DataBreeze, wherever your data moves.',
    introduction:
      'Choose a platform to see its release channel, verification trail, and the latest build status.',
    liveStatus: 'Release channel is being prepared',
    releaseEyebrow: 'Verified releases',
    releaseTitle: 'A release trail you can trust.',
    releaseDescription:
      'Every installer will ship with a manifest, hash, and signature so you know exactly what you are installing.',
    selectPlatform: 'Choose a platform',
    desktop: 'Desktop',
    desktopDetail: 'Windows · focused work',
    android: 'Android',
    androidDetail: 'Mobile app · field operations',
    windowsTitle: 'DataBreeze for Windows',
    windowsDescription:
      'A hybrid workspace for teams that need data, local files, and evidence in one place.',
    androidTitle: 'DataBreeze for Android',
    androidDescription:
      'A focused mobile app for capturing, checking, and syncing work in the field.',
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
    signature: 'Release signature',
    pending: 'Waiting for signed manifest',
    nextStep: 'It will appear once the release is signed and published to the secure store.',
    readyNote: 'Always verify the hash and signature before installing.',
    flowEyebrow: 'Release path',
    flowTitle: 'A clean line from build to device.',
    flowDescription:
      'This page points only to published artifacts. S3 keeps the files private; CloudFront distributes the exact version that was released.',
    build: 'Build & sign',
    buildDetail: 'Package, sign, and create checksums.',
    publish: 'Publish manifest',
    publishDetail: 'Publish an immutable version with metadata.',
    verify: 'Verify & install',
    verifyDetail: 'The device receives the verified file.',
    supportEyebrow: 'Need a hand?',
    supportTitle: 'We will help you get into the workspace.',
    supportDescription: 'Sign in to continue or create a new account for your team.',
    createAccount: 'Create an account',
    statusReady: 'READY',
    statusWaiting: 'WAITING',
    platformSignal: 'PLATFORM SIGNAL',
    signedRelease: 'SIGNED RELEASE',
    secureStorage: 'PRIVATE ARTIFACT STORAGE',
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

export function DownloadsPage({
  locale,
  manifest = EMPTY_DOWNLOAD_RELEASE_MANIFEST_V1,
}: {
  readonly locale: SupportedLocaleV1;
  readonly manifest?: DownloadReleaseManifestV1;
}) {
  const copy = COPY[locale];
  const [selectedPlatform, setSelectedPlatform] = useState<DownloadPlatformV1>('windows');
  const selectedArtifact = downloadArtifactForPlatformV1(manifest, selectedPlatform);
  const selectedPlatformCopy = platformCopy(locale, selectedPlatform);
  const alternateLocale = otherLocale(locale);
  const currentDownloadPath = localizedDownloadsPathV1(locale);

  return (
    <main className="downloads-page" aria-label={copy.pageLabel}>
      <div className="downloads-page__grid" aria-hidden="true" />
      <div className="downloads-page__orb downloads-page__orb--one" aria-hidden="true" />
      <div className="downloads-page__orb downloads-page__orb--two" aria-hidden="true" />

      <header className="downloads-header">
        <a
          className="downloads-header__brand"
          href={currentDownloadPath}
          aria-label={copy.pageLabel}
        >
          <img src={wordmarkUrl} alt="DataBreeze" width={204} height={50} />
          <span>{copy.eyebrow}</span>
        </a>
        <nav
          className="downloads-header__nav"
          aria-label={locale === 'vi-VN' ? 'Điều hướng phụ' : 'Secondary navigation'}
        >
          <a href={`/${locale}/sign-in`}>{copy.signIn}</a>
          <a href={localizedDownloadsPathV1(alternateLocale)}>{copy.language}</a>
        </nav>
      </header>

      <section className="downloads-hero" aria-labelledby="downloads-hero-title">
        <div className="downloads-hero__copy">
          <p className="downloads-eyebrow">
            <span className="downloads-status-dot" />
            {copy.liveStatus}
          </p>
          <h1 id="downloads-hero-title">{copy.title}</h1>
          <p className="downloads-hero__introduction">{copy.introduction}</p>
          <div className="downloads-hero__metadata" aria-label={copy.platformSignal}>
            <span>
              <b>01</b> {copy.platformSignal}
            </span>
            <span>
              <b>02</b> {copy.signedRelease}
            </span>
            <span>
              <b>03</b> {copy.secureStorage}
            </span>
          </div>
        </div>

        <div className="downloads-signal" aria-label={copy.signedRelease}>
          <div className="downloads-signal__topline">
            <span>release.manifest/v1</span>
            <span className="downloads-signal__state">{copy.statusWaiting}</span>
          </div>
          <div className="downloads-signal__route" aria-hidden="true">
            <span className="downloads-signal__node downloads-signal__node--active">01</span>
            <span className="downloads-signal__line" />
            <span className="downloads-signal__node">02</span>
            <span className="downloads-signal__line" />
            <span className="downloads-signal__node">03</span>
          </div>
          <div className="downloads-signal__labels" aria-hidden="true">
            <span>build</span>
            <span>sign</span>
            <span>ship</span>
          </div>
          <p>{copy.nextStep}</p>
          <div className="downloads-signal__footer">
            <span>CHANNEL / {manifest.channel.toUpperCase()}</span>
            <span>{manifest.generatedAt === null ? '—' : manifest.generatedAt}</span>
          </div>
        </div>
      </section>

      <section className="downloads-release" aria-labelledby="downloads-release-title">
        <div className="downloads-section-intro">
          <p className="downloads-eyebrow">{copy.releaseEyebrow}</p>
          <h2 id="downloads-release-title">{copy.releaseTitle}</h2>
          <p>{copy.releaseDescription}</p>
        </div>

        <div className="downloads-release__workspace">
          <div
            className="downloads-platform-picker"
            role="tablist"
            aria-label={copy.selectPlatform}
          >
            {PLATFORM_ORDER.map((platform) => {
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
                  <span className="downloads-platform-tab__index">
                    0{PLATFORM_ORDER.indexOf(platform) + 1}
                  </span>
                  <span>
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
            role="tabpanel"
            aria-labelledby={`downloads-tab-${selectedPlatform}`}
            tabIndex={0}
          >
            <div className="downloads-release-panel__heading">
              <div>
                <p className="downloads-panel-code">
                  {selectedPlatformCopy.name} / RELEASE CHANNEL
                </p>
                <h3>{selectedPlatformCopy.title}</h3>
                <p>{selectedPlatformCopy.description}</p>
              </div>
              <span
                className={`downloads-release-status${selectedArtifact.availability === 'available' ? ' downloads-release-status--ready' : ''}`}
              >
                <span className="downloads-status-dot" />
                {selectedArtifact.availability === 'available'
                  ? copy.releaseReady
                  : copy.releasePreparing}
              </span>
            </div>

            <div className="downloads-release-panel__action-row">
              {selectedArtifact.availability === 'available' ? (
                <a className="downloads-primary-action" href={selectedArtifact.downloadUrl}>
                  {selectedArtifact.distribution === 'google-play' ? copy.openStore : copy.download}
                  <span aria-hidden="true">↗</span>
                </a>
              ) : (
                <button
                  className="downloads-primary-action downloads-primary-action--disabled"
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

            <dl className="downloads-release-facts">
              <div>
                <dt>{copy.channel}</dt>
                <dd>
                  {selectedArtifact.distribution === 'google-play' ? copy.googlePlay : copy.direct}
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

      <section className="downloads-flow" aria-labelledby="downloads-flow-title">
        <div className="downloads-section-intro downloads-section-intro--flow">
          <p className="downloads-eyebrow">{copy.flowEyebrow}</p>
          <h2 id="downloads-flow-title">{copy.flowTitle}</h2>
          <p>{copy.flowDescription}</p>
        </div>
        <ol className="downloads-flow__list">
          <li>
            <span>01</span>
            <div>
              <strong>{copy.build}</strong>
              <p>{copy.buildDetail}</p>
            </div>
            <b>→</b>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>{copy.publish}</strong>
              <p>{copy.publishDetail}</p>
            </div>
            <b>→</b>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>{copy.verify}</strong>
              <p>{copy.verifyDetail}</p>
            </div>
            <b>✓</b>
          </li>
        </ol>
      </section>

      <section className="downloads-support" aria-labelledby="downloads-support-title">
        <div>
          <p className="downloads-eyebrow">{copy.supportEyebrow}</p>
          <h2 id="downloads-support-title">{copy.supportTitle}</h2>
          <p>{copy.supportDescription}</p>
        </div>
        <div className="downloads-support__actions">
          <a className="downloads-primary-action" href={`/${locale}/register`}>
            {copy.createAccount}
            <span aria-hidden="true">↗</span>
          </a>
          <a className="downloads-text-action" href={`/${locale}/sign-in`}>
            {copy.signIn}
            <span aria-hidden="true">→</span>
          </a>
        </div>
      </section>

      <footer className="downloads-footer">
        <span>© DataBreeze</span>
        <span>{copy.eyebrow}</span>
      </footer>
    </main>
  );
}

export function DownloadsRoutePage() {
  const { locale: routeLocale } = useParams();
  return <DownloadsPage locale={normalizeRouteLocale(routeLocale)} />;
}

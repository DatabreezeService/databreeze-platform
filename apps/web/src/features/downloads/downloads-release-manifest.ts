import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

export type DownloadPlatformV1 = 'windows' | 'android';
export type DownloadDistributionV1 = 'direct' | 'google-play';

interface DownloadArtifactBaseV1 {
  readonly platform: DownloadPlatformV1;
  readonly distribution: DownloadDistributionV1;
}

export interface PreparingDownloadArtifactV1 extends DownloadArtifactBaseV1 {
  readonly availability: 'preparing';
}

export interface AvailableDownloadArtifactV1 extends DownloadArtifactBaseV1 {
  readonly availability: 'available';
  readonly version: string;
  readonly releasedAt: string;
  readonly sizeLabel: string;
  readonly downloadUrl: string;
  readonly checksumUrl: string;
  readonly signatureUrl: string;
}

export type DownloadArtifactV1 = PreparingDownloadArtifactV1 | AvailableDownloadArtifactV1;

export interface DownloadReleaseManifestV1 {
  readonly schemaVersion: 1;
  readonly generatedAt: string | null;
  readonly channel: 'stable' | 'preview';
  readonly artifacts: readonly DownloadArtifactV1[];
}

export const EMPTY_DOWNLOAD_RELEASE_MANIFEST_V1: DownloadReleaseManifestV1 = {
  schemaVersion: 1,
  generatedAt: null,
  channel: 'stable',
  artifacts: [
    { platform: 'windows', distribution: 'direct', availability: 'preparing' },
    { platform: 'android', distribution: 'google-play', availability: 'preparing' },
  ],
};

export function downloadArtifactForPlatformV1(
  manifest: DownloadReleaseManifestV1,
  platform: DownloadPlatformV1,
): DownloadArtifactV1 {
  return (
    manifest.artifacts.find((artifact) => artifact.platform === platform) ??
    EMPTY_DOWNLOAD_RELEASE_MANIFEST_V1.artifacts.find((artifact) => artifact.platform === platform)!
  );
}

export function localizedDownloadsPathV1(
  locale: SupportedLocaleV1,
): `/${SupportedLocaleV1}/downloads` {
  return `/${locale}/downloads`;
}

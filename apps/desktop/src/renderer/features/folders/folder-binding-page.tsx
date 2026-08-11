import { useState } from 'react';
import type { DesktopLocale } from '../../../shared/desktop-contract-v1.ts';
import type {
  FolderBindingSafeStatusV1,
  FolderManifestPolicyV1,
} from '../../../shared/folder-binding-contract-v1.ts';
import type { FolderReviewQueueItemV1 } from '../../../shared/folder-intake-contract-v1.ts';
import { FolderManifestEditor } from './folder-manifest-editor.tsx';
import { FolderReviewQueue } from './folder-review-queue.tsx';
import { ProjectionReview } from './projection-review.tsx';

const copy = {
  'vi-VN': {
    title: 'Thư mục dữ liệu được phê duyệt',
    select: 'Chọn thư mục qua hộp thoại hệ điều hành',
    create: 'Tạo liên kết thư mục',
    hybridDefault:
      'Hybrid là mặc định: bản gốc ở lại máy cục bộ; chỉ chiếu đã phê duyệt mới được đồng bộ.',
    capabilityConfirm: 'Xác nhận khả năng thiết bị DSO còn hiệu lực trước khi liên kết.',
    status: 'Trạng thái liên kết',
    none: 'Chưa có liên kết thư mục',
    error: 'Không thể tạo liên kết thư mục',
  },
  en: {
    title: 'Approved data folders',
    select: 'Select folder through the OS picker',
    create: 'Create folder binding',
    hybridDefault: 'Hybrid is the default: originals stay local; only approved projections sync.',
    capabilityConfirm: 'Confirm the DSO device capability is active before binding.',
    status: 'Binding status',
    none: 'No folder binding yet',
    error: 'Unable to create folder binding',
  },
} as const;

const defaultManifest: FolderManifestPolicyV1 = {
  purpose: 'sales-intake',
  supportedProfiles: ['CSV', 'XLSX'],
  schemaFingerprints: ['e'.repeat(64)],
  groupingRules: ['by-period'],
  versionBehavior: 'APPEND',
  periodOverlapPolicy: 'REJECT',
  duplicateKeyFields: ['invoice_id'],
  mappingPolicyId: '01GGGGGGGGGGGGGGGGGGGGGGGG',
  stabilityDebounceMs: 1500,
  publicationProjection: {
    class: 'DASHBOARD_AGGREGATES',
    fieldAllowlist: ['amount', 'period'],
  },
};

export interface FolderBindingPageProps {
  readonly locale: DesktopLocale;
  readonly capabilityGrantId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  /** Quarantine / review items from intake; empty until watcher reports honest events. */
  readonly reviewQueue?: readonly FolderReviewQueueItemV1[];
}

export function FolderBindingPage({
  locale,
  capabilityGrantId,
  organizationId,
  workspaceId,
  reviewQueue = [],
}: FolderBindingPageProps) {
  const text = copy[locale];
  const [manifest, setManifest] = useState(defaultManifest);
  const [selectionToken, setSelectionToken] = useState<string | null>(null);
  const [status, setStatus] = useState<FolderBindingSafeStatusV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectionConfirmed, setProjectionConfirmed] = useState(false);

  const projectionPreview = Object.freeze({
    class: manifest.publicationProjection.class,
    fieldAllowlist: manifest.publicationProjection.fieldAllowlist,
    rowCount: 0,
    byteCount: 0,
    destination: 'CLOUD_WORKSPACE_PROJECTION' as const,
    evidenceConsequences: Object.freeze(['AGGREGATE_ONLY', 'NO_RAW_CELLS']),
    effectiveDataMode: 'HYBRID' as const,
    version: status?.manifestVersion ?? 1,
  });

  async function onSelect() {
    setError(null);
    const bridge = window.databreezeDesktop;
    if (bridge === undefined) {
      setError(text.error);
      return;
    }
    try {
      const selected = await bridge.v1.folders.select();
      setSelectionToken(selected.selectionToken);
    } catch {
      setError(text.error);
    }
  }

  async function onCreate() {
    setError(null);
    const bridge = window.databreezeDesktop;
    if (bridge === undefined || selectionToken === null) {
      setError(text.error);
      return;
    }
    try {
      const created = await bridge.v1.folders.create({
        selectionToken,
        capabilityGrantId,
        organizationId,
        workspaceId,
        displayName: 'Approved folder',
        manifest,
      });
      setStatus(created);
      setSelectionToken(null);
    } catch {
      setError(text.error);
    }
  }

  return (
    <section aria-labelledby="folder-binding-title" className="folder-binding-page">
      <h1 id="folder-binding-title">{text.title}</h1>
      <p>{text.hybridDefault}</p>
      <p>{text.capabilityConfirm}</p>
      <div className="folder-binding-actions">
        <button type="button" onClick={() => void onSelect()}>
          {text.select}
        </button>
        <button type="button" disabled={selectionToken === null} onClick={() => void onCreate()}>
          {text.create}
        </button>
      </div>
      <FolderManifestEditor locale={locale} manifest={manifest} onChange={setManifest} />
      <FolderReviewQueue locale={locale} items={reviewQueue} />
      <ProjectionReview
        locale={locale}
        preview={projectionPreview}
        onConfirm={() => setProjectionConfirmed(true)}
      />
      {projectionConfirmed ? (
        <p role="status">
          {locale === 'vi-VN'
            ? 'Chiếu Hybrid đã được xác nhận cục bộ; đồng bộ vẫn yêu cầu khả năng DSO và API.'
            : 'Hybrid projection confirmed locally; sync still requires DSO capability and API.'}
        </p>
      ) : null}
      <div aria-live="polite">
        <h2>{text.status}</h2>
        {status === null ? <p>{text.none}</p> : null}
        {status !== null ? (
          <dl>
            <div>
              <dt>bindingId</dt>
              <dd className="numeric">{status.bindingId}</dd>
            </div>
            <div>
              <dt>capability</dt>
              <dd>{status.capabilityState}</dd>
            </div>
            <div>
              <dt>manifest</dt>
              <dd className="numeric">v{status.manifestVersion}</dd>
            </div>
          </dl>
        ) : null}
        {error !== null ? <p role="alert">{error}</p> : null}
      </div>
    </section>
  );
}

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import {
  toDatasetCardV1,
  type DatasetCardV1,
  type DatasetRecordV1,
  type DatasetSourceFileV1,
} from './data-model.ts';
import { DataImportDrawer, type ImportDrawerStartV1 } from './data-import-drawer.tsx';
import { ImportReviewWorkspace } from './import-review-workspace.tsx';
import { ImportSuccessHub } from './import-success-hub.tsx';
import { ImportSession, type ImportApprovedResultV1 } from './import-session.ts';
import { localDataStore, datasetRecordFromCard } from './local-data-store.ts';
import { DataTreeSidebar, type TreeSelectionV1 } from './data-tree-sidebar.tsx';
import { DataPipelinePanel } from './data-pipeline-panel.tsx';
import { DataAgentDock } from './data-agent-dock.tsx';
import { cleaningAgentStore } from './cleaning-agent-store.ts';
import { coherenceCheck } from './cleaning-engine.ts';
import { SourceUploadPanel } from './source-upload-panel.tsx';
import { DatasetPreviewTable } from './dataset-preview-table.tsx';
import { MAX_SERVER_TABULAR_FILE_BYTES, type DataImportRecordV1 } from './data-import-api.ts';
import { MAX_TABULAR_FILE_BYTES } from './csv-parser.ts';
import './data-workspace.css';

export interface DataWorkspacePageProps {
  readonly datasets: readonly DatasetCardV1[];
  readonly pendingImports?: readonly DataImportRecordV1[];
  readonly locale: 'en' | 'vi-VN';
  /** Demo mode shows the seeded demo dataset; server mode hides it. */
  readonly demoMode?: boolean;
  readonly onDatasetsChanged?: () => void;
}

type SourceActionStateV1 = {
  readonly kind: 'ORIGINAL' | 'EVIDENCE';
  readonly datasetId: string;
  readonly source: DatasetSourceFileV1;
};

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        heading: 'Dữ liệu',
        description:
          'Quản lý bộ dữ liệu, tệp nguồn, phiên bản và các mục cần xem xét trong phạm vi được cấp quyền.',
        storageFailed:
          'Không thể lưu dữ liệu cục bộ (bộ nhớ đầy?). Dữ liệu hiển thị nhưng có thể mất khi tải lại trang.',
        rootTitle: 'Tất cả dữ liệu',
        rootSubtitle:
          'Tạo một dự án để nhóm các bộ dữ liệu liên quan, hoặc chọn một bộ dữ liệu để bắt đầu chuẩn hóa.',
        createProject: 'Tạo dự án',
        openProject: 'Mở dự án',
        members: 'bộ dữ liệu',
        coherenceTitle: 'Kiểm tra tính nhất quán dự án',
        ungroupedTitle: 'Chưa phân nhóm',
        serverDatasetsTitle: 'Từ máy chủ',
        emptyWorkspace: 'Chưa có bộ dữ liệu được cấp quyền trong không gian làm việc này.',
        approvedCta: 'Đã duyệt phiên bản',
      }
    : {
        heading: 'Data',
        description:
          'Organize projects, clean datasets with the agent, and approve immutable versions — all in one place.',
        storageFailed:
          'Local persistence failed (storage full?). Data is visible but may be lost on reload.',
        rootTitle: 'All data',
        rootSubtitle:
          'Create a project to group related datasets, or pick a dataset to start cleaning.',
        createProject: 'Create project',
        openProject: 'Open project',
        members: 'datasets',
        coherenceTitle: 'Project coherence check',
        ungroupedTitle: 'Ungrouped',
        serverDatasetsTitle: 'From server',
        emptyWorkspace: 'No authorized datasets are available in this workspace.',
        approvedCta: 'Version approved',
      };
}

export function DataWorkspacePage({
  datasets,
  pendingImports = [],
  locale,
  demoMode = false,
  onDatasetsChanged,
}: DataWorkspacePageProps) {
  const text = copy(locale);
  const storeRecords = useSyncExternalStore(
    localDataStore.subscribe,
    () => localDataStore.getDatasetRecords(),
    () => localDataStore.getDatasetRecords(),
  );
  const storedProjects = useSyncExternalStore(
    localDataStore.subscribe,
    () => localDataStore.getProjects(),
    () => localDataStore.getProjects(),
  );
  const storageStatus = useSyncExternalStore(
    localDataStore.subscribe,
    () => localDataStore.storageStatus,
    () => localDataStore.storageStatus,
  );

  const projects = demoMode ? storedProjects : [];

  // The browser-local repository is an explicit demo implementation. Live
  // mode renders only the server-authoritative dataset index.
  const records = useMemo(() => {
    if (demoMode) return storeRecords;
    return datasets.map((dataset) => datasetRecordFromCard(dataset, undefined));
  }, [datasets, demoMode, storeRecords]);
  const serverCardsById = useMemo(
    () => new Map(datasets.map((dataset) => [dataset.datasetId, dataset])),
    [datasets],
  );

  const [selection, setSelection] = useState<TreeSelectionV1>({ kind: 'root' });
  const [agentOpen, setAgentOpen] = useState(true);

  // Import workflow state (DDA-053 dual-track session)
  const [isImportDrawerOpen, setIsImportDrawerOpen] = useState(false);
  const [drawerPrefill, setDrawerPrefill] = useState<readonly File[] | undefined>();
  const [drawerProjectId, setDrawerProjectId] = useState<string | undefined>();
  const [session, setSession] = useState<ImportSession | undefined>();
  const [approvedHub, setApprovedHub] = useState<ImportApprovedResultV1 | null>(null);
  const [sourceAction, setSourceAction] = useState<SourceActionStateV1>();
  const [queryImportId, setQueryImportId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('importId');
  });

  function setImportQuery(importId: string | undefined, replace = true) {
    if (typeof window === 'undefined') {
      setQueryImportId(importId ?? null);
      return;
    }
    const url = new URL(window.location.href);
    if (importId === undefined) url.searchParams.delete('importId');
    else url.searchParams.set('importId', importId);
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({}, '', `${url.pathname}${url.search}${url.hash}`);
    setQueryImportId(importId ?? null);
  }

  const selectedRecord = useMemo(
    () =>
      selection.kind === 'dataset'
        ? records.find((record) => record.datasetId === selection.datasetId)
        : undefined,
    [records, selection],
  );

  useEffect(() => {
    if (selection.kind !== 'dataset') return;
    const stillExists = records.some((record) => record.datasetId === selection.datasetId);
    if (!stillExists) setSelection({ kind: 'root' });
  }, [records, selection]);

  useEffect(() => {
    if (demoMode || session !== undefined || queryImportId === null) return;
    const pending = pendingImports.find((record) => record.importId === queryImportId);
    if (pending !== undefined) setSession(ImportSession.resumeServer(pending, locale));
  }, [demoMode, locale, pendingImports, queryImportId, session]);

  async function handleStartImport(input: ImportDrawerStartV1) {
    setIsImportDrawerOpen(false);
    setDrawerProjectId(input.projectId);
    const files = await Promise.all(
      input.files.map(async (file) => ({
        fileName: file.name,
        bytes: await file.arrayBuffer(),
      })),
    );
    const next = new ImportSession({
      destination: input.destination,
      datasetName: input.datasetName,
      files,
      locale,
      demoMode,
    });
    setSession(next);
    setImportQuery(undefined);
    setApprovedHub(null);
    await next.start();
  }

  function handleApproved(result: ImportApprovedResultV1) {
    setSession(undefined);
    setImportQuery(undefined);
    setApprovedHub(result);
    if (result.dataset.datasetId !== undefined) {
      if (demoMode && drawerProjectId !== undefined) {
        localDataStore.setDatasetProject(result.dataset.datasetId, drawerProjectId);
        const projectLabel = localDataStore.getProject(drawerProjectId)?.label ?? '';
        cleaningAgentStore.postCoherence(
          result.dataset.datasetId,
          locale === 'vi-VN'
            ? `Đã thêm vào dự án "${projectLabel}".`
            : `Added to project "${projectLabel}".`,
        );
      }
      setSelection({ kind: 'dataset', datasetId: result.dataset.datasetId });
      setAgentOpen(true);
    }
    if (result.track === 'SERVER') onDatasetsChanged?.();
  }

  function resumeImport(record: DataImportRecordV1) {
    setApprovedHub(null);
    setImportQuery(record.importId, false);
    setSession(ImportSession.resumeServer(record, locale));
  }

  function cancelImport() {
    setSession(undefined);
    setImportQuery(undefined);
  }

  function openSourceAction(kind: SourceActionStateV1['kind'], sourceId: string) {
    if (selectedRecord === undefined) return;
    const source = selectedRecord.sources.find((candidate) => candidate.sourceId === sourceId);
    if (source === undefined) return;
    setSourceAction({ kind, datasetId: selectedRecord.datasetId, source });
  }

  function approveDataset(datasetId: string) {
    if (!demoMode) return;
    const updated = localDataStore.approveDataset(datasetId);
    if (updated !== undefined) {
      cleaningAgentStore.postCoherence(
        datasetId,
        locale === 'vi-VN'
          ? `🔒 Phiên bản đã được duyệt và khóa lúc ${new Date().toLocaleTimeString('vi-VN')}.`
          : `🔒 Version approved and locked at ${new Date().toLocaleTimeString('en-US')}.`,
      );
    }
  }

  function openDrawer(projectId?: string) {
    setDrawerPrefill(undefined);
    setDrawerProjectId(projectId);
    setIsImportDrawerOpen(true);
  }

  const vi = locale === 'vi-VN';

  return (
    <div className="data-workspace-shell">
      <header className="data-workspace-shell__heading">
        <div>
          <h1>{text.heading}</h1>
          <p>{text.description}</p>
        </div>
      </header>

      {demoMode && storageStatus === 'PERSIST_FAILED' ? (
        <p className="data-storage-warning" role="alert">
          {text.storageFailed}
        </p>
      ) : null}

      <DataImportDrawer
        isOpen={isImportDrawerOpen}
        locale={locale}
        datasets={datasets}
        onClose={() => setIsImportDrawerOpen(false)}
        onStartImport={(input) => void handleStartImport(input)}
        projects={projects}
        {...(drawerProjectId === undefined ? {} : { defaultProjectId: drawerProjectId })}
        {...(drawerPrefill === undefined ? {} : { initialFiles: drawerPrefill })}
        maxFileBytes={demoMode ? MAX_TABULAR_FILE_BYTES : MAX_SERVER_TABULAR_FILE_BYTES}
      />

      {session !== undefined ? (
        <div className="data-workspace-shell__main">
          <ImportReviewWorkspace
            session={session}
            locale={locale}
            onApproved={handleApproved}
            onCancel={cancelImport}
          />
        </div>
      ) : approvedHub !== null ? (
        <div className="data-workspace-shell__main">
          <ImportSuccessHub
            dataset={approvedHub.dataset}
            locale={locale}
            onDismiss={() => setApprovedHub(null)}
            dashboardStatus={approvedHub.dashboardStatus}
            {...(approvedHub.importId === undefined ? {} : { importId: approvedHub.importId })}
            {...(approvedHub.starterDashboardId === undefined
              ? {}
              : { starterDashboardId: approvedHub.starterDashboardId })}
          />
        </div>
      ) : (
        <div className="data-workspace-shell__main">
          <DataTreeSidebar
            locale={locale}
            projects={projects}
            records={records}
            selection={selection}
            onSelect={setSelection}
            onCreateProject={(label) => localDataStore.createProject(label)}
            onRenameProject={(projectId, label) => localDataStore.renameProject(projectId, label)}
            onDeleteProject={(projectId) => localDataStore.deleteProject(projectId)}
            onAddData={(projectId) => openDrawer(projectId)}
            allowProjectManagement={demoMode}
          />

          <div className="data-workspace-center">
            {selectedRecord !== undefined ? (
              <DataPipelinePanel
                record={selectedRecord}
                locale={locale}
                agentOpen={
                  agentOpen && localDataStore.getTabularData(selectedRecord.datasetId) !== undefined
                }
                onOpenAgent={() => setAgentOpen(true)}
                onApprove={() => approveDataset(selectedRecord.datasetId)}
                onOpenOriginal={(sourceId) => openSourceAction('ORIGINAL', sourceId)}
                onViewEvidence={(sourceId) => openSourceAction('EVIDENCE', sourceId)}
                {...(() => {
                  const serverCard = serverCardsById.get(selectedRecord.datasetId);
                  return serverCard === undefined ? {} : { displayCard: serverCard };
                })()}
              />
            ) : selection.kind === 'project' ? (
              <ProjectOverview
                projectId={selection.projectId}
                records={records}
                locale={locale}
                onOpen={(datasetId) => setSelection({ kind: 'dataset', datasetId })}
                onAddData={() => openDrawer(selection.projectId)}
              />
            ) : (
              <RootOverview
                datasets={datasets}
                records={records}
                projects={projects}
                pendingImports={pendingImports}
                locale={locale}
                onCreateProject={() => {
                  if (!demoMode) return;
                  const label = vi
                    ? `Dự án ${projects.length + 1}`
                    : `Project ${projects.length + 1}`;
                  localDataStore.createProject(label);
                }}
                onOpen={(selection_) => setSelection(selection_)}
                onAddData={() => openDrawer()}
                onResumeImport={resumeImport}
                onSelectFiles={(files) => {
                  setDrawerPrefill(Array.from(files));
                  setDrawerProjectId(undefined);
                  setIsImportDrawerOpen(true);
                }}
                allowProjectManagement={demoMode}
              />
            )}
          </div>

          {selectedRecord !== undefined &&
          agentOpen &&
          localDataStore.getTabularData(selectedRecord.datasetId) !== undefined ? (
            <DataAgentDock
              datasetId={selectedRecord.datasetId}
              datasetLabel={selectedRecord.label}
              locale={locale}
              onApprove={() => approveDataset(selectedRecord.datasetId)}
              onClose={() => setAgentOpen(false)}
            />
          ) : null}
        </div>
      )}
      {sourceAction !== undefined ? (
        <SourceActionDialog
          action={sourceAction}
          dataset={
            serverCardsById.get(sourceAction.datasetId) ??
            (() => {
              const record = records.find(
                (candidate) => candidate.datasetId === sourceAction.datasetId,
              );
              return record === undefined ? undefined : toDatasetCardV1(record, locale);
            })()
          }
          locale={locale}
          onClose={() => setSourceAction(undefined)}
        />
      ) : null}
    </div>
  );
}

function SourceActionDialog({
  action,
  dataset,
  locale,
  onClose,
}: {
  readonly action: SourceActionStateV1;
  readonly dataset: DatasetCardV1 | undefined;
  readonly locale: 'en' | 'vi-VN';
  readonly onClose: () => void;
}) {
  const vi = locale === 'vi-VN';
  const original = action.kind === 'ORIGINAL';
  const safePreview = original && action.source.originalAction === 'VIEW_SAFE';
  return (
    <div className="data-source-action-backdrop" role="presentation">
      <section
        aria-label={vi ? 'Chi tiết nguồn dữ liệu' : 'Source details'}
        aria-modal="true"
        className="data-source-action-dialog"
        role="dialog"
      >
        <header className="data-source-action-dialog__header">
          <div>
            <p className="data-source-action-dialog__eyebrow">
              {original
                ? vi
                  ? 'BẢN XEM ĐƯỢC CẤP QUYỀN'
                  : 'GOVERNED SOURCE VIEW'
                : vi
                  ? 'BẰNG CHỨNG NGUỒN'
                  : 'SOURCE EVIDENCE'}
            </p>
            <h2>{action.source.label}</h2>
            <p>
              {original
                ? safePreview
                  ? vi
                    ? 'Bản xem này chỉ hiển thị các dòng đã được cấp quyền; không có đường dẫn cục bộ hay nội dung thực thi.'
                    : 'This view contains only authorized rows; no local path or executable content is exposed.'
                  : vi
                    ? 'Nguồn này chỉ có thể mở trên thiết bị nguồn đã được cấp quyền.'
                    : 'This source can only be opened on its authorized source device.'
                : vi
                  ? 'Bằng chứng được giữ trong phạm vi phiên bản và quyền hiện tại.'
                  : 'Evidence remains bound to the current version and permission scope.'}
            </p>
          </div>
          <button
            aria-label={vi ? 'Đóng' : 'Close'}
            className="data-source-action-dialog__close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        {safePreview && dataset !== undefined ? (
          <DatasetPreviewTable dataset={dataset} locale={locale} />
        ) : (
          <p className="data-source-action-dialog__status" role="status">
            {original
              ? vi
                ? 'Yêu cầu mở nguồn đã được giữ an toàn. Thiết bị nguồn sẽ thực hiện thao tác này khi được kết nối.'
                : 'The open-source request is safely scoped. The authorized source device performs it when connected.'
              : vi
                ? 'Bản ghi bằng chứng chi tiết chưa được kết nối trong môi trường này; không có dữ liệu giả được hiển thị.'
                : 'Detailed evidence is not connected in this environment; no fabricated data is shown.'}
          </p>
        )}
        <footer className="data-source-action-dialog__footer">
          <button className="db-button db-button--secondary" onClick={onClose} type="button">
            {vi ? 'Đóng' : 'Close'}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ProjectOverview({
  projectId,
  records,
  locale,
  onOpen,
  onAddData,
}: {
  readonly projectId: string;
  readonly records: readonly DatasetRecordV1[];
  readonly locale: 'en' | 'vi-VN';
  readonly onOpen: (datasetId: string) => void;
  readonly onAddData: () => void;
}) {
  const vi = locale === 'vi-VN';
  const project = localDataStore.getProject(projectId);
  const members = useMemo(
    () => records.filter((record) => record.projectId === projectId),
    [records, projectId],
  );
  const report = useMemo(
    () =>
      coherenceCheck(
        members
          .map((record) => ({
            record,
            tabular: localDataStore.getTabularData(record.datasetId),
          }))
          .filter(
            (
              member,
            ): member is {
              record: DatasetRecordV1;
              tabular: NonNullable<ReturnType<typeof localDataStore.getTabularData>>;
            } => member.tabular !== undefined,
          ),
      ),
    [members],
  );

  if (project === undefined) return null;
  return (
    <section className="project-overview" aria-labelledby="project-overview-title">
      <header className="project-overview__header">
        <div>
          <h1 id="project-overview-title">{project.label}</h1>
          <p>
            {members.length} {vi ? 'bộ dữ liệu' : 'datasets'} ·{' '}
            {members.filter((record) => record.cleaningState === 'APPROVED').length}{' '}
            {vi ? 'đã duyệt' : 'approved'}
          </p>
        </div>
        <button type="button" className="db-button db-button--primary" onClick={onAddData}>
          {vi ? '+ Thêm dữ liệu vào dự án' : '+ Add data to project'}
        </button>
      </header>

      <h2>{vi ? 'Kiểm tra tính nhất quán' : 'Coherence check'}</h2>
      <ul className="project-overview__findings" role="list">
        {report.findings.map((finding, index) => (
          <li key={index} className={finding.severity === 'warning' ? 'is-warning' : undefined}>
            {vi ? finding.textVi : finding.textEn}
          </li>
        ))}
      </ul>

      <h2>{vi ? 'Bộ dữ liệu' : 'Datasets'}</h2>
      <ul className="project-overview__members" role="list">
        {members.map((record) => (
          <li key={record.datasetId}>
            <button type="button" onClick={() => onOpen(record.datasetId)}>
              <strong>{record.label}</strong>
              <small>
                {record.currentVersion.rowCount.toLocaleString(vi ? 'vi-VN' : 'en-US')}{' '}
                {vi ? 'hàng' : 'rows'} · {record.cleaningState ?? 'RAW'}
              </small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RootOverview({
  datasets,
  records,
  projects,
  pendingImports,
  locale,
  onCreateProject,
  onOpen,
  onAddData,
  onResumeImport,
  onSelectFiles,
  allowProjectManagement,
}: {
  readonly datasets: readonly DatasetCardV1[];
  readonly records: readonly DatasetRecordV1[];
  readonly projects: readonly { readonly projectId: string; readonly label: string }[];
  readonly pendingImports: readonly DataImportRecordV1[];
  readonly locale: 'en' | 'vi-VN';
  readonly onCreateProject: () => void;
  readonly onOpen: (selection: TreeSelectionV1) => void;
  readonly onAddData: () => void;
  readonly onResumeImport: (record: DataImportRecordV1) => void;
  readonly onSelectFiles: (files: FileList) => void;
  readonly allowProjectManagement: boolean;
}) {
  const vi = locale === 'vi-VN';
  const text = copy(locale);

  if (records.length === 0 && datasets.length === 0 && pendingImports.length === 0) {
    return (
      <section className="root-overview" aria-labelledby="root-overview-title">
        <header className="root-overview__header">
          <div>
            <h1 id="root-overview-title">{vi ? 'Tất cả dữ liệu' : 'All data'}</h1>
            <p className="root-overview__empty">{text.emptyWorkspace}</p>
          </div>
          <div className="root-overview__actions">
            <button type="button" className="db-button db-button--primary" onClick={onAddData}>
              {vi ? '+ Thêm dữ liệu' : '+ Add data'}
            </button>
          </div>
        </header>
        <SourceUploadPanel locale={locale} onSelectFiles={onSelectFiles} />
      </section>
    );
  }

  return (
    <section className="root-overview" aria-labelledby="root-overview-title">
      <header className="root-overview__header">
        <div>
          <h1 id="root-overview-title">{vi ? 'Tất cả dữ liệu' : 'All data'}</h1>
          <p>
            {allowProjectManagement
              ? vi
                ? 'Nhóm các bộ dữ liệu liên quan hoặc chọn một bộ dữ liệu để xem nguồn, chất lượng và phiên bản.'
                : 'Group related datasets or select one to inspect sources, quality, and versions.'
              : vi
                ? 'Chọn một bộ dữ liệu để xem nguồn, chất lượng và các phiên bản đã duyệt.'
                : 'Select a dataset to inspect its sources, quality, and approved versions.'}
          </p>
        </div>
        <div className="root-overview__actions">
          {allowProjectManagement ? (
            <button
              type="button"
              className="db-button db-button--secondary"
              onClick={onCreateProject}
            >
              {vi ? '＋ Tạo dự án' : '＋ Create project'}
            </button>
          ) : null}
          <button type="button" className="db-button db-button--primary" onClick={onAddData}>
            {vi ? '+ Thêm dữ liệu' : '+ Add data'}
          </button>
        </div>
      </header>

      {pendingImports.length > 0 ? (
        <section className="root-overview__pending" aria-labelledby="pending-imports-title">
          <div>
            <h2 id="pending-imports-title">{vi ? 'Cần xem xét' : 'Needs review'}</h2>
            <p>
              {vi
                ? 'Các phiên nạp vẫn được lưu trên máy chủ. Mở lại để tiếp tục sau khi tải lại trang.'
                : 'These imports are saved on the server. Re-open one to continue after a reload.'}
            </p>
          </div>
          <ul role="list">
            {pendingImports.map((record) => (
              <li key={record.importId}>
                <button type="button" onClick={() => onResumeImport(record)}>
                  <span>
                    <strong>{record.datasetName}</strong>
                    <small>
                      {record.sources.length} {vi ? 'tệp' : 'files'} ·{' '}
                      {record.review.counts.input.toLocaleString(vi ? 'vi-VN' : 'en-US')}{' '}
                      {vi ? 'dòng' : 'rows'}
                    </small>
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="root-overview__stats">
        {allowProjectManagement ? (
          <div>
            <small>{vi ? 'Dự án' : 'Projects'}</small>
            <strong>{projects.length}</strong>
          </div>
        ) : null}
        <div>
          <small>{vi ? 'Bộ dữ liệu' : 'Datasets'}</small>
          <strong>{records.length}</strong>
        </div>
        <div>
          <small>{vi ? 'Đã duyệt' : 'Approved'}</small>
          <strong>{records.filter((record) => record.cleaningState === 'APPROVED').length}</strong>
        </div>
      </div>

      {projects.length > 0 ? (
        <>
          <h2>{vi ? 'Dự án' : 'Projects'}</h2>
          <ul className="root-overview__projects" role="list">
            {projects.map((project) => {
              const members = records.filter((record) => record.projectId === project.projectId);
              const approved = members.filter(
                (record) => record.cleaningState === 'APPROVED',
              ).length;
              const allApproved = members.length > 0 && approved === members.length;
              return (
                <li key={project.projectId}>
                  <button
                    type="button"
                    onClick={() => onOpen({ kind: 'project', projectId: project.projectId })}
                  >
                    <span
                      className={`root-overview__dot${allApproved ? ' is-done' : members.length > 0 ? ' is-active' : ''}`}
                      aria-hidden="true"
                    />
                    <strong>{project.label}</strong>
                    <small>
                      {members.length} {vi ? 'bộ' : 'datasets'} · {approved}/{members.length}{' '}
                      {vi ? 'duyệt' : 'approved'}
                    </small>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}

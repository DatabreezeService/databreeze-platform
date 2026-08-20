import { useState } from 'react';
import type {
  DatasetCleaningStateV1,
  DatasetRecordV1,
  LocalProjectRecordV1,
} from './data-model.ts';

export type TreeSelectionV1 =
  | { readonly kind: 'root' }
  | { readonly kind: 'project'; readonly projectId: string }
  | { readonly kind: 'dataset'; readonly datasetId: string };

export interface DataTreeSidebarProps {
  readonly locale: 'en' | 'vi-VN';
  readonly projects: readonly LocalProjectRecordV1[];
  readonly records: readonly DatasetRecordV1[];
  readonly selection: TreeSelectionV1;
  readonly onSelect: (selection: TreeSelectionV1) => void;
  readonly onCreateProject: (label: string) => void;
  readonly onRenameProject: (projectId: string, label: string) => void;
  readonly onDeleteProject: (projectId: string) => void;
  readonly onAddData: (projectId?: string) => void;
  readonly allowProjectManagement?: boolean;
}

function DataCollectionIcon() {
  return (
    <svg
      className="data-tree__icon data-tree__root-icon"
      aria-hidden="true"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="5" rx="7.5" ry="3" />
      <path d="M4.5 5v7c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V5" />
      <path d="M4.5 12v7c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-7" />
    </svg>
  );
}

function cleaningChip(
  state: DatasetCleaningStateV1 | undefined,
  locale: 'en' | 'vi-VN',
): { readonly label: string; readonly tone: 'fresh' | 'cleaning' | 'review' | 'approved' } {
  const vi = locale === 'vi-VN';
  switch (state ?? 'RAW') {
    case 'RAW':
      return { label: vi ? 'Mới' : 'New', tone: 'fresh' };
    case 'CLEANING':
      return { label: vi ? 'Đang chuẩn hóa' : 'Cleaning', tone: 'cleaning' };
    case 'REVIEW':
      return { label: vi ? 'Sẵn sàng duyệt' : 'Ready', tone: 'review' };
    case 'APPROVED':
      return { label: vi ? 'Đã duyệt' : 'Approved', tone: 'approved' };
  }
}

function projectTone(
  members: readonly DatasetRecordV1[],
  locale: 'en' | 'vi-VN',
): { readonly label: string; readonly tone: 'neutral' | 'active' | 'done' } {
  const vi = locale === 'vi-VN';
  if (members.length === 0) return { label: vi ? 'trống' : 'empty', tone: 'neutral' };
  if (members.some((record) => (record.cleaningState ?? 'RAW') !== 'APPROVED')) {
    return { label: vi ? 'đang xử lý' : 'in progress', tone: 'active' };
  }
  return { label: vi ? 'hoàn tất' : 'complete', tone: 'done' };
}

export function DataTreeSidebar({
  locale,
  projects,
  records,
  selection,
  onSelect,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onAddData,
  allowProjectManagement = true,
}: DataTreeSidebarProps) {
  const vi = locale === 'vi-VN';
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [menuOpenFor, setMenuOpenFor] = useState<string | undefined>();

  const grouped = new Map(projects.map((project) => [project.projectId, project]));
  const ungrouped = records.filter(
    (record) => record.projectId === undefined || !grouped.has(record.projectId),
  );

  function toggle(projectId: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    if (newLabel.trim().length === 0) return;
    onCreateProject(newLabel.trim());
    setNewLabel('');
    setCreating(false);
  }

  return (
    <aside
      className="data-tree"
      aria-label={vi ? 'Cây dự án và bộ dữ liệu' : 'Projects and datasets tree'}
    >
      <header className="data-tree__header">
        <h2>
          {allowProjectManagement ? (vi ? 'Dự án' : 'Projects') : vi ? 'Bộ dữ liệu' : 'Datasets'}
        </h2>
        {allowProjectManagement ? (
          <button
            type="button"
            className="data-tree__add"
            onClick={() => setCreating((current) => !current)}
            aria-label={vi ? 'Tạo dự án mới' : 'Create new project'}
          >
            +
          </button>
        ) : null}
      </header>

      {allowProjectManagement && creating ? (
        <form className="data-tree__create" onSubmit={submitCreate}>
          <input
            autoFocus
            className="data-tree__create-input"
            placeholder={vi ? 'Tên dự án…' : 'Project name…'}
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            onBlur={() => {
              if (newLabel.trim().length === 0) setCreating(false);
            }}
          />
        </form>
      ) : null}

      <button
        type="button"
        className={`data-tree__root${selection.kind === 'root' ? ' is-selected' : ''}`}
        onClick={() => onSelect({ kind: 'root' })}
      >
        <DataCollectionIcon />
        <span className="data-tree__label">{vi ? 'Tất cả dữ liệu' : 'All data'}</span>
        <span className="data-tree__count">{records.length}</span>
      </button>

      <ul className="data-tree__list" role="tree">
        {projects.map((project) => {
          const members = records.filter((record) => record.projectId === project.projectId);
          const isOpen = !collapsed.has(project.projectId);
          const tone = projectTone(members, locale);
          const isRenaming = menuOpenFor === `${project.projectId}:rename`;
          return (
            <li
              className="data-tree__project"
              role="treeitem"
              key={project.projectId}
              aria-expanded={isOpen}
            >
              <div
                className={`data-tree__project-row${
                  selection.kind === 'project' && selection.projectId === project.projectId
                    ? ' is-selected'
                    : ''
                }`}
              >
                <button
                  type="button"
                  className="data-tree__disclose"
                  onClick={() => toggle(project.projectId)}
                  aria-label={isOpen ? (vi ? 'Thu gọn' : 'Collapse') : vi ? 'Mở rộng' : 'Expand'}
                >
                  {isOpen ? '▾' : '▸'}
                </button>
                {isRenaming ? (
                  <input
                    autoFocus
                    className="data-tree__rename-input"
                    defaultValue={project.label}
                    aria-label={vi ? 'Tên dự án' : 'Project name'}
                    onBlur={(event) => {
                      onRenameProject(project.projectId, event.target.value);
                      setMenuOpenFor(undefined);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="data-tree__project-label"
                    onClick={() => onSelect({ kind: 'project', projectId: project.projectId })}
                    onDoubleClick={() => setMenuOpenFor(`${project.projectId}:rename`)}
                    title={project.label}
                  >
                    <span
                      className={`data-tree__dot data-tree__dot--${tone.tone}`}
                      aria-hidden="true"
                    />
                    <span className="data-tree__label">{project.label}</span>
                  </button>
                )}
                <span className="data-tree__count">{members.length}</span>
                <button
                  type="button"
                  className="data-tree__menu-trigger"
                  aria-label={vi ? 'Menu dự án' : 'Project menu'}
                  onClick={() =>
                    setMenuOpenFor((current) =>
                      current === `${project.projectId}:menu`
                        ? undefined
                        : `${project.projectId}:menu`,
                    )
                  }
                >
                  ⋯
                </button>
              </div>

              {menuOpenFor === `${project.projectId}:menu` ? (
                <div className="data-tree__menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onAddData(project.projectId);
                      setMenuOpenFor(undefined);
                    }}
                  >
                    {vi ? '＋ Thêm dữ liệu vào dự án' : '＋ Add data to project'}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpenFor(`${project.projectId}:rename`);
                    }}
                  >
                    {vi ? 'Đổi tên dự án' : 'Rename project'}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="is-danger"
                    onClick={() => {
                      onDeleteProject(project.projectId);
                      setMenuOpenFor(undefined);
                    }}
                  >
                    {vi ? 'Xóa dự án' : 'Delete project'}
                  </button>
                </div>
              ) : null}

              {isOpen ? (
                <ul className="data-tree__datasets">
                  {members.length === 0 ? (
                    <li className="data-tree__empty">
                      {vi
                        ? 'Chưa có bộ dữ liệu — thêm dữ liệu để bắt đầu.'
                        : 'No datasets yet — add data to begin.'}
                    </li>
                  ) : (
                    members.map((record) => {
                      const chip = cleaningChip(record.cleaningState, locale);
                      return (
                        <li key={record.datasetId}>
                          <button
                            type="button"
                            className={`data-tree__dataset${
                              selection.kind === 'dataset' &&
                              selection.datasetId === record.datasetId
                                ? ' is-selected'
                                : ''
                            }`}
                            onClick={() =>
                              onSelect({ kind: 'dataset', datasetId: record.datasetId })
                            }
                            title={record.label}
                          >
                            <span className="data-tree__icon" aria-hidden="true">
                              📄
                            </span>
                            <span className="data-tree__label">{record.label}</span>
                            <span className={`data-tree__chip data-tree__chip--${chip.tone}`}>
                              {chip.label}
                            </span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      {ungrouped.length > 0 ? (
        <section className="data-tree__ungrouped">
          <h3>{vi ? 'Chưa phân nhóm' : 'Ungrouped'}</h3>
          <ul>
            {ungrouped.map((record) => {
              const chip = cleaningChip(record.cleaningState, locale);
              return (
                <li key={record.datasetId}>
                  <button
                    type="button"
                    className={`data-tree__dataset${
                      selection.kind === 'dataset' && selection.datasetId === record.datasetId
                        ? ' is-selected'
                        : ''
                    }`}
                    onClick={() => onSelect({ kind: 'dataset', datasetId: record.datasetId })}
                  >
                    <span className="data-tree__icon" aria-hidden="true">
                      📄
                    </span>
                    <span className="data-tree__label">{record.label}</span>
                    <span className={`data-tree__chip data-tree__chip--${chip.tone}`}>
                      {chip.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}

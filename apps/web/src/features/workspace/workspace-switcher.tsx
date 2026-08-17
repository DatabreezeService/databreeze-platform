import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

export interface WorkspaceSwitcherOption {
  readonly id: string;
  readonly name: string;
}

export type WorkspaceActionResult =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly message?: string };

export interface WorkspaceSwitcherProperties {
  readonly locale: 'en' | 'vi-VN';
  readonly currentWorkspaceId?: string;
  readonly currentWorkspaceName?: string;
  readonly workspaces: readonly WorkspaceSwitcherOption[];
  readonly onSwitch?: (workspaceId: string) => Promise<WorkspaceActionResult>;
  readonly onCreate?: (name: string) => Promise<WorkspaceActionResult>;
}

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        choose: 'Chọn không gian làm việc',
        current: 'Đang dùng',
        create: 'Tạo không gian làm việc',
        createTitle: 'Tạo không gian làm việc mới',
        name: 'Tên không gian làm việc',
        namePlaceholder: 'Ví dụ: Dự án khách hàng',
        ownerHint: 'Chỉ Owner hoặc Admin của tổ chức mới có thể tạo.',
        cancel: 'Hủy',
        submit: 'Tạo không gian',
        required: 'Nhập tên không gian làm việc.',
        tooLong: 'Tên không gian làm việc không được quá 200 ký tự.',
        genericError: 'Không thể cập nhật không gian làm việc. Vui lòng thử lại.',
        switching: 'Đang chuyển…',
        creating: 'Đang tạo…',
      }
    : {
        choose: 'Choose workspace',
        current: 'Current',
        create: 'Create workspace',
        createTitle: 'Create a new workspace',
        name: 'Workspace name',
        namePlaceholder: 'For example: Client projects',
        ownerHint: 'Only an organization Owner or Admin can create one.',
        cancel: 'Cancel',
        submit: 'Create workspace',
        required: 'Enter a workspace name.',
        tooLong: 'Workspace names must be 200 characters or fewer.',
        genericError: 'Could not update the workspace. Please try again.',
        switching: 'Switching…',
        creating: 'Creating…',
      };
}

export function WorkspaceSwitcher({
  locale,
  currentWorkspaceId,
  currentWorkspaceName,
  workspaces,
  onSwitch,
  onCreate,
}: WorkspaceSwitcherProperties) {
  const text = copy(locale);
  const fallbackWorkspace = workspaces.find((workspace) => workspace.id === currentWorkspaceId);
  const activeName = currentWorkspaceName ?? fallbackWorkspace?.name ?? workspaces[0]?.name;

  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const dialogTitleId = useId();

  if (activeName === undefined) return null;

  useEffect(() => {
    if (dialogOpen) nameRef.current?.focus();
  }, [dialogOpen]);

  useEffect(() => {
    if (!open && !dialogOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        setDialogOpen(false);
        setError(undefined);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target) &&
        !dialogRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [dialogOpen, open]);

  async function switchWorkspace(workspaceId: string) {
    if (workspaceId === currentWorkspaceId || onSwitch === undefined) {
      setOpen(false);
      return;
    }
    setPendingWorkspaceId(workspaceId);
    setError(undefined);
    const result = await onSwitch(workspaceId);
    setPendingWorkspaceId(undefined);
    if (!result.accepted) {
      setError(result.message ?? text.genericError);
      return;
    }
    setOpen(false);
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = name.normalize('NFC').trim();
    if (normalized.length === 0) {
      setError(text.required);
      return;
    }
    if (normalized.length > 200) {
      setError(text.tooLong);
      return;
    }
    if (onCreate === undefined) {
      setError(text.genericError);
      return;
    }
    setCreating(true);
    setError(undefined);
    const result = await onCreate(normalized);
    setCreating(false);
    if (!result.accepted) {
      setError(result.message ?? text.genericError);
      return;
    }
    setName('');
    setDialogOpen(false);
  }

  return (
    <div className="workspace-switcher">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${text.choose}: ${activeName}`}
        className="workspace-switcher__trigger"
        onClick={() => {
          setError(undefined);
          setOpen((current) => !current);
        }}
        ref={triggerRef}
        type="button"
      >
        <span className="workspace-switcher__trigger-copy">
          <span className="workspace-switcher__label">{text.choose}</span>
          <strong>{activeName}</strong>
        </span>
        <span aria-hidden="true" className={`workspace-switcher__arrow${open ? ' is-open' : ''}`}>
          ⌄
        </span>
      </button>

      {open ? (
        <div
          aria-label={text.choose}
          className="workspace-switcher__menu"
          ref={menuRef}
          role="menu"
        >
          <div className="workspace-switcher__menu-heading">{text.choose}</div>
          {workspaces.map((workspace) => {
            const current = workspace.id === currentWorkspaceId;
            const pending = pendingWorkspaceId === workspace.id;
            return (
              <button
                aria-checked={current}
                className={`workspace-switcher__option${current ? ' is-current' : ''}`}
                disabled={pendingWorkspaceId !== undefined}
                key={workspace.id}
                onClick={() => void switchWorkspace(workspace.id)}
                role="menuitemradio"
                type="button"
              >
                <span className="workspace-switcher__option-name">{workspace.name}</span>
                <span className="workspace-switcher__option-state">
                  {pending ? text.switching : current ? text.current : '↗'}
                </span>
              </button>
            );
          })}
          <div className="workspace-switcher__divider" />
          <button
            className="workspace-switcher__create"
            disabled={pendingWorkspaceId !== undefined}
            onClick={() => {
              setOpen(false);
              setDialogOpen(true);
              setError(undefined);
            }}
            role="menuitem"
            type="button"
          >
            <span aria-hidden="true">＋</span>
            {text.create}
          </button>
          {error ? (
            <p className="workspace-switcher__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {dialogOpen ? (
        <div
          aria-labelledby={dialogTitleId}
          aria-modal="true"
          className="workspace-switcher__dialog-backdrop"
          ref={dialogRef}
          role="dialog"
        >
          <form
            className="workspace-switcher__dialog"
            onSubmit={(event) => void createWorkspace(event)}
          >
            <p className="workspace-switcher__dialog-kicker">{text.create}</p>
            <h2 id={dialogTitleId}>{text.createTitle}</h2>
            <p className="workspace-switcher__dialog-hint">{text.ownerHint}</p>
            <label htmlFor={`${dialogTitleId}-name`}>{text.name}</label>
            <input
              autoComplete="off"
              id={`${dialogTitleId}-name`}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              placeholder={text.namePlaceholder}
              ref={nameRef}
              value={name}
            />
            {error ? (
              <p className="workspace-switcher__error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="workspace-switcher__dialog-actions">
              <button
                className="workspace-switcher__dialog-cancel"
                onClick={() => {
                  setDialogOpen(false);
                  setError(undefined);
                  triggerRef.current?.focus();
                }}
                type="button"
              >
                {text.cancel}
              </button>
              <button
                className="workspace-switcher__dialog-submit"
                disabled={creating}
                type="submit"
              >
                {creating ? text.creating : text.submit}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

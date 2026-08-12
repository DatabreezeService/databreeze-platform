export function WorkspaceSwitcher({
  locale,
  workspaces,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly workspaces: readonly { readonly id: string; readonly name: string }[];
}) {
  if (workspaces.length <= 1) return null;
  return (
    <label>
      {locale === 'vi-VN' ? 'Không gian làm việc' : 'Workspace'}
      <select defaultValue={workspaces[0]?.id}>
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
    </label>
  );
}

import { PERMISSIONS_V1 } from '@databreeze/domain/permissions/v1';
import { Button, Status } from '@databreeze/ui/v1';
import { appMessage } from '../app/messages.ts';
import type { WebAccessContext } from '../app/navigation.ts';
import { useLocale } from '../app/locale-context.tsx';

export function WorkspaceHome({ accessContext }: { readonly accessContext: WebAccessContext }) {
  const locale = useLocale();
  const mayCreateJob = accessContext.permissions.includes(PERMISSIONS_V1.JOB_EXECUTION_CREATE);
  return (
    <section aria-labelledby="workspace-heading" className="work-surface">
      <div className="work-surface__heading">
        <div>
          <h1 id="workspace-heading">{appMessage(locale, 'home.heading')}</h1>
          <p>{appMessage(locale, 'home.caption')}</p>
        </div>
        <Button
          disabled={!mayCreateJob}
          title={!mayCreateJob ? appMessage(locale, 'access.restricted') : undefined}
        >
          {appMessage(locale, 'home.action')}
        </Button>
      </div>
      {!mayCreateJob ? (
        <p className="restriction-note">{appMessage(locale, 'access.restricted')}</p>
      ) : null}
      <div className="table-scroll" tabIndex={0}>
        <table aria-label={appMessage(locale, 'home.heading')}>
          <thead>
            <tr>
              <th scope="col">{appMessage(locale, 'home.column.item')}</th>
              <th scope="col">{appMessage(locale, 'home.column.status')}</th>
              <th scope="col">{appMessage(locale, 'home.column.owner')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{appMessage(locale, 'home.item.review')}</td>
              <td>
                <Status kind="warning">{appMessage(locale, 'home.status.review')}</Status>
              </td>
              <td>{appMessage(locale, 'home.owner.you')}</td>
            </tr>
            <tr>
              <td>{appMessage(locale, 'home.item.approval')}</td>
              <td>
                <Status kind="info">{appMessage(locale, 'home.status.approval')}</Status>
              </td>
              <td>{appMessage(locale, 'home.owner.finance')}</td>
            </tr>
            <tr>
              <td>{appMessage(locale, 'home.item.device')}</td>
              <td>
                <Status kind="warning">{appMessage(locale, 'home.status.device')}</Status>
              </td>
              <td>{appMessage(locale, 'home.owner.operations')}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="authority-note">{appMessage(locale, 'access.clientHint')}</p>
    </section>
  );
}

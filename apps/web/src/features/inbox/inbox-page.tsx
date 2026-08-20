import { Button, Status } from '@databreeze/ui/v1';
import { useQuery } from '@tanstack/react-query';
import { appMessage } from '../../app/messages.ts';
import { useLocale } from '../../app/locale-context.tsx';
import { listInbox } from './inbox-api.ts';
import './inbox-page.css';

function stateMessageKey(
  state: string,
):
  | 'inbox.state.new'
  | 'inbox.state.routed'
  | 'inbox.state.needsReview'
  | 'inbox.state.processing'
  | 'inbox.state.resolved'
  | 'inbox.state.quarantined'
  | 'inbox.state.archived' {
  const keys = {
    NEW: 'inbox.state.new',
    ROUTED: 'inbox.state.routed',
    NEEDS_REVIEW: 'inbox.state.needsReview',
    PROCESSING: 'inbox.state.processing',
    RESOLVED: 'inbox.state.resolved',
    QUARANTINED: 'inbox.state.quarantined',
    ARCHIVED: 'inbox.state.archived',
  } as const;
  return keys[state as keyof typeof keys] ?? keys.NEW;
}

function stateKind(state: string): 'danger' | 'info' | 'success' | 'warning' {
  if (state === 'RESOLVED' || state === 'ARCHIVED') return 'success';
  if (state === 'QUARANTINED') return 'danger';
  if (state === 'PROCESSING') return 'info';
  return 'warning';
}

export function InboxPage() {
  const locale = useLocale();
  const query = useQuery({
    queryKey: ['artifacts', 'inbox'],
    queryFn: ({ signal }) => listInbox(signal),
    retry: false,
  });

  if (query.isPending) {
    return (
      <section
        aria-busy="true"
        aria-labelledby="inbox-heading"
        className="feature-surface inbox-page inbox-page--loading"
      >
        <div className="work-surface__heading inbox-page__hero">
          <div>
            <h1 id="inbox-heading">{appMessage(locale, 'inbox.heading')}</h1>
            <p>{appMessage(locale, 'inbox.caption')}</p>
          </div>
        </div>
        <div className="inbox-page__state inbox-page__state--loading">
          <Status kind="info">{appMessage(locale, 'inbox.loading')}</Status>
        </div>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section
        aria-labelledby="inbox-heading"
        className="feature-surface inbox-page inbox-page--error"
      >
        <div className="work-surface__heading inbox-page__hero">
          <div>
            <h1 id="inbox-heading">{appMessage(locale, 'inbox.heading')}</h1>
            <p>{appMessage(locale, 'inbox.caption')}</p>
          </div>
        </div>
        <div className="inbox-page__state inbox-page__state--error">
          <Status kind="danger">{appMessage(locale, 'inbox.error')}</Status>
          <Button onClick={() => void query.refetch()} variant="secondary">
            {appMessage(locale, 'inbox.retry')}
          </Button>
        </div>
      </section>
    );
  }

  const items = query.data;
  return (
    <section
      aria-labelledby="inbox-heading"
      className="feature-surface inbox-page inbox-page--ready"
    >
      <div className="work-surface__heading inbox-page__hero">
        <div>
          <h1 id="inbox-heading">{appMessage(locale, 'inbox.heading')}</h1>
          <p>{appMessage(locale, 'inbox.caption')}</p>
        </div>
        <Status kind="info">{items.length}</Status>
      </div>
      {items.length === 0 ? (
        <div className="inbox-page__empty" role="status">
          <p>{appMessage(locale, 'inbox.empty')}</p>
        </div>
      ) : (
        <div className="inbox-page__table-shell">
          <div className="inbox-page__table-scroll table-scroll" tabIndex={0}>
            <table aria-label={appMessage(locale, 'inbox.heading')}>
              <thead>
                <tr>
                  <th scope="col">{appMessage(locale, 'inbox.column.item')}</th>
                  <th scope="col">{appMessage(locale, 'inbox.column.state')}</th>
                  <th scope="col">{appMessage(locale, 'inbox.column.created')}</th>
                  <th scope="col">{appMessage(locale, 'inbox.column.version')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.inboxItemId}>
                    <td>
                      <code>{item.inboxItemId}</code>
                    </td>
                    <td>
                      <Status kind={stateKind(item.state)}>
                        {appMessage(locale, stateMessageKey(item.state))}
                      </Status>
                    </td>
                    <td>
                      <time dateTime={item.createdAt}>
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(item.createdAt))}
                      </time>
                    </td>
                    <td>
                      <code>{item.artifactVersionId}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="authority-note inbox-page__authority-note">
        {appMessage(locale, 'access.clientHint')}
      </p>
    </section>
  );
}

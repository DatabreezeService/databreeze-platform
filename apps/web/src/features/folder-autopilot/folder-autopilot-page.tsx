import { Button, Status } from '@databreeze/ui/v1';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { appMessage } from '../../app/messages.ts';
import { useLocale } from '../../app/locale-context.tsx';
import {
  createFolderAutopilotProfile,
  decideFolderAutopilotApproval,
  getFolderAutopilotDashboard,
  pauseFolderAutopilotAssignment,
  requestFolderAutopilotUndo,
  type FolderAutopilotApproval,
  type FolderAutopilotAssignment,
  type FolderAutopilotDashboard,
  type FolderAutopilotExecution,
  type FolderAutopilotProfileInput,
  type FolderAutopilotPreview,
  type FolderAutopilotProfile,
} from './folder-autopilot-api.ts';

function dateLabel(locale: ReturnType<typeof useLocale>, value: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function statusKind(value: string): 'danger' | 'info' | 'success' | 'warning' {
  if (value === 'ACTIVE' || value === 'HEALTHY' || value === 'HANDLED' || value === 'APPROVED')
    return 'success';
  if (value === 'INVALID' || value === 'EXCEPTION' || value === 'ERROR' || value === 'REJECTED')
    return 'danger';
  if (value === 'RUNNING' || value === 'QUEUED') return 'info';
  return 'warning';
}

function reasonLabel(locale: ReturnType<typeof useLocale>, value: string): string {
  return value === 'DESTINATION_COLLISION'
    ? appMessage(locale, 'autopilot.reason.collision')
    : value;
}

function assignmentHealth(
  dashboard: FolderAutopilotDashboard,
  assignmentId: string,
): string | undefined {
  return dashboard.health.find((item) => item.assignmentId === assignmentId)?.watcherState;
}

function ProfileAuthoring({
  profiles,
  onSaved,
}: {
  readonly profiles: readonly FolderAutopilotProfile[];
  readonly onSaved: () => void;
}) {
  const locale = useLocale();
  const [input, setInput] = useState<FolderAutopilotProfileInput>({
    displayName: '',
    stabilizationSeconds: 10,
    collisionPolicy: 'REVIEW',
    confidenceThreshold: 0.9,
    undoWindowHours: 24,
    approvalRequired: true,
    dataModeConstraint: 'Hybrid',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(false);
    try {
      await createFolderAutopilotProfile(input);
      setSaved(true);
      onSaved();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="autopilot-profile-heading" className="autopilot-panel">
      <div className="autopilot-panel__heading">
        <h2 id="autopilot-profile-heading">{appMessage(locale, 'autopilot.profile.heading')}</h2>
        <Status kind="info">JRA profile facade</Status>
      </div>
      {profiles.length === 0 ? (
        <p>{appMessage(locale, 'autopilot.reason.none')}</p>
      ) : (
        <div
          aria-label={appMessage(locale, 'autopilot.profile.heading')}
          className="autopilot-card-list"
        >
          {profiles.map((profile) => (
            <article className="autopilot-card" key={profile.profileId}>
              <div className="autopilot-card__heading">
                <div>
                  <h3>{profile.displayName}</h3>
                  <code>{profile.profileId}</code>
                </div>
                <Status kind="success">{profile.dataModeConstraint}</Status>
              </div>
              <dl className="autopilot-metrics">
                <div>
                  <dt>{appMessage(locale, 'autopilot.profile.collision')}</dt>
                  <dd>{profile.collisionPolicy}</dd>
                </div>
                <div>
                  <dt>{appMessage(locale, 'autopilot.profile.confidence')}</dt>
                  <dd>{profile.confidenceThreshold}</dd>
                </div>
                <div>
                  <dt>{appMessage(locale, 'autopilot.profile.approval')}</dt>
                  <dd>{profile.approvalRequired ? 'Required' : 'Optional'}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
      <form className="autopilot-profile-form" onSubmit={(event) => void submit(event)}>
        <label>
          {appMessage(locale, 'autopilot.profile.name')}
          <input
            maxLength={128}
            required
            value={input.displayName}
            onChange={(event) =>
              setInput((current) => ({ ...current, displayName: event.target.value }))
            }
          />
        </label>
        <label>
          {appMessage(locale, 'autopilot.profile.stabilization')}
          <input
            max={86_400}
            min={0}
            type="number"
            value={input.stabilizationSeconds}
            onChange={(event) =>
              setInput((current) => ({
                ...current,
                stabilizationSeconds: Number(event.target.value),
              }))
            }
          />
        </label>
        <label>
          {appMessage(locale, 'autopilot.profile.collision')}
          <select
            value={input.collisionPolicy}
            onChange={(event) =>
              setInput((current) => ({
                ...current,
                collisionPolicy: event.target
                  .value as FolderAutopilotProfileInput['collisionPolicy'],
              }))
            }
          >
            <option value="REVIEW">REVIEW</option>
            <option value="SKIP">SKIP</option>
            <option value="UNIQUE_NAME">UNIQUE_NAME</option>
          </select>
        </label>
        <label>
          {appMessage(locale, 'autopilot.profile.confidence')}
          <input
            max={1}
            min={0}
            step={0.01}
            type="number"
            value={input.confidenceThreshold}
            onChange={(event) =>
              setInput((current) => ({
                ...current,
                confidenceThreshold: Number(event.target.value),
              }))
            }
          />
        </label>
        <label>
          {appMessage(locale, 'autopilot.profile.undoWindow')}
          <input
            max={168}
            min={0}
            type="number"
            value={input.undoWindowHours}
            onChange={(event) =>
              setInput((current) => ({ ...current, undoWindowHours: Number(event.target.value) }))
            }
          />
        </label>
        <label>
          {appMessage(locale, 'autopilot.profile.dataMode')}
          <select
            value={input.dataModeConstraint}
            onChange={(event) =>
              setInput((current) => ({
                ...current,
                dataModeConstraint: event.target
                  .value as FolderAutopilotProfileInput['dataModeConstraint'],
              }))
            }
          >
            <option value="Local">Local</option>
            <option value="Hybrid">Hybrid</option>
            <option value="Cloud">Cloud</option>
          </select>
        </label>
        <label className="autopilot-checkbox">
          <input
            checked={input.approvalRequired}
            type="checkbox"
            onChange={(event) =>
              setInput((current) => ({ ...current, approvalRequired: event.target.checked }))
            }
          />
          {appMessage(locale, 'autopilot.profile.approval')}
        </label>
        <Button disabled={saving} type="submit">
          {saving
            ? appMessage(locale, 'action.retry')
            : appMessage(locale, 'autopilot.profile.save')}
        </Button>
      </form>
      {saved ? (
        <p className="autopilot-feedback" role="status">
          {appMessage(locale, 'autopilot.profile.saved')}
        </p>
      ) : null}
      {error ? <Status kind="danger">{appMessage(locale, 'autopilot.error')}</Status> : null}
    </section>
  );
}

function AssignmentList({
  dashboard,
  paused,
  onPause,
}: {
  readonly dashboard: FolderAutopilotDashboard;
  readonly paused: Readonly<Record<string, boolean>>;
  readonly onPause: (assignment: FolderAutopilotAssignment) => Promise<void>;
}) {
  const locale = useLocale();
  return (
    <section aria-labelledby="autopilot-assignment-heading" className="autopilot-panel">
      <div className="autopilot-panel__heading">
        <h2 id="autopilot-assignment-heading">
          {appMessage(locale, 'autopilot.assignment.heading')}
        </h2>
      </div>
      <div className="table-scroll" tabIndex={0}>
        <table aria-label={appMessage(locale, 'autopilot.assignment.heading')}>
          <thead>
            <tr>
              <th scope="col">{appMessage(locale, 'autopilot.assignment.name')}</th>
              <th scope="col">{appMessage(locale, 'autopilot.assignment.state')}</th>
              <th scope="col">{appMessage(locale, 'autopilot.assignment.revision')}</th>
              <th scope="col">{appMessage(locale, 'autopilot.assignment.health')}</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {dashboard.assignments.map((assignment) => {
              const isPaused = paused[assignment.assignmentId] || assignment.state === 'PAUSED';
              const health = assignmentHealth(dashboard, assignment.assignmentId);
              return (
                <tr key={assignment.assignmentId}>
                  <td>
                    <strong>{assignment.displayName}</strong>
                    <small>
                      <code>{assignment.assignmentId}</code>
                    </small>
                  </td>
                  <td>
                    <Status kind={statusKind(isPaused ? 'PAUSED' : assignment.state)}>
                      {isPaused
                        ? appMessage(locale, 'autopilot.assignment.paused')
                        : appMessage(locale, 'autopilot.assignment.active')}
                    </Status>
                  </td>
                  <td>{assignment.revision}</td>
                  <td>
                    <Status kind={statusKind(health ?? 'OFFLINE')}>{health ?? 'OFFLINE'}</Status>
                  </td>
                  <td>
                    <Button
                      disabled={isPaused || assignment.state !== 'ACTIVE'}
                      onClick={() => void onPause(assignment)}
                      variant="secondary"
                    >
                      {isPaused
                        ? appMessage(locale, 'autopilot.assignment.paused')
                        : appMessage(locale, 'autopilot.assignment.pause')}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ApprovalQueue({
  previews,
  approvals,
  decisions,
  onDecision,
}: {
  readonly previews: readonly FolderAutopilotPreview[];
  readonly approvals: readonly FolderAutopilotApproval[];
  readonly decisions: Readonly<Record<string, 'APPROVED' | 'REJECTED'>>;
  readonly onDecision: (
    approval: FolderAutopilotApproval,
    decision: 'APPROVED' | 'REJECTED',
    planHash: string,
  ) => Promise<void>;
}) {
  const locale = useLocale();
  return (
    <section aria-labelledby="autopilot-approval-heading" className="autopilot-panel">
      <div className="autopilot-panel__heading">
        <h2 id="autopilot-approval-heading">{appMessage(locale, 'autopilot.approval.heading')}</h2>
      </div>
      {approvals.length === 0 ? <p>{appMessage(locale, 'autopilot.reason.none')}</p> : null}
      <div className="autopilot-card-list">
        {approvals.map((approval) => {
          const preview = previews.find((candidate) => candidate.previewId === approval.previewId);
          if (!preview) return null;
          const decision = decisions[approval.approvalId] ?? approval.decision;
          return (
            <article className="autopilot-card" key={approval.approvalId}>
              <div className="autopilot-card__heading">
                <div>
                  <h3>
                    {appMessage(locale, 'autopilot.approval.preview')}{' '}
                    <code>{preview.previewId}</code>
                  </h3>
                  <p>
                    <code>{approval.approvalId}</code>
                  </p>
                </div>
                <Status kind={statusKind(decision)}>
                  {decision === 'PENDING'
                    ? appMessage(locale, 'autopilot.approval.pending')
                    : decision === 'APPROVED'
                      ? appMessage(locale, 'autopilot.approval.approved')
                      : appMessage(locale, 'autopilot.approval.rejected')}
                </Status>
              </div>
              <dl className="autopilot-metrics">
                <div>
                  <dt>{appMessage(locale, 'autopilot.approval.plan')}</dt>
                  <dd>
                    <code>{preview.planHash}</code>
                  </dd>
                </div>
                <div>
                  <dt>{appMessage(locale, 'autopilot.approval.affected')}</dt>
                  <dd>{preview.affectedCount}</dd>
                </div>
                <div>
                  <dt>{appMessage(locale, 'autopilot.approval.blocked')}</dt>
                  <dd>{preview.blockedCount}</dd>
                </div>
              </dl>
              <ul className="autopilot-reason-list">
                {preview.reasonCodes.map((reason) => (
                  <li key={reason}>{reasonLabel(locale, reason)}</li>
                ))}
              </ul>
              <div className="autopilot-actions">
                <Button
                  disabled={decision !== 'PENDING'}
                  onClick={() => void onDecision(approval, 'APPROVED', preview.planHash)}
                >
                  {appMessage(locale, 'autopilot.approval.approve')}
                </Button>
                <Button
                  disabled={decision !== 'PENDING'}
                  onClick={() => void onDecision(approval, 'REJECTED', preview.planHash)}
                  variant="secondary"
                >
                  {appMessage(locale, 'autopilot.approval.reject')}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Exceptions({ dashboard }: { readonly dashboard: FolderAutopilotDashboard }) {
  const locale = useLocale();
  return (
    <section aria-labelledby="autopilot-exceptions-heading" className="autopilot-panel">
      <div className="autopilot-panel__heading">
        <h2 id="autopilot-exceptions-heading">
          {appMessage(locale, 'autopilot.exceptions.heading')}
        </h2>
      </div>
      {dashboard.exceptions.length === 0 ? (
        <p>{appMessage(locale, 'autopilot.reason.none')}</p>
      ) : (
        <div className="table-scroll" tabIndex={0}>
          <table aria-label={appMessage(locale, 'autopilot.exceptions.heading')}>
            <thead>
              <tr>
                <th scope="col">{appMessage(locale, 'autopilot.exceptions.reason')}</th>
                <th scope="col">{appMessage(locale, 'autopilot.exceptions.severity')}</th>
                <th scope="col">{appMessage(locale, 'autopilot.exceptions.status')}</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.exceptions.map((item) => (
                <tr key={item.exceptionId}>
                  <td>
                    <code>{item.reasonCode}</code>
                  </td>
                  <td>
                    <Status kind={statusKind(item.severity)}>{item.severity}</Status>
                  </td>
                  <td>
                    {item.status === 'OPEN'
                      ? appMessage(locale, 'autopilot.exceptions.open')
                      : item.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RecentOutcomes({
  executions,
  requestedUndo,
  onUndo,
}: {
  readonly executions: readonly FolderAutopilotExecution[];
  readonly requestedUndo: Readonly<Record<string, boolean>>;
  readonly onUndo: (execution: FolderAutopilotExecution) => Promise<void>;
}) {
  const locale = useLocale();
  return (
    <section aria-labelledby="autopilot-outcomes-heading" className="autopilot-panel">
      <div className="autopilot-panel__heading">
        <h2 id="autopilot-outcomes-heading">{appMessage(locale, 'autopilot.outcomes.heading')}</h2>
      </div>
      <div className="table-scroll" tabIndex={0}>
        <table aria-label={appMessage(locale, 'autopilot.outcomes.heading')}>
          <thead>
            <tr>
              <th scope="col">{appMessage(locale, 'autopilot.outcomes.outcome')}</th>
              <th scope="col">{appMessage(locale, 'autopilot.outcomes.affected')}</th>
              <th scope="col">{appMessage(locale, 'autopilot.outcomes.undo')}</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {executions.map((execution) => {
              const undoAvailable =
                execution.undoState === 'AVAILABLE' && !requestedUndo[execution.executionId];
              return (
                <tr key={execution.executionId}>
                  <td>
                    <Status kind={statusKind(execution.outcome)}>
                      {execution.outcome === 'HANDLED'
                        ? appMessage(locale, 'autopilot.outcomes.handled')
                        : execution.outcome === 'EXCEPTION'
                          ? appMessage(locale, 'autopilot.outcomes.exception')
                          : execution.outcome}
                    </Status>
                    <small>
                      <code>{execution.executionId}</code>
                    </small>
                  </td>
                  <td>{execution.affectedCount}</td>
                  <td>
                    {requestedUndo[execution.executionId]
                      ? appMessage(locale, 'autopilot.outcomes.undoRequested')
                      : execution.undoState === 'AVAILABLE'
                        ? appMessage(locale, 'autopilot.outcomes.undoAvailable')
                        : execution.undoState}
                  </td>
                  <td>
                    <Button
                      disabled={!undoAvailable}
                      onClick={() => void onUndo(execution)}
                      variant="secondary"
                    >
                      {appMessage(locale, 'autopilot.outcomes.undo')}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function FolderAutopilotPage() {
  const locale = useLocale();
  const query = useQuery({
    queryKey: ['folder-autopilot', 'dashboard'],
    queryFn: ({ signal }) => getFolderAutopilotDashboard(signal),
    retry: false,
  });
  const [paused, setPaused] = useState<Readonly<Record<string, boolean>>>({});
  const [decisions, setDecisions] = useState<Readonly<Record<string, 'APPROVED' | 'REJECTED'>>>({});
  const [requestedUndo, setRequestedUndo] = useState<Readonly<Record<string, boolean>>>({});

  if (query.isPending)
    return (
      <section className="feature-surface">
        <h1>{appMessage(locale, 'autopilot.heading')}</h1>
        <Status kind="info">{appMessage(locale, 'autopilot.loading')}</Status>
      </section>
    );
  if (query.isError)
    return (
      <section className="feature-surface">
        <h1>{appMessage(locale, 'autopilot.heading')}</h1>
        <Status kind="danger">{appMessage(locale, 'autopilot.error')}</Status>
        <Button onClick={() => void query.refetch()} variant="secondary">
          {appMessage(locale, 'autopilot.retry')}
        </Button>
      </section>
    );

  const dashboard = query.data;
  async function pause(assignment: FolderAutopilotAssignment) {
    await pauseFolderAutopilotAssignment(assignment.assignmentId, assignment.revision);
    setPaused((current) => ({ ...current, [assignment.assignmentId]: true }));
  }
  async function decide(
    approval: FolderAutopilotApproval,
    decision: 'APPROVED' | 'REJECTED',
    planHash: string,
  ) {
    await decideFolderAutopilotApproval(
      approval.approvalId,
      approval.subjectHash,
      decision,
      planHash,
    );
    setDecisions((current) => ({ ...current, [approval.approvalId]: decision }));
  }
  async function undo(execution: FolderAutopilotExecution) {
    await requestFolderAutopilotUndo(execution.executionId, execution.planHash, execution.revision);
    setRequestedUndo((current) => ({ ...current, [execution.executionId]: true }));
  }

  return (
    <section aria-labelledby="autopilot-heading" className="feature-surface folder-autopilot-page">
      <div className="work-surface__heading">
        <div>
          <h1 id="autopilot-heading">{appMessage(locale, 'autopilot.heading')}</h1>
          <p>{appMessage(locale, 'autopilot.caption')}</p>
        </div>
        <Status kind="info">Hybrid</Status>
      </div>
      <div className="autopilot-grid">
        <ProfileAuthoring onSaved={() => undefined} profiles={dashboard.profiles} />
        <AssignmentList dashboard={dashboard} paused={paused} onPause={pause} />
        <ApprovalQueue
          approvals={dashboard.approvals}
          decisions={decisions}
          onDecision={decide}
          previews={dashboard.previews}
        />
        <Exceptions dashboard={dashboard} />
        <RecentOutcomes
          executions={dashboard.executions}
          onUndo={undo}
          requestedUndo={requestedUndo}
        />
      </div>
      <p className="authority-note">{appMessage(locale, 'access.clientHint')}</p>
      <p className="authority-note">
        {dateLabel(locale, dashboard.profiles[0]?.updatedAt ?? new Date(0).toISOString())}
      </p>
    </section>
  );
}

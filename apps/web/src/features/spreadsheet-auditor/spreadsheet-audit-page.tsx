import { Button, Status } from '@databreeze/ui/v1';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import { appMessage } from '../../app/messages.ts';
import { useLocale } from '../../app/locale-context.tsx';
import { getSpreadsheetAudit, listSpreadsheetAudits } from './spreadsheet-audit-api.ts';
import type {
  SpreadsheetAuditFindingV1,
  SpreadsheetAuditResultV1,
} from '@databreeze/domain/spreadsheet-audit/v1';

function severityKind(
  severity: SpreadsheetAuditFindingV1['severity'],
): 'danger' | 'info' | 'warning' {
  if (severity === 'ERROR') return 'danger';
  if (severity === 'INFO') return 'info';
  return 'warning';
}

function severityLabel(
  locale: ReturnType<typeof useLocale>,
  severity: SpreadsheetAuditFindingV1['severity'],
): string {
  if (severity === 'ERROR') return appMessage(locale, 'spreadsheetAudit.severity.error');
  if (severity === 'INFO') return appMessage(locale, 'spreadsheetAudit.severity.info');
  return appMessage(locale, 'spreadsheetAudit.severity.warning');
}

function findingKindLabel(
  locale: ReturnType<typeof useLocale>,
  kind: SpreadsheetAuditFindingV1['kind'],
): string {
  return kind === 'FORMULA_GAP'
    ? appMessage(locale, 'spreadsheetAudit.finding.kind.gap')
    : appMessage(locale, 'spreadsheetAudit.finding.kind.outlier');
}

function blockedReasonLabel(
  locale: ReturnType<typeof useLocale>,
  reason: SpreadsheetAuditResultV1['blockedReasons'][number],
): string {
  if (reason === 'MACRO') return appMessage(locale, 'spreadsheetAudit.blocked.macro');
  if (reason === 'EXTERNAL_LINK')
    return appMessage(locale, 'spreadsheetAudit.blocked.externalLink');
  return appMessage(locale, 'spreadsheetAudit.blocked.unsupportedXml');
}

function formatDate(locale: ReturnType<typeof useLocale>, value: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function auditHeading(locale: ReturnType<typeof useLocale>) {
  return (
    <div className="work-surface__heading">
      <div>
        <h1 id="spreadsheet-audit-heading">{appMessage(locale, 'spreadsheetAudit.heading')}</h1>
        <p>{appMessage(locale, 'spreadsheetAudit.caption')}</p>
      </div>
    </div>
  );
}

function AuditState({
  kind,
  message,
  action,
}: {
  readonly kind: 'danger' | 'info';
  readonly message: string;
  readonly action?: ReactNode;
}) {
  return (
    <>
      <Status kind={kind}>{message}</Status>
      {action}
    </>
  );
}

function findingSummary(result: SpreadsheetAuditResultV1): string {
  return `${result.findings.length}`;
}

function resultLink(locale: ReturnType<typeof useLocale>, auditId: string): string {
  return `/${locale}/audit/${encodeURIComponent(auditId)}`;
}

function AuditList() {
  const locale = useLocale();
  const [searchParams] = useSearchParams();
  const artifactVersionId = searchParams.get('artifactVersionId') ?? '';
  const parsedArtifactVersionId = parseStableIdentifierV1(artifactVersionId);
  const artifactId = parsedArtifactVersionId.accepted ? parsedArtifactVersionId.value : undefined;
  const query = useQuery({
    queryKey: ['spreadsheet-audits', artifactId],
    queryFn: ({ signal }) => listSpreadsheetAudits(artifactId, signal),
    enabled: artifactId !== undefined,
    retry: false,
  });

  return (
    <section aria-labelledby="spreadsheet-audit-heading" className="feature-surface">
      {auditHeading(locale)}
      {artifactId === undefined ? (
        <p className="spreadsheet-audit__empty">
          {appMessage(locale, 'spreadsheetAudit.selectArtifact')}
        </p>
      ) : query.isPending ? (
        <AuditState kind="info" message={appMessage(locale, 'spreadsheetAudit.loading')} />
      ) : query.isError ? (
        <AuditState
          action={
            <Button
              className="spreadsheet-audit__retry"
              onClick={() => void query.refetch()}
              variant="secondary"
            >
              {appMessage(locale, 'spreadsheetAudit.retry')}
            </Button>
          }
          kind="danger"
          message={appMessage(locale, 'spreadsheetAudit.error')}
        />
      ) : query.data.length === 0 ? (
        <p className="spreadsheet-audit__empty">{appMessage(locale, 'spreadsheetAudit.empty')}</p>
      ) : (
        <div className="table-scroll" tabIndex={0}>
          <table aria-label={appMessage(locale, 'spreadsheetAudit.heading')}>
            <thead>
              <tr>
                <th scope="col">{appMessage(locale, 'spreadsheetAudit.column.audit')}</th>
                <th scope="col">{appMessage(locale, 'spreadsheetAudit.column.created')}</th>
                <th scope="col">{appMessage(locale, 'spreadsheetAudit.column.sheets')}</th>
                <th scope="col">{appMessage(locale, 'spreadsheetAudit.column.findings')}</th>
                <th scope="col">{appMessage(locale, 'spreadsheetAudit.column.status')}</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((result) => (
                <tr key={result.auditId}>
                  <td>
                    <Link className="text-action" to={resultLink(locale, result.auditId)}>
                      <code>{result.auditId}</code>
                    </Link>
                  </td>
                  <td>
                    <time dateTime={result.createdAt}>{formatDate(locale, result.createdAt)}</time>
                  </td>
                  <td>{result.sheets.length}</td>
                  <td>{findingSummary(result)}</td>
                  <td>
                    <Status kind={result.blockedReasons.length > 0 ? 'warning' : 'success'}>
                      {result.blockedReasons.length > 0
                        ? appMessage(locale, 'spreadsheetAudit.status.partial')
                        : appMessage(locale, 'spreadsheetAudit.status.ready')}
                    </Status>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="authority-note">{appMessage(locale, 'access.clientHint')}</p>
    </section>
  );
}

function AuditDetail({ auditId }: { readonly auditId: string }) {
  const locale = useLocale();
  const query = useQuery({
    queryKey: ['spreadsheet-audit', auditId],
    queryFn: ({ signal }) => getSpreadsheetAudit(auditId, signal),
    retry: false,
  });

  if (query.isPending) {
    return (
      <section aria-labelledby="spreadsheet-audit-heading" className="feature-surface">
        {auditHeading(locale)}
        <AuditState kind="info" message={appMessage(locale, 'spreadsheetAudit.loading')} />
      </section>
    );
  }

  if (query.isError) {
    return (
      <section aria-labelledby="spreadsheet-audit-heading" className="feature-surface">
        {auditHeading(locale)}
        <AuditState
          action={
            <Button
              className="spreadsheet-audit__retry"
              onClick={() => void query.refetch()}
              variant="secondary"
            >
              {appMessage(locale, 'spreadsheetAudit.retry')}
            </Button>
          }
          kind="danger"
          message={appMessage(locale, 'spreadsheetAudit.error')}
        />
        <Link className="text-action spreadsheet-audit__back" to={`/${locale}/audit`}>
          {appMessage(locale, 'spreadsheetAudit.back')}
        </Link>
      </section>
    );
  }

  const result = query.data;
  const sheetNames = new Map(result.sheets.map((sheet) => [sheet.sheetId, sheet.name]));
  return (
    <section aria-labelledby="spreadsheet-audit-detail-heading" className="feature-surface">
      <Link
        className="text-action spreadsheet-audit__back"
        to={`/${locale}/audit?artifactVersionId=${encodeURIComponent(result.artifactVersionId)}`}
      >
        {appMessage(locale, 'spreadsheetAudit.back')}
      </Link>
      <div className="work-surface__heading spreadsheet-audit__detail-heading">
        <div>
          <h1 id="spreadsheet-audit-detail-heading">
            {appMessage(locale, 'spreadsheetAudit.detail.heading')}
          </h1>
          <p>
            <code>{result.auditId}</code>
          </p>
        </div>
        <Status kind={result.blockedReasons.length > 0 ? 'warning' : 'success'}>
          {result.blockedReasons.length > 0
            ? appMessage(locale, 'spreadsheetAudit.status.partial')
            : appMessage(locale, 'spreadsheetAudit.status.ready')}
        </Status>
      </div>
      <dl className="spreadsheet-audit__summary">
        <div>
          <dt>{appMessage(locale, 'spreadsheetAudit.detail.created')}</dt>
          <dd>
            <time dateTime={result.createdAt}>{formatDate(locale, result.createdAt)}</time>
          </dd>
        </div>
        <div>
          <dt>{appMessage(locale, 'spreadsheetAudit.detail.sheets')}</dt>
          <dd>{result.sheets.length}</dd>
        </div>
        <div>
          <dt>{appMessage(locale, 'spreadsheetAudit.detail.findings')}</dt>
          <dd>{result.findings.length}</dd>
        </div>
      </dl>
      {result.blockedReasons.length > 0 ? (
        <div className="spreadsheet-audit__blocked" role="note">
          <h2>{appMessage(locale, 'spreadsheetAudit.detail.blocked')}</h2>
          <ul>
            {result.blockedReasons.map((reason) => (
              <li key={reason}>{blockedReasonLabel(locale, reason)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="spreadsheet-audit__findings">
        <h2>{appMessage(locale, 'spreadsheetAudit.detail.findingsHeading')}</h2>
        {result.findings.length === 0 ? (
          <p className="spreadsheet-audit__empty">
            {appMessage(locale, 'spreadsheetAudit.detail.noFindings')}
          </p>
        ) : (
          <div className="table-scroll" tabIndex={0}>
            <table aria-label={appMessage(locale, 'spreadsheetAudit.detail.findingsHeading')}>
              <thead>
                <tr>
                  <th scope="col">{appMessage(locale, 'spreadsheetAudit.finding.column.sheet')}</th>
                  <th scope="col">
                    {appMessage(locale, 'spreadsheetAudit.finding.column.address')}
                  </th>
                  <th scope="col">{appMessage(locale, 'spreadsheetAudit.finding.column.kind')}</th>
                  <th scope="col">
                    {appMessage(locale, 'spreadsheetAudit.finding.column.severity')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.findings.map((finding) => (
                  <tr key={finding.findingId}>
                    <td>
                      {sheetNames.get(finding.sheetId) ??
                        appMessage(locale, 'spreadsheetAudit.unknownSheet')}
                    </td>
                    <td>
                      <code>{finding.address}</code>
                    </td>
                    <td>{findingKindLabel(locale, finding.kind)}</td>
                    <td>
                      <Status kind={severityKind(finding.severity)}>
                        {severityLabel(locale, finding.severity)}
                      </Status>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="authority-note">{appMessage(locale, 'spreadsheetAudit.detail.valueFree')}</p>
    </section>
  );
}

export function SpreadsheetAuditPage() {
  const { auditId } = useParams();
  return auditId === undefined ? <AuditList /> : <AuditDetail auditId={auditId} />;
}

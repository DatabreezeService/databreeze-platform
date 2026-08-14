import {
  createDashboardVersionV1,
  DDA_SCHEMA_VERSION_V1,
  type DashboardVersionV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import type {
  DdaDashboardAuthoringCommand,
  ChartProposalOption,
  ChartSpan,
} from '@databreeze/contracts/v3';
import { parseV3Contract } from '@databreeze/contracts/v3';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import type { DashboardLayoutCellV1 } from '@databreeze/domain/data-to-dashboard/v1';
import { createHash, randomUUID } from 'node:crypto';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type { DdaAudComposePortV1 } from '../../application/foundation-ports.js';
import type { DashboardAuthorizationPortV1 } from './dashboard-authorization.port.js';
import type {
  DashboardAuthoringCommandResultV1,
  DashboardAuthoringCommitInputV1,
  DashboardDraftRepositoryPortV1,
} from './dashboard-repository.port.js';
import type { DashboardProposalRepositoryPortV1 } from './dashboard-proposal-repository.port.js';

export type DashboardDraftErrorCodeV1 =
  | 'UNSUPPORTED_WIDGET'
  | 'CERTIFIED_DEFINITION_LOCKED'
  | 'VERSION_NOT_FOUND'
  | 'WIDGET_NOT_FOUND'
  | 'INVALID_FILTER'
  | 'INVALID_VERSION'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'INVALID_COMMAND'
  | 'INVALID_SELECTION'
  | 'INVALID_LAYOUT'
  | 'INVALID_PRESENTATION'
  | 'REVISION_CONFLICT'
  | 'COMMAND_CONFLICT'
  | 'UNAVAILABLE';

export type DashboardDraftResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DashboardDraftErrorCodeV1 };

export interface DashboardDraftReadModelV1 {
  readonly dashboardId: string;
  readonly versionId: string;
  readonly revision: number;
  readonly pages: readonly {
    readonly pageId: string;
    readonly title: { readonly vi: string; readonly en: string };
  }[];
  readonly widgets: readonly {
    readonly widgetId: string;
    readonly type: string;
    readonly pageId: string;
    readonly title: { readonly vi: string; readonly en: string };
    readonly values: readonly { readonly label: string; readonly value: string }[];
  }[];
  readonly filters: readonly {
    readonly filterId: string;
    readonly field: string;
    readonly operator: string;
    readonly scope: string;
  }[];
  readonly freshness: string;
  readonly warning: string;
}

export interface DashboardDraftServiceOptionsV1 {
  readonly proposalRepository?: DashboardProposalRepositoryPortV1;
  readonly aud?: DdaAudComposePortV1;
  readonly now?: () => string;
}

type DashboardVersionPresentationV1 = {
  readonly showTitle?: boolean;
  readonly showLegend?: boolean;
  readonly showEvidence?: boolean;
};

type DashboardVersionWithPresentationV1 = DashboardVersionV1 & {
  readonly presentation?: DashboardVersionPresentationV1;
};
type DashboardLayoutBreakpointV1 = keyof DashboardVersionV1['pages'][number]['layout'];

const AUTHORING_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v3/dda-dashboard-authoring-command' as const;
const WIDGET_TYPES = new Set([
  'KPI',
  'TABLE',
  'BAR',
  'LINE',
  'AREA',
  'PIE',
  'DONUT',
  'TEXT_NOTE',
  'EVIDENCE_NOTE',
]);

function rejected<T>(code: DashboardDraftErrorCodeV1): DashboardDraftResultV1<T> {
  return Object.freeze({ accepted: false as const, code });
}

function serverTimestamp(now: () => string): string {
  const value = now();
  return value.length > 0 ? value : new Date().toISOString();
}

function canonicalHash(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function stableIdentifier(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('DDA_AUTHORING_IDENTIFIER_INVALID');
  return parsed.value;
}

function nextVersion(
  current: DashboardVersionV1,
  input: {
    readonly pages?: DashboardVersionV1['pages'];
    readonly widgets?: DashboardVersionV1['widgets'];
    readonly presentation?: DashboardVersionPresentationV1;
    readonly createdAt: string;
  },
): DashboardVersionV1 | undefined {
  const versionId = randomUUID();
  const pages = input.pages ?? current.pages;
  const widgets = input.widgets ?? current.widgets;
  const canonicalState = {
    schemaVersion: DDA_SCHEMA_VERSION_V1,
    dashboardId: current.dashboardId,
    versionId,
    tenantScope: current.tenantScope,
    parentVersionId: current.versionId,
    pages,
    widgets,
    filters: current.filters,
    datasetBindings: current.datasetBindings,
    locale: current.locale,
    timezone: current.timezone,
    freshnessPolicy: current.freshnessPolicy,
    publicationPolicy: current.publicationPolicy,
    createdAt: input.createdAt,
    ...(input.presentation === undefined ? {} : { presentation: input.presentation }),
  };
  const created = createDashboardVersionV1({
    ...canonicalState,
    canonicalHash: canonicalHash(canonicalState),
  });
  if (!created.accepted) return undefined;
  if (input.presentation === undefined) return created.value;
  return Object.freeze({
    ...created.value,
    presentation: Object.freeze(input.presentation),
  }) as DashboardVersionWithPresentationV1;
}

function isChartSpan(value: number): value is ChartSpan {
  return value === 3 || value === 4 || value === 6 || value === 8 || value === 12;
}

function optionSpan(option: ChartProposalOption, fallback: number): ChartSpan {
  const requested = Number.isSafeInteger(option.defaultSpan) ? option.defaultSpan : fallback;
  const supported: readonly number[] = option.supportedSpans.filter((span) =>
    Number.isSafeInteger(span),
  );
  const selected =
    isChartSpan(requested) && supported.includes(requested)
      ? requested
      : (supported[0] ?? fallback);
  return isChartSpan(selected) ? selected : 6;
}

function layoutWithAddedWidget(
  page: DashboardVersionV1['pages'][number],
  widgetId: StableIdentifierV1,
  span: number,
): DashboardVersionV1['pages'][number] {
  const y = Math.max(
    0,
    ...page.layout.desktop.map((cell) => cell.y + cell.h),
    ...page.layout.tablet.map((cell) => cell.y + cell.h),
    ...page.layout.mobile.map((cell) => cell.y + cell.h),
  );
  return {
    ...page,
    layout: {
      desktop: [
        ...page.layout.desktop,
        { widgetId, x: 0, y, w: span, h: 4 } as DashboardLayoutCellV1,
      ],
      tablet: [
        ...page.layout.tablet,
        { widgetId, x: 0, y, w: Math.min(12, span), h: 4 } as DashboardLayoutCellV1,
      ],
      mobile: [
        ...page.layout.mobile,
        { widgetId, x: 0, y, w: Math.min(4, span), h: 4 } as DashboardLayoutCellV1,
      ],
    },
  };
}

function validLayoutCells(
  current: DashboardVersionV1,
  breakpoint: DashboardLayoutBreakpointV1,
  cells: readonly {
    readonly widgetId: string;
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  }[],
): boolean {
  const widgets = new Set(current.widgets.map((widget) => String(widget.widgetId)));
  const targetWidgetIds = new Set(
    current.pages.flatMap((page) => page.layout[breakpoint].map((cell) => String(cell.widgetId))),
  );
  const seen = new Set<string>();
  if (cells.length === 0 || targetWidgetIds.size === 0) return false;
  return (
    cells.every((cell) => {
      if (!widgets.has(cell.widgetId) || seen.has(cell.widgetId)) return false;
      seen.add(cell.widgetId);
      return (
        Number.isSafeInteger(cell.x) &&
        Number.isSafeInteger(cell.y) &&
        Number.isSafeInteger(cell.w) &&
        Number.isSafeInteger(cell.h) &&
        cell.x >= 0 &&
        cell.y >= 0 &&
        cell.w >= 1 &&
        cell.w <= 12 &&
        cell.h >= 1 &&
        cell.x + cell.w <= 12
      );
    }) &&
    seen.size === targetWidgetIds.size &&
    [...targetWidgetIds].every((widgetId) => seen.has(widgetId))
  );
}

/** DDA-020..024: versioned draft acceptance, restore, and certified-lock guards. */
export class DashboardDraftServiceV1 {
  public constructor(
    private readonly repository: DashboardDraftRepositoryPortV1,
    private readonly authorization?: DashboardAuthorizationPortV1,
    private readonly options: DashboardDraftServiceOptionsV1 = {},
  ) {}

  private async authorizeEdit(context: IamTenantContextV1, dashboardId: string): Promise<boolean> {
    if (this.authorization === undefined) return true;
    const decision = await this.authorization.authorizeDashboardAction({
      context,
      tenantScope: context.tenantScope,
      actorId: context.actorId,
      dashboardId,
      action: 'EDIT',
    });
    return decision.allowed;
  }

  /** DDA-022..026: apply only generated, non-publication authoring commands. */
  public async applyAuthoringCommand(
    context: IamTenantContextV1,
    command: DdaDashboardAuthoringCommand,
  ): Promise<DashboardDraftResultV1<DashboardAuthoringCommandResultV1>> {
    const parsed = parseV3Contract<DdaDashboardAuthoringCommand>(AUTHORING_SCHEMA_ID, command);
    if (!parsed.accepted) return rejected('INVALID_COMMAND');
    const input = parsed.value;
    if (this.authorization) {
      const decision = await this.authorization.authorizeDashboardAction({
        context,
        tenantScope: context.tenantScope,
        actorId: context.actorId,
        dashboardId: input.dashboardId,
        action: 'EDIT',
      });
      if (!decision.allowed) return rejected('UNAUTHORIZED');
    }

    const replay = await this.repository.findCommandResult(context.tenantScope, input.commandId);
    if (replay !== undefined) return Object.freeze({ accepted: true, value: replay });

    const identity = await this.repository.findIdentity(context.tenantScope, input.dashboardId);
    if (identity === undefined || identity.draftVersionId === undefined) {
      return rejected('NOT_FOUND');
    }
    if (
      identity.revision !== input.expectedRevision ||
      identity.draftVersionId !== input.expectedVersionId
    ) {
      return rejected('REVISION_CONFLICT');
    }
    const current = await this.repository.findVersion(context.tenantScope, identity.draftVersionId);
    if (current === undefined || current.dashboardId !== input.dashboardId)
      return rejected('NOT_FOUND');

    const now = serverTimestamp(this.options.now ?? (() => new Date().toISOString()));
    let pages = current.pages;
    let widgets = current.widgets;
    let removedWidget: DashboardAuthoringCommitInputV1['removedWidget'];
    let presentation: DashboardVersionPresentationV1 | undefined = (
      current as DashboardVersionWithPresentationV1
    ).presentation;
    let acceptedProposalId: string | undefined;
    let proposalAcceptanceAttempted = false;
    let proposalAcceptanceSucceeded = false;
    let proposalAcceptanceOutcomeUnknown = false;

    if (input.kind === 'ACCEPT_PROPOSAL') {
      if (
        this.options.proposalRepository === undefined ||
        this.options.proposalRepository.markProposed === undefined
      ) {
        return rejected('UNAVAILABLE');
      }
      const record = await this.options.proposalRepository.findById(
        context.tenantScope,
        input.proposalId,
      );
      if (
        record === undefined ||
        record.state !== 'PROPOSED' ||
        record.proposal.dashboardId !== input.dashboardId ||
        record.proposal.parentVersionId !== current.versionId ||
        record.proposal.expectedRevision !== identity.revision
      ) {
        return rejected('NOT_FOUND');
      }
      const selected = new Set(input.selectedOptionIds);
      const options = record.proposal.options.filter((option) => selected.has(option.optionId));
      if (
        options.length !== input.selectedOptionIds.length ||
        options.some((option) => !WIDGET_TYPES.has(option.type))
      ) {
        return rejected('INVALID_SELECTION');
      }
      const targetPageId = record.proposal.target?.pageId ?? current.pages[0]?.pageId;
      if (
        targetPageId === undefined ||
        !current.pages.some((page) => page.pageId === targetPageId)
      ) {
        return rejected('INVALID_SELECTION');
      }
      for (const option of options) {
        const widgetId = stableIdentifier(randomUUID());
        widgets = [
          ...widgets,
          {
            widgetId,
            type: option.type as DashboardVersionV1['widgets'][number]['type'],
            pageId: stableIdentifier(targetPageId),
            binding: {
              analysisPlanVersionId: stableIdentifier(option.binding.analysisPlanVersionId),
              materializationDefinitionId: stableIdentifier(
                option.binding.materializationDefinitionId,
              ),
            },
            title: option.title,
          },
        ];
        pages = pages.map((page) =>
          page.pageId === targetPageId
            ? layoutWithAddedWidget(page, widgetId, optionSpan(option, 6))
            : page,
        );
      }
      acceptedProposalId = record.proposal.proposalId;
    } else if (input.kind === 'SET_LAYOUT') {
      if (
        !validLayoutCells(current, input.breakpoint as DashboardLayoutBreakpointV1, input.cells)
      ) {
        return rejected('INVALID_LAYOUT');
      }
      const pageByWidget = new Map(
        current.widgets.map((widget) => [String(widget.widgetId), widget.pageId]),
      );
      const cellsByPage = new Map<string, typeof input.cells>();
      for (const cell of input.cells) {
        const pageId = pageByWidget.get(cell.widgetId);
        if (pageId === undefined) return rejected('INVALID_LAYOUT');
        const pageCells = cellsByPage.get(pageId) ?? [];
        cellsByPage.set(pageId, [...pageCells, cell]);
      }
      pages = current.pages.map((page) => {
        const nextCells = cellsByPage.get(page.pageId);
        if (nextCells === undefined) return page;
        return {
          ...page,
          layout: {
            ...page.layout,
            [input.breakpoint]: nextCells.map(
              (cell) =>
                ({
                  widgetId: stableIdentifier(cell.widgetId),
                  x: cell.x,
                  y: cell.y,
                  w: cell.w,
                  h: cell.h,
                }) as DashboardLayoutCellV1,
            ),
          },
        } as DashboardVersionV1['pages'][number];
      });
    } else if (input.kind === 'REMOVE_WIDGET') {
      const widget = current.widgets.find((item) => item.widgetId === input.widgetId);
      if (widget === undefined) return rejected('WIDGET_NOT_FOUND');
      if (current.widgets.length <= 1) return rejected('INVALID_VERSION');
      widgets = current.widgets.filter((item) => item.widgetId !== input.widgetId);
      pages = current.pages.map((page) => ({
        ...page,
        layout: {
          desktop: page.layout.desktop.filter((cell) => cell.widgetId !== input.widgetId),
          tablet: page.layout.tablet.filter((cell) => cell.widgetId !== input.widgetId),
          mobile: page.layout.mobile.filter((cell) => cell.widgetId !== input.widgetId),
        },
      }));
      removedWidget = {
        dashboardId: input.dashboardId,
        widgetId: input.widgetId,
        widget,
      };
    } else if (input.kind === 'RESTORE_WIDGET') {
      if (current.widgets.some((item) => item.widgetId === input.widgetId))
        return rejected('WIDGET_NOT_FOUND');
      const widget = await this.repository.findRemovedWidget({
        tenantScope: context.tenantScope,
        dashboardId: input.dashboardId,
        widgetId: input.widgetId,
      });
      if (widget === undefined) return rejected('WIDGET_NOT_FOUND');
      if (!current.pages.some((page) => page.pageId === widget.pageId))
        return rejected('INVALID_VERSION');
      widgets = [...current.widgets, widget];
      pages = current.pages.map((page) =>
        page.pageId === widget.pageId ? layoutWithAddedWidget(page, widget.widgetId, 6) : page,
      );
    } else if (input.kind === 'CONFIGURE_PRESENTATION') {
      const widget = current.widgets.find((item) => item.widgetId === input.widgetId);
      if (widget === undefined || (input.title === undefined && input.display === undefined)) {
        return rejected(widget === undefined ? 'WIDGET_NOT_FOUND' : 'INVALID_PRESENTATION');
      }
      if (input.title !== undefined) {
        widgets = current.widgets.map((item) =>
          item.widgetId === input.widgetId ? { ...item, title: input.title! } : item,
        );
      }
      if (input.display !== undefined) {
        presentation = Object.freeze({ ...(presentation ?? {}), ...input.display });
      }
    } else {
      return rejected('INVALID_COMMAND');
    }

    const rollbackProposal = async (): Promise<boolean> => {
      if (
        acceptedProposalId === undefined ||
        !proposalAcceptanceAttempted ||
        (!proposalAcceptanceSucceeded && !proposalAcceptanceOutcomeUnknown)
      ) {
        return true;
      }
      const proposalRepository = this.options.proposalRepository;
      if (proposalRepository?.markProposed === undefined) return false;
      try {
        await proposalRepository.markProposed(context.tenantScope, acceptedProposalId);
        const restored = await proposalRepository.findById(context.tenantScope, acceptedProposalId);
        return restored !== undefined && restored.state !== 'ACCEPTED';
      } catch {
        return false;
      }
    };
    const version = nextVersion(current, {
      pages,
      widgets,
      ...(presentation === undefined ? {} : { presentation }),
      createdAt: now,
    });
    if (version === undefined) {
      return rejected('INVALID_VERSION');
    }
    if (acceptedProposalId !== undefined) {
      proposalAcceptanceAttempted = true;
      let marked = false;
      try {
        marked = await this.options.proposalRepository!.markAccepted(
          context.tenantScope,
          acceptedProposalId,
          version.versionId,
        );
      } catch {
        proposalAcceptanceOutcomeUnknown = true;
        marked = false;
      }
      if (marked !== true) {
        const restored = await rollbackProposal();
        if (!restored) return rejected('UNAVAILABLE');
        return rejected('UNAVAILABLE');
      }
      proposalAcceptanceSucceeded = true;
    }
    const commandResult: DashboardAuthoringCommandResultV1 = Object.freeze({
      commandId: input.commandId,
      dashboardId: input.dashboardId,
      versionId: version.versionId,
      revision: identity.revision + 1,
      savedAt: now,
      publishes: false,
    });
    let commit;
    try {
      commit = await this.repository.commitAuthoringVersion({
        tenantScope: context.tenantScope,
        expectedRevision: input.expectedRevision,
        identity: {
          ...identity,
          draftVersionId: version.versionId,
          revision: commandResult.revision,
        },
        version,
        commandResult,
        ...(removedWidget === undefined ? {} : { removedWidget }),
      });
    } catch {
      const restored = await rollbackProposal();
      if (!restored) return rejected('UNAVAILABLE');
      return rejected('UNAVAILABLE');
    }
    if (!commit.accepted) {
      const restored = await rollbackProposal();
      if (!restored) return rejected('UNAVAILABLE');
      return rejected(commit.code);
    }
    await this.options.aud?.emitContentSafeSummary({
      tenantScope: context.tenantScope,
      action: `DDA_DASHBOARD_AUTHORING_${input.kind}`,
      outcome: 'SUCCEEDED',
      correlationId: context.correlationId,
      references: [input.dashboardId, input.commandId, version.versionId],
    });
    return Object.freeze({ accepted: true, value: commandResult });
  }

  /** DDA-020: authorize and return the current scoped draft without inventing result cells. */
  public async readCurrentDraft(
    context: IamTenantContextV1,
    dashboardId: string,
  ): Promise<DashboardDraftResultV1<DashboardDraftReadModelV1>> {
    if (this.authorization) {
      const decision = await this.authorization.authorizeDashboardAction({
        context,
        tenantScope: context.tenantScope,
        actorId: context.actorId,
        dashboardId,
        action: 'VIEW',
      });
      if (!decision.allowed) {
        return Object.freeze({ accepted: false, code: 'UNAUTHORIZED' as const });
      }
    }

    const identity = await this.repository.findIdentity(context.tenantScope, dashboardId);
    if (!identity?.draftVersionId) {
      return Object.freeze({ accepted: false, code: 'NOT_FOUND' as const });
    }
    const version = await this.repository.findVersion(context.tenantScope, identity.draftVersionId);
    if (!version) {
      return Object.freeze({ accepted: false, code: 'NOT_FOUND' as const });
    }

    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        dashboardId: version.dashboardId,
        versionId: version.versionId,
        revision: identity.revision,
        pages: Object.freeze(
          version.pages.map((page) =>
            Object.freeze({
              pageId: page.pageId,
              title: page.title,
            }),
          ),
        ),
        widgets: Object.freeze(
          version.widgets.map((widget) =>
            Object.freeze({
              widgetId: widget.widgetId,
              type: widget.type,
              pageId: widget.pageId,
              title: widget.title,
              // Draft reads never invent authoritative cell values (DDA-010).
              values: Object.freeze([]),
            }),
          ),
        ),
        filters: Object.freeze(
          version.filters.map((filter) =>
            Object.freeze({
              filterId: filter.filterId,
              field: filter.field,
              operator: filter.operator,
              scope: filter.scope,
            }),
          ),
        ),
        freshness: identity.status,
        warning:
          'Draft values are structural only until a complete authorized snapshot is available.',
      }),
    });
  }

  public async acceptProposal(
    context: IamTenantContextV1,
    input: {
      readonly proposalId: string;
      readonly version: Record<string, unknown>;
      readonly proposalSummary?: {
        readonly affectedPages: readonly string[];
        readonly affectedWidgets: readonly string[];
        readonly beforeAfter: string;
        readonly assumptions: readonly string[];
        readonly estimatedCost: { readonly cpuMs: number; readonly memoryMb: number };
      };
    },
  ): Promise<DashboardDraftResultV1<DashboardVersionV1>> {
    void input.proposalId;
    void input.proposalSummary;
    let dashboardId: string;
    try {
      dashboardId = stableIdentifier(String(input.version['dashboardId']));
    } catch {
      return rejected('INVALID_VERSION');
    }
    try {
      if (!(await this.authorizeEdit(context, dashboardId))) return rejected('UNAUTHORIZED');
    } catch {
      return rejected('UNAVAILABLE');
    }
    const created = createDashboardVersionV1({
      dashboardId,
      versionId: input.version['versionId'],
      tenantScope: context.tenantScope,
      parentVersionId: input.version['parentVersionId'],
      parentTenantScope: input.version['parentTenantScope'],
      pages: input.version['pages'],
      widgets: input.version['widgets'],
      filters: input.version['filters'],
      datasetBindings: input.version['datasetBindings'],
      locale: input.version['locale'],
      timezone: input.version['timezone'],
      freshnessPolicy: input.version['freshnessPolicy'],
      publicationPolicy: input.version['publicationPolicy'],
      canonicalHash: input.version['canonicalHash'],
      createdAt: input.version['createdAt'],
    });
    if (!created.accepted) {
      return Object.freeze({
        accepted: false,
        code:
          created.code === 'UNSUPPORTED_WIDGET'
            ? ('UNSUPPORTED_WIDGET' as const)
            : ('INVALID_VERSION' as const),
      });
    }

    await this.repository.saveVersion(created.value);
    await this.repository.saveIdentity({
      dashboardId: created.value.dashboardId,
      tenantScope: created.value.tenantScope,
      title: { vi: 'Bang dieu khien', en: 'Dashboard' },
      status: 'DRAFT',
      draftVersionId: created.value.versionId,
      revision: 1,
    });
    return Object.freeze({ accepted: true, value: created.value });
  }

  public async restoreWidget(
    context: IamTenantContextV1,
    input: {
      readonly dashboardId: string;
      readonly versionId: string;
      readonly widgetId: string;
    },
  ): Promise<DashboardDraftResultV1<DashboardVersionV1>> {
    try {
      if (!(await this.authorizeEdit(context, input.dashboardId))) return rejected('UNAUTHORIZED');
    } catch {
      return rejected('UNAVAILABLE');
    }
    const current = await this.repository.findVersion(context.tenantScope, input.versionId);
    if (!current) return Object.freeze({ accepted: false, code: 'VERSION_NOT_FOUND' as const });

    let widget = current.widgets.find((item) => item.widgetId === input.widgetId);
    if (!widget) {
      widget = await this.repository.findRemovedWidget({
        tenantScope: context.tenantScope,
        dashboardId: input.dashboardId,
        widgetId: input.widgetId,
      });
    }
    if (!widget) return Object.freeze({ accepted: false, code: 'WIDGET_NOT_FOUND' as const });

    const nextWidgets = current.widgets.some((item) => item.widgetId === input.widgetId)
      ? current.widgets
      : [...current.widgets, widget];

    const next = createDashboardVersionV1({
      dashboardId: current.dashboardId,
      versionId: randomUUID(),
      tenantScope: current.tenantScope,
      parentVersionId: current.versionId,
      pages: current.pages,
      widgets: nextWidgets,
      filters: current.filters,
      datasetBindings: current.datasetBindings,
      locale: current.locale,
      timezone: current.timezone,
      freshnessPolicy: current.freshnessPolicy,
      publicationPolicy: current.publicationPolicy,
      canonicalHash: current.canonicalHash,
      createdAt: new Date().toISOString().replace(/\.\d{3}Z$/u, '.000Z'),
    });
    if (!next.accepted) {
      return Object.freeze({ accepted: false, code: 'INVALID_VERSION' as const });
    }
    await this.repository.saveVersion(next.value);
    await this.repository.saveIdentity({
      dashboardId: input.dashboardId,
      tenantScope: context.tenantScope,
      title: { vi: 'Bang dieu khien', en: 'Dashboard' },
      status: 'DRAFT',
      draftVersionId: next.value.versionId,
      revision: 2,
    });
    return Object.freeze({ accepted: true, value: next.value });
  }

  public async applyFilter(
    context: IamTenantContextV1,
    input: {
      readonly dashboardId: string;
      readonly versionId: string;
      readonly filter: {
        readonly filterId: string;
        readonly field: string;
        readonly operator: string;
        readonly scope: 'DASHBOARD' | 'PAGE' | 'WIDGET';
        readonly silentCertifiedMutation?: boolean;
      };
    },
  ): Promise<DashboardDraftResultV1<DashboardVersionV1>> {
    try {
      if (!(await this.authorizeEdit(context, input.dashboardId))) return rejected('UNAUTHORIZED');
    } catch {
      return rejected('UNAVAILABLE');
    }
    const current = await this.repository.findVersion(context.tenantScope, input.versionId);
    if (!current) return Object.freeze({ accepted: false, code: 'VERSION_NOT_FOUND' as const });
    if (
      current.publicationPolicy === 'CERTIFIED' &&
      input.filter.silentCertifiedMutation === true
    ) {
      return Object.freeze({ accepted: false, code: 'CERTIFIED_DEFINITION_LOCKED' as const });
    }
    if (!input.filter.field || !input.filter.operator) {
      return Object.freeze({ accepted: false, code: 'INVALID_FILTER' as const });
    }

    const nextFilters = [
      ...current.filters.filter((item) => item.filterId !== input.filter.filterId),
      {
        filterId: input.filter.filterId,
        field: input.filter.field,
        operator: input.filter.operator,
        scope: input.filter.scope,
      },
    ];
    const next = createDashboardVersionV1({
      dashboardId: current.dashboardId,
      versionId: randomUUID(),
      tenantScope: current.tenantScope,
      parentVersionId: current.versionId,
      pages: current.pages,
      widgets: current.widgets,
      filters: nextFilters,
      datasetBindings: current.datasetBindings,
      locale: current.locale,
      timezone: current.timezone,
      freshnessPolicy: current.freshnessPolicy,
      publicationPolicy: current.publicationPolicy,
      canonicalHash: current.canonicalHash,
      createdAt: new Date().toISOString().replace(/\.\d{3}Z$/u, '.000Z'),
    });
    if (!next.accepted) {
      return Object.freeze({ accepted: false, code: 'INVALID_VERSION' as const });
    }
    await this.repository.saveVersion(next.value);
    return Object.freeze({ accepted: true, value: next.value });
  }
}

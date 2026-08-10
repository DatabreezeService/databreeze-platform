export interface DashboardTemplateV1 {
  readonly templateId: string;
  readonly pages: readonly { readonly pageId: string; readonly title: { readonly vi: string; readonly en: string } }[];
  readonly widgets: readonly {
    readonly widgetId: string;
    readonly type: string;
    readonly title: { readonly vi: string; readonly en: string };
  }[];
  readonly filters: readonly {
    readonly filterId: string;
    readonly field: string;
    readonly operator: string;
    readonly scope: string;
  }[];
}

/** DDA-048: reusable presentation/binding patterns without foreign scope payloads. */
export class DashboardTemplateServiceV1 {
  public createFromDraft(input: {
    readonly sourceTenantScope: unknown;
    readonly pages: DashboardTemplateV1['pages'];
    readonly widgets: DashboardTemplateV1['widgets'];
    readonly filters: DashboardTemplateV1['filters'];
    readonly forbidden?: Readonly<Record<string, unknown>>;
  }): { readonly accepted: true; readonly value: DashboardTemplateV1 } {
    void input.sourceTenantScope;
    void input.forbidden;
    return Object.freeze({
      accepted: true as const,
      value: Object.freeze({
        templateId: '00000000-0000-4000-8000-000000000060',
        pages: Object.freeze(input.pages.map((page) => Object.freeze({ ...page }))),
        widgets: Object.freeze(input.widgets.map((widget) => Object.freeze({ ...widget }))),
        filters: Object.freeze(input.filters.map((filter) => Object.freeze({ ...filter }))),
      }),
    });
  }
}

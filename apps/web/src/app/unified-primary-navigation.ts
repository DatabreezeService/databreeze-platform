export type UdwPrimaryNavKeyV1 = 'dashboards' | 'analysis' | 'data';

export interface UdwPrimaryNavItemV1 {
  readonly key: UdwPrimaryNavKeyV1;
  readonly path: string;
}

/** WEB-002: signed-in primary rail has exactly three destinations. */
export const UDW_PRIMARY_NAV_ITEMS_V1 = Object.freeze([
  Object.freeze({ key: 'dashboards', path: 'dashboards' }),
  Object.freeze({ key: 'analysis', path: 'analysis' }),
  Object.freeze({ key: 'data', path: 'data' }),
] satisfies readonly UdwPrimaryNavItemV1[]);

export function udwPrimaryNavLabelsV1(locale: 'en' | 'vi-VN'): readonly [string, string, string] {
  if (locale === 'en') {
    return Object.freeze(['Dashboards', 'Analysis', 'Data'] as const);
  }
  return Object.freeze(['Bảng điều khiển', 'Phân tích', 'Dữ liệu'] as const);
}

export function udwPrimaryNavLabelV1(locale: 'en' | 'vi-VN', key: UdwPrimaryNavKeyV1): string {
  const index = UDW_PRIMARY_NAV_ITEMS_V1.findIndex((item) => item.key === key);
  return udwPrimaryNavLabelsV1(locale)[index] ?? key;
}

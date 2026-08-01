type DeepReadonly<Value> = Value extends object
  ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
  : Value;

function deepFreeze<const Value>(value: Value): DeepReadonly<Value> {
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value as DeepReadonly<Value>;
}

export const designTokenVersion = 1 as const;
export const designTokenEntriesV1 = deepFreeze([
  {
    name: 'color.background',
    type: 'color',
    value: '#FFFFFF',
  },
  {
    name: 'color.border',
    type: 'color',
    value: '#7A8499',
  },
  {
    name: 'color.focus',
    type: 'color',
    value: '#1D4ED8',
  },
  {
    name: 'color.onPrimary',
    type: 'color',
    value: '#FFFFFF',
  },
  {
    name: 'color.primary',
    type: 'color',
    value: '#344EF8',
  },
  {
    name: 'color.primaryHover',
    type: 'color',
    value: '#263BCF',
  },
  {
    name: 'color.status.danger.surface',
    type: 'color',
    value: '#FDEDEF',
  },
  {
    name: 'color.status.danger.text',
    type: 'color',
    value: '#A61B2B',
  },
  {
    name: 'color.status.info.surface',
    type: 'color',
    value: '#EAF3FF',
  },
  {
    name: 'color.status.info.text',
    type: 'color',
    value: '#15579A',
  },
  {
    name: 'color.status.success.surface',
    type: 'color',
    value: '#E9F8F0',
  },
  {
    name: 'color.status.success.text',
    type: 'color',
    value: '#146C43',
  },
  {
    name: 'color.status.warning.surface',
    type: 'color',
    value: '#FFF4D6',
  },
  {
    name: 'color.status.warning.text',
    type: 'color',
    value: '#754500',
  },
  {
    name: 'color.surface',
    type: 'color',
    value: '#F7F8FC',
  },
  {
    name: 'color.surfaceStrong',
    type: 'color',
    value: '#ECEFF6',
  },
  {
    name: 'color.text',
    type: 'color',
    value: '#171B2A',
  },
  {
    name: 'color.textMuted',
    type: 'color',
    value: '#4B5568',
  },
  {
    name: 'elevation.level0',
    type: 'dimension',
    unit: 'dp',
    value: 0,
  },
  {
    name: 'elevation.level1',
    type: 'dimension',
    unit: 'dp',
    value: 1,
  },
  {
    name: 'elevation.level2',
    type: 'dimension',
    unit: 'dp',
    value: 3,
  },
  {
    name: 'elevation.level3',
    type: 'dimension',
    unit: 'dp',
    value: 8,
  },
  {
    name: 'focus.ringOffset',
    type: 'dimension',
    unit: 'dp',
    value: 2,
  },
  {
    name: 'focus.ringWidth',
    type: 'dimension',
    unit: 'dp',
    value: 3,
  },
  {
    name: 'logo.mark.accessibleNamePolicy',
    type: 'string',
    value: 'required',
  },
  {
    name: 'logo.preserveAspectRatio',
    type: 'boolean',
    value: true,
  },
  {
    name: 'logo.recolorPolicy',
    type: 'string',
    value: 'forbidden',
  },
  {
    name: 'logo.wordmark.adjacentProductNamePolicy',
    type: 'string',
    value: 'forbidden',
  },
  {
    name: 'logo.wordmark.clearSpace',
    type: 'dimension',
    unit: 'dp',
    value: 10,
  },
  {
    name: 'logo.wordmark.minimumWidth',
    type: 'dimension',
    unit: 'dp',
    value: 120,
  },
  {
    name: 'motion.duration.fast',
    type: 'duration',
    unit: 'ms',
    value: 120,
  },
  {
    name: 'motion.duration.instant',
    type: 'duration',
    unit: 'ms',
    value: 0,
  },
  {
    name: 'motion.duration.normal',
    type: 'duration',
    unit: 'ms',
    value: 180,
  },
  {
    name: 'motion.duration.slow',
    type: 'duration',
    unit: 'ms',
    value: 240,
  },
  {
    name: 'motion.easing.emphasized',
    type: 'string',
    value: 'cubic-bezier(0.2, 0, 0, 1)',
  },
  {
    name: 'motion.easing.standard',
    type: 'string',
    value: 'cubic-bezier(0.2, 0, 0, 1)',
  },
  {
    name: 'radius.large',
    type: 'dimension',
    unit: 'dp',
    value: 12,
  },
  {
    name: 'radius.medium',
    type: 'dimension',
    unit: 'dp',
    value: 8,
  },
  {
    name: 'radius.pill',
    type: 'dimension',
    unit: 'dp',
    value: 999,
  },
  {
    name: 'radius.small',
    type: 'dimension',
    unit: 'dp',
    value: 4,
  },
  {
    name: 'sizing.controlMinimum',
    type: 'dimension',
    unit: 'dp',
    value: 44,
  },
  {
    name: 'sizing.iconLarge',
    type: 'dimension',
    unit: 'dp',
    value: 24,
  },
  {
    name: 'sizing.iconMedium',
    type: 'dimension',
    unit: 'dp',
    value: 20,
  },
  {
    name: 'sizing.iconSmall',
    type: 'dimension',
    unit: 'dp',
    value: 16,
  },
  {
    name: 'sizing.touchTargetMinimum',
    type: 'dimension',
    unit: 'dp',
    value: 44,
  },
  {
    name: 'spacing.0',
    type: 'dimension',
    unit: 'dp',
    value: 0,
  },
  {
    name: 'spacing.1',
    type: 'dimension',
    unit: 'dp',
    value: 4,
  },
  {
    name: 'spacing.12',
    type: 'dimension',
    unit: 'dp',
    value: 48,
  },
  {
    name: 'spacing.2',
    type: 'dimension',
    unit: 'dp',
    value: 8,
  },
  {
    name: 'spacing.3',
    type: 'dimension',
    unit: 'dp',
    value: 12,
  },
  {
    name: 'spacing.4',
    type: 'dimension',
    unit: 'dp',
    value: 16,
  },
  {
    name: 'spacing.6',
    type: 'dimension',
    unit: 'dp',
    value: 24,
  },
  {
    name: 'spacing.8',
    type: 'dimension',
    unit: 'dp',
    value: 32,
  },
  {
    name: 'status.danger.icon',
    type: 'string',
    value: 'error',
  },
  {
    name: 'status.info.icon',
    type: 'string',
    value: 'info',
  },
  {
    name: 'status.success.icon',
    type: 'string',
    value: 'check-circle',
  },
  {
    name: 'status.warning.icon',
    type: 'string',
    value: 'warning',
  },
  {
    name: 'typography.fontFamily.body',
    type: 'string',
    value: 'Be Vietnam Pro, Noto Sans, Segoe UI, ui-sans-serif, system-ui, sans-serif',
  },
  {
    name: 'typography.fontSize.body',
    type: 'dimension',
    unit: 'sp',
    value: 16,
  },
  {
    name: 'typography.fontSize.caption',
    type: 'dimension',
    unit: 'sp',
    value: 12,
  },
  {
    name: 'typography.fontSize.headingLarge',
    type: 'dimension',
    unit: 'sp',
    value: 30,
  },
  {
    name: 'typography.fontSize.headingMedium',
    type: 'dimension',
    unit: 'sp',
    value: 24,
  },
  {
    name: 'typography.fontSize.headingSmall',
    type: 'dimension',
    unit: 'sp',
    value: 20,
  },
  {
    name: 'typography.fontSize.label',
    type: 'dimension',
    unit: 'sp',
    value: 14,
  },
  {
    name: 'typography.fontWeight.medium',
    type: 'integer',
    value: 500,
  },
  {
    name: 'typography.fontWeight.regular',
    type: 'integer',
    value: 400,
  },
  {
    name: 'typography.fontWeight.semibold',
    type: 'integer',
    value: 600,
  },
  {
    name: 'typography.lineHeight.body',
    type: 'number',
    value: 1.5,
  },
  {
    name: 'typography.lineHeight.compact',
    type: 'number',
    value: 1.25,
  },
  {
    name: 'typography.numericFeature',
    type: 'string',
    value: 'tabular-nums',
  },
] as const);
export type DesignTokenV1 = (typeof designTokenEntriesV1)[number];

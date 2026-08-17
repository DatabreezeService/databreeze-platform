export interface DataApiBaseConfigurationV1 {
  readonly baseUrl: string;
}

function configuredString(
  environment: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = environment[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function dataApiBaseConfiguration(
  environment: Readonly<Record<string, unknown>> = import.meta.env,
): DataApiBaseConfigurationV1 {
  return Object.freeze({
    baseUrl: (configuredString(environment, 'VITE_DATABREEZE_API_BASE_URL') ?? '').replace(
      /\/$/u,
      '',
    ),
  });
}

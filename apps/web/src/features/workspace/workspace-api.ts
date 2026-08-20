import {
  parseV4Contract,
  type IamWorkspaceCreateAccepted,
  type IamWorkspaceCreateCommand,
} from '@databreeze/contracts/v4';

import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';

const WORKSPACE_CREATE_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/iam-workspace-create-accepted';

export class WorkspaceApiError extends Error {
  public constructor(
    readonly code: string,
    readonly status?: number,
  ) {
    super(code);
    this.name = 'WorkspaceApiError';
  }
}

export interface WorkspaceApiOptions {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
}

function configuredBaseUrl(): string {
  const configured: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
  return typeof configured === 'string' && configured.trim() !== ''
    ? configured.replace(/\/$/u, '')
    : '';
}

function idempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `workspace-${Date.now()}`;
}

export function createWorkspaceApi(options: WorkspaceApiOptions = {}) {
  const baseUrl = (options.baseUrl ?? configuredBaseUrl()).replace(/\/$/u, '');
  const fetcher = createSessionAwareFetchV1({
    apiBaseUrl: baseUrl,
    fetcher: options.fetcher ?? globalThis.fetch.bind(globalThis),
  });

  return Object.freeze({
    async createWorkspace(
      organizationId: string,
      name: string,
    ): Promise<IamWorkspaceCreateAccepted> {
      let response: Response;
      try {
        const command: IamWorkspaceCreateCommand = { schemaVersion: 4, name };
        response = await fetcher(
          `${baseUrl}/v1/organizations/${encodeURIComponent(organizationId)}/workspaces`,
          {
            method: 'POST',
            credentials: 'include',
            headers: {
              Accept: 'application/json',
              'content-type': 'application/json',
              'idempotency-key': idempotencyKey(),
            },
            body: JSON.stringify(command),
          },
        );
      } catch {
        throw new WorkspaceApiError('WORKSPACE_REQUEST_FAILED');
      }
      const payload: unknown = await response.json().catch(() => undefined);
      if (!response.ok) {
        const body = payload as { readonly code?: unknown } | undefined;
        throw new WorkspaceApiError(
          typeof body?.code === 'string' ? body.code : 'WORKSPACE_REQUEST_FAILED',
          response.status,
        );
      }
      const parsed = parseV4Contract<IamWorkspaceCreateAccepted>(WORKSPACE_CREATE_SCHEMA, payload);
      if (!parsed.accepted) throw new WorkspaceApiError('WORKSPACE_RESPONSE_INVALID');
      return parsed.value;
    },
  });
}

export type WorkspaceApi = ReturnType<typeof createWorkspaceApi>;

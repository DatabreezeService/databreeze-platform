import type { MemberSettingsMember } from '@databreeze/contracts/v3';
import {
  AGENT_LEVEL_ORDER_V1,
  isAgentGrantLevelV1,
  isMembershipAccessPresetV1,
  type AgentGrantLevelV1,
  type MembershipAccessPresetV1,
} from '@databreeze/domain/permissions/v1';
import {
  hasOnlyKeysBrowser,
  isRecordBrowser,
  parseStableIdentifierBrowser,
} from '../../lib/browser-validation.ts';
import { useEffect, useMemo, useState } from 'react';

export interface WorkspaceMemberProjection {
  readonly memberId: string;
  readonly displayName: string;
  readonly accessPreset: MembershipAccessPresetV1;
  readonly agentGrantLevel: AgentGrantLevelV1;
  readonly agentGrantRevision: number;
  readonly membershipRevision: number;
}

export interface WorkspaceSettingsProjection {
  readonly workspaceId: string;
  readonly canManage: boolean;
  readonly members: readonly WorkspaceMemberProjection[];
}

export type WorkspaceSettingsStatus = 'loading' | 'error' | 'ready';

export interface WorkspaceSettingsState {
  readonly status: WorkspaceSettingsStatus;
  readonly projection?: WorkspaceSettingsProjection;
  readonly error?: string;
}

export interface WorkspaceSettingsStore {
  getState(): WorkspaceSettingsState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  retry(): Promise<void>;
}

export interface WorkspaceSettingsStoreOptions {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
}

function configuredBaseUrl(): string {
  const configured: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
  return typeof configured === 'string' && configured.trim() !== ''
    ? configured.replace(/\/$/u, '')
    : '';
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}

function parseMember(value: unknown): WorkspaceMemberProjection {
  if (
    !isRecordBrowser(value) ||
    !hasOnlyKeysBrowser(value, [
      'memberId',
      'displayName',
      'accessPreset',
      'agentGrantLevel',
      'agentGrantRevision',
      'membershipRevision',
    ]) ||
    typeof value['displayName'] !== 'string'
  ) {
    throw new Error('WORKSPACE_SETTINGS_RESPONSE_INVALID');
  }
  const member = value as unknown as MemberSettingsMember;
  if (
    !parseStableIdentifierBrowser(member.memberId).accepted ||
    member.displayName.trim() !== member.displayName ||
    member.displayName.length > 160 ||
    hasControlCharacters(member.displayName) ||
    !isMembershipAccessPresetV1(member.accessPreset) ||
    !isAgentGrantLevelV1(member.agentGrantLevel) ||
    (member.accessPreset === 'VIEWER' &&
      AGENT_LEVEL_ORDER_V1[member.agentGrantLevel] > AGENT_LEVEL_ORDER_V1.ANALYZE) ||
    !Number.isSafeInteger(member.agentGrantRevision) ||
    member.agentGrantRevision < 0 ||
    !Number.isSafeInteger(member.membershipRevision) ||
    member.membershipRevision < 1
  ) {
    throw new Error('WORKSPACE_SETTINGS_RESPONSE_INVALID');
  }
  return Object.freeze({
    memberId: member.memberId,
    displayName: member.displayName,
    accessPreset: member.accessPreset,
    agentGrantLevel: member.agentGrantLevel,
    agentGrantRevision: member.agentGrantRevision,
    membershipRevision: member.membershipRevision,
  });
}

export function parseWorkspaceSettings(payload: unknown): WorkspaceSettingsProjection {
  if (
    !isRecordBrowser(payload) ||
    !hasOnlyKeysBrowser(payload, ['schemaVersion', 'workspaceId', 'canManage', 'members']) ||
    payload['schemaVersion'] !== 3 ||
    !parseStableIdentifierBrowser(payload['workspaceId']).accepted ||
    typeof payload['canManage'] !== 'boolean' ||
    !Array.isArray(payload['members']) ||
    payload['members'].length > 10_000
  ) {
    throw new Error('WORKSPACE_SETTINGS_RESPONSE_INVALID');
  }
  const members = (payload['members'] as MemberSettingsMember[]).map(parseMember);
  return Object.freeze({
    workspaceId: payload['workspaceId'] as string,
    canManage: payload['canManage'],
    members: Object.freeze(members),
  });
}

function requestInit(signal?: AbortSignal): RequestInit {
  return {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
    ...(signal === undefined ? {} : { signal }),
  };
}

export async function fetchWorkspaceSettings(
  options: WorkspaceSettingsStoreOptions = {},
): Promise<WorkspaceSettingsProjection> {
  const baseUrl = (options.baseUrl ?? configuredBaseUrl()).replace(/\/$/u, '');
  if (baseUrl === '') throw new Error('WORKSPACE_SETTINGS_API_UNAVAILABLE');
  const response = await (options.fetcher ?? globalThis.fetch.bind(globalThis))(
    `${baseUrl}/v3/workspaces/settings`,
    requestInit(),
  );
  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? 'WORKSPACE_SETTINGS_FORBIDDEN'
        : 'WORKSPACE_SETTINGS_REQUEST_FAILED',
    );
  }
  return parseWorkspaceSettings(await response.json());
}

export async function setAgentGrant(input: {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
  readonly memberId: string;
  readonly level: AgentGrantLevelV1;
  readonly expectedRevision: number;
}): Promise<void> {
  const baseUrl = (input.baseUrl ?? configuredBaseUrl()).replace(/\/$/u, '');
  if (
    baseUrl === '' ||
    !parseStableIdentifierBrowser(input.memberId).accepted ||
    !isAgentGrantLevelV1(input.level) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 1
  )
    throw new Error('AGENT_GRANT_COMMAND_INVALID');
  const response = await (input.fetcher ?? globalThis.fetch.bind(globalThis))(
    `${baseUrl}/v1/workspaces/agent-grants/${encodeURIComponent(input.memberId)}`,
    {
      method: 'POST',
      headers: { Accept: 'application/json', 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ level: input.level, expectedRevision: input.expectedRevision }),
    },
  );
  if (!response.ok) {
    throw new Error(
      response.status === 409 ? 'AGENT_GRANT_REVISION_CONFLICT' : 'AGENT_GRANT_UPDATE_FAILED',
    );
  }
  const payload: unknown = await response.json();
  if (
    typeof payload !== 'object' ||
    payload === null ||
    (payload as Record<string, unknown>)['accepted'] !== true
  )
    throw new Error('AGENT_GRANT_RESPONSE_INVALID');
}

export function createWorkspaceSettingsStore(
  options: WorkspaceSettingsStoreOptions = {},
): WorkspaceSettingsStore {
  const listeners = new Set<() => void>();
  let state: WorkspaceSettingsState = Object.freeze({ status: 'loading' });
  let loading = false;
  function update(next: WorkspaceSettingsState) {
    state = Object.freeze(next);
    for (const listener of listeners) listener();
  }
  async function load() {
    if (loading) return;
    loading = true;
    update({ status: 'loading' });
    try {
      update({ status: 'ready', projection: await fetchWorkspaceSettings(options) });
    } catch (error) {
      update({
        status: 'error',
        error: error instanceof Error ? error.message : 'WORKSPACE_SETTINGS_REQUEST_FAILED',
      });
    } finally {
      loading = false;
    }
  }
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
    retry: load,
  };
}

export function useWorkspaceSettingsState(enabled = true): WorkspaceSettingsState {
  return useWorkspaceSettingsResource(enabled).state;
}

export function useWorkspaceSettingsResource(enabled = true): {
  readonly state: WorkspaceSettingsState;
  readonly retry: () => Promise<void>;
} {
  const store = useMemo(() => createWorkspaceSettingsStore(), []);
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = store.subscribe(() => rerender((value) => value + 1));
    void store.load();
    return unsubscribe;
  }, [enabled, store]);
  return { state: store.getState(), retry: () => store.retry() };
}

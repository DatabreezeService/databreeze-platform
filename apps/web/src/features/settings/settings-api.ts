import {
  parseV4Contract,
  type DdaNotificationPreferencesAccepted,
  type DdaNotificationPreferencesCommand,
  type IamProfileUpdateAccepted,
  type IamProfileUpdateCommand,
} from '@databreeze/contracts/v4';
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
import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';
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

export interface WorkspaceInvitationResult {
  readonly membershipId: string;
  readonly invitationId: string;
  readonly expiresAt: string;
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

function sessionFetcher(options: WorkspaceSettingsStoreOptions): typeof fetch {
  const baseUrl = (options.baseUrl ?? configuredBaseUrl()).replace(/\/$/u, '');
  return createSessionAwareFetchV1({
    apiBaseUrl: baseUrl,
    fetcher: options.fetcher ?? globalThis.fetch.bind(globalThis),
  });
}

function configuredBaseUrl(): string {
  const configured: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
  return typeof configured === 'string' && configured.trim() !== ''
    ? configured.replace(/\/$/u, '')
    : '';
}

const PROFILE_ACCEPTED_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/iam-profile-update-accepted' as const;
const NOTIFICATION_PREFERENCES_COMMAND_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/dda-notification-preferences-command' as const;
const NOTIFICATION_PREFERENCES_ACCEPTED_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/dda-notification-preferences-accepted' as const;

export type NotificationPreferencesSnapshot = DdaNotificationPreferencesAccepted;

/** IAM-016/IAM-018: update only the authenticated user's display name and locale. */
export async function updateAccountProfile(input: {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
  readonly displayName: string;
  readonly locale: 'vi-VN' | 'en';
  readonly expectedRevision: number;
}): Promise<IamProfileUpdateAccepted['user']> {
  const displayName = input.displayName.normalize('NFC').trim();
  if (
    displayName.length < 1 ||
    displayName.length > 200 ||
    /\p{Cc}/u.test(displayName) ||
    (input.locale !== 'vi-VN' && input.locale !== 'en') ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 1
  ) {
    throw new Error('PROFILE_COMMAND_INVALID');
  }
  const command: IamProfileUpdateCommand = {
    schemaVersion: 4,
    displayName,
    locale: input.locale,
    expectedRevision: input.expectedRevision,
  };
  const idempotencyKey =
    globalThis.crypto?.randomUUID?.() ??
    `profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const baseUrl = (input.baseUrl ?? configuredBaseUrl()).replace(/\/$/u, '');
  const response = await sessionFetcher(input)(`${baseUrl}/v1/me/profile`, {
    method: 'PATCH',
    headers: {
      Accept: 'application/json',
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    credentials: 'include',
    body: JSON.stringify(command),
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    if (response.status === 409) throw new Error('PROFILE_REVISION_CONFLICT');
    if (response.status === 403) throw new Error('PROFILE_FORBIDDEN');
    if (response.status === 503) throw new Error('PROFILE_UNAVAILABLE');
    throw new Error('PROFILE_UPDATE_FAILED');
  }
  const parsed = parseV4Contract<IamProfileUpdateAccepted>(PROFILE_ACCEPTED_SCHEMA, payload);
  if (!parsed.accepted) throw new Error('PROFILE_RESPONSE_INVALID');
  return parsed.value.user;
}

export async function fetchNotificationPreferences(
  options: WorkspaceSettingsStoreOptions = {},
): Promise<NotificationPreferencesSnapshot> {
  const baseUrl = (options.baseUrl ?? configuredBaseUrl()).replace(/\/$/u, '');
  const response = await sessionFetcher(options)(`${baseUrl}/v4/notification-preferences`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) {
    if (response.status === 403) throw new Error('NOTIFICATION_PREFERENCES_FORBIDDEN');
    if (response.status === 503) throw new Error('NOTIFICATION_PREFERENCES_UNAVAILABLE');
    throw new Error('NOTIFICATION_PREFERENCES_REQUEST_FAILED');
  }
  const parsed = parseV4Contract<NotificationPreferencesSnapshot>(
    NOTIFICATION_PREFERENCES_ACCEPTED_SCHEMA,
    await response.json(),
  );
  if (!parsed.accepted) throw new Error('NOTIFICATION_PREFERENCES_RESPONSE_INVALID');
  return parsed.value;
}

export async function updateNotificationPreferences(input: {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
  readonly snapshot: NotificationPreferencesSnapshot;
}): Promise<NotificationPreferencesSnapshot> {
  const preferences = input.snapshot.preferences.map((item) => {
    const { mandatory, ...preference } = item;
    void mandatory;
    return preference;
  });
  const command: DdaNotificationPreferencesCommand = {
    schemaVersion: 4,
    expectedRevision: input.snapshot.revision,
    preferences,
  };
  const parsedCommand = parseV4Contract<DdaNotificationPreferencesCommand>(
    NOTIFICATION_PREFERENCES_COMMAND_SCHEMA,
    command,
  );
  if (!parsedCommand.accepted) throw new Error('NOTIFICATION_PREFERENCES_COMMAND_INVALID');
  const baseUrl = (input.baseUrl ?? configuredBaseUrl()).replace(/\/$/u, '');
  const idempotencyKey =
    globalThis.crypto?.randomUUID?.() ??
    `notification-preferences-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const response = await sessionFetcher(input)(`${baseUrl}/v4/notification-preferences`, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    credentials: 'include',
    body: JSON.stringify(command),
  });
  if (!response.ok) {
    if (response.status === 409) throw new Error('NOTIFICATION_PREFERENCES_REVISION_CONFLICT');
    if (response.status === 403) throw new Error('NOTIFICATION_PREFERENCES_FORBIDDEN');
    if (response.status === 503) throw new Error('NOTIFICATION_PREFERENCES_UNAVAILABLE');
    throw new Error('NOTIFICATION_PREFERENCES_UPDATE_FAILED');
  }
  const parsed = parseV4Contract<NotificationPreferencesSnapshot>(
    NOTIFICATION_PREFERENCES_ACCEPTED_SCHEMA,
    await response.json(),
  );
  if (!parsed.accepted) throw new Error('NOTIFICATION_PREFERENCES_RESPONSE_INVALID');
  return parsed.value;
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
  const response = await sessionFetcher(options)(
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
    !parseStableIdentifierBrowser(input.memberId).accepted ||
    !isAgentGrantLevelV1(input.level) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 1
  )
    throw new Error('AGENT_GRANT_COMMAND_INVALID');
  const response = await sessionFetcher(input)(
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

function invitationBaseUrl(input: { readonly baseUrl?: string }): string {
  return (input.baseUrl ?? configuredBaseUrl()).replace(/\/$/u, '');
}

function responseAccepted(
  payload: unknown,
): payload is { readonly accepted: true; readonly value: Record<string, unknown> } {
  return (
    isRecordBrowser(payload) && payload['accepted'] === true && isRecordBrowser(payload['value'])
  );
}

/** IAM-010/IAM-025: atomically create and deliver an invitation for an existing principal. */
export async function inviteWorkspaceMember(input: {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
  readonly recipientEmail: string;
  readonly accessPreset: MembershipAccessPresetV1;
}): Promise<WorkspaceInvitationResult> {
  const baseUrl = invitationBaseUrl(input);
  const email = input.recipientEmail.normalize('NFC').trim();
  if (
    !isMembershipAccessPresetV1(input.accessPreset) ||
    email.length > 254 ||
    !/^[^\s@]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/u.test(email)
  ) {
    throw new Error('WORKSPACE_INVITATION_INVALID');
  }
  const invitationResponse = await sessionFetcher(input)(`${baseUrl}/v1/invitations`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      recipientEmail: email,
      accessPreset: input.accessPreset,
    }),
  });
  const invitationPayload: unknown = await invitationResponse.json().catch(() => undefined);
  if (!invitationResponse.ok || !isRecordBrowser(invitationPayload)) {
    const code =
      isRecordBrowser(invitationPayload) && typeof invitationPayload['code'] === 'string'
        ? invitationPayload['code']
        : 'WORKSPACE_INVITATION_FAILED';
    throw new Error(code);
  }
  const invitationMembershipId = invitationPayload['membershipId'];
  const invitationId = invitationPayload['invitationId'];
  const expiresAt = invitationPayload['expiresAt'];
  if (
    !parseStableIdentifierBrowser(invitationMembershipId).accepted ||
    !parseStableIdentifierBrowser(invitationId).accepted ||
    typeof expiresAt !== 'string'
  )
    throw new Error('WORKSPACE_INVITATION_RESPONSE_INVALID');
  return Object.freeze({
    membershipId: invitationMembershipId as string,
    invitationId: invitationId as string,
    expiresAt,
  });
}

/** IAM-025: change the customer-visible Owner/Editor/Viewer preset with a server revision. */
export async function setAccessPreset(input: {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
  readonly memberId: string;
  readonly accessPreset: MembershipAccessPresetV1;
  readonly expectedRevision: number;
}): Promise<void> {
  const baseUrl = invitationBaseUrl(input);
  if (
    !parseStableIdentifierBrowser(input.memberId).accepted ||
    !isMembershipAccessPresetV1(input.accessPreset) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 1
  )
    throw new Error('MEMBERSHIP_PRESET_COMMAND_INVALID');
  const response = await sessionFetcher(input)(
    `${baseUrl}/v1/memberships/${encodeURIComponent(input.memberId)}/access-preset`,
    {
      method: 'POST',
      headers: { Accept: 'application/json', 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        accessPreset: input.accessPreset,
        expectedRevision: input.expectedRevision,
      }),
    },
  );
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok)
    throw new Error(
      response.status === 409
        ? 'MEMBERSHIP_PRESET_REVISION_CONFLICT'
        : 'MEMBERSHIP_PRESET_UPDATE_FAILED',
    );
  if (!responseAccepted(payload)) throw new Error('MEMBERSHIP_PRESET_RESPONSE_INVALID');
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

import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';
import { useEffect, useState, type FormEvent } from 'react';
import type { NotificationPreferencesSnapshot } from './settings-api.ts';

const CATEGORIES = [
  'REVIEWS',
  'DATA',
  'DASHBOARDS',
  'USAGE',
  'SECURITY',
  'BILLING',
  'SYSTEM',
] as const;
const CHANNELS = ['IN_APP', 'EMAIL', 'PUSH', 'DESKTOP'] as const;
const CATEGORY_GROUPS = [
  { id: 'work', categories: ['REVIEWS', 'DATA', 'DASHBOARDS'] as const },
  { id: 'workspace', categories: ['USAGE', 'SYSTEM'] as const },
  { id: 'protected', categories: ['SECURITY', 'BILLING'] as const },
] as const;

function mandatoryCategory(category: string): boolean {
  return category === 'SECURITY' || category === 'BILLING';
}

function defaultSnapshot(): NotificationPreferencesSnapshot {
  return {
    schemaVersion: 4,
    revision: 1,
    preferences: CATEGORIES.flatMap((category) =>
      CHANNELS.map((channel) => ({
        category,
        channel,
        enabled: mandatoryCategory(category) || channel === 'IN_APP',
        minimumUrgency: mandatoryCategory(category) ? ('CRITICAL' as const) : ('NORMAL' as const),
        deliveryMode:
          channel === 'EMAIL' && !mandatoryCategory(category)
            ? ('DIGEST' as const)
            : ('IMMEDIATE' as const),
        quietHours: { enabled: false, start: '22:00', end: '07:00' },
        timezone: 'Asia/Ho_Chi_Minh',
        mandatory: mandatoryCategory(category),
      })),
    ),
  };
}

function categoryLabel(locale: SupportedLocaleV1, category: string): string {
  const labels: Record<string, { readonly vi: string; readonly en: string }> = {
    REVIEWS: { vi: 'Xem xét & phê duyệt', en: 'Reviews & approvals' },
    DATA: { vi: 'Dữ liệu & đồng bộ', en: 'Data & sync' },
    DASHBOARDS: { vi: 'Bảng điều khiển', en: 'Dashboards' },
    USAGE: { vi: 'Trợ lý & tín dụng', en: 'Agent & usage' },
    SECURITY: { vi: 'Bảo mật tài khoản', en: 'Account security' },
    BILLING: { vi: 'Thanh toán & gói dịch vụ', en: 'Billing & plans' },
    SYSTEM: { vi: 'Hệ thống', en: 'System' },
  };
  const label = labels[category];
  return label === undefined ? category : locale === 'vi-VN' ? label.vi : label.en;
}

function channelLabel(locale: SupportedLocaleV1, channel: string): string {
  const labels: Record<string, { readonly vi: string; readonly en: string }> = {
    IN_APP: { vi: 'Trong ứng dụng', en: 'In-app' },
    EMAIL: { vi: 'Email', en: 'Email' },
    PUSH: { vi: 'Thông báo đẩy', en: 'Push' },
    DESKTOP: { vi: 'Máy tính', en: 'Desktop' },
  };
  const label = labels[channel];
  return label === undefined ? channel : locale === 'vi-VN' ? label.vi : label.en;
}

function groupLabel(locale: SupportedLocaleV1, group: (typeof CATEGORY_GROUPS)[number]['id']) {
  const labels = {
    work: { vi: 'Công việc và dữ liệu', en: 'Work and data' },
    workspace: { vi: 'Không gian làm việc', en: 'Workspace activity' },
    protected: { vi: 'Thông báo được bảo vệ', en: 'Protected notices' },
  } as const;
  return locale === 'vi-VN' ? labels[group].vi : labels[group].en;
}

function groupDescription(
  locale: SupportedLocaleV1,
  group: (typeof CATEGORY_GROUPS)[number]['id'],
) {
  const descriptions = {
    work: {
      vi: 'Chọn kênh và mức độ cho công việc thường ngày.',
      en: 'Choose channels and urgency for everyday work.',
    },
    workspace: {
      vi: 'Cập nhật về hoạt động và dịch vụ của không gian làm việc.',
      en: 'Updates about workspace activity and services.',
    },
    protected: {
      vi: 'Các thông báo quan trọng luôn tuân theo chính sách máy chủ.',
      en: 'Critical notices always follow server policy.',
    },
  } as const;
  return locale === 'vi-VN' ? descriptions[group].vi : descriptions[group].en;
}

export interface NotificationPreferencesSectionProperties {
  readonly locale: SupportedLocaleV1;
  readonly compact?: boolean;
  readonly snapshot?: NotificationPreferencesSnapshot;
  readonly state?: 'loading' | 'ready' | 'error' | 'unavailable';
  readonly error?: string;
  readonly onSave?: (snapshot: NotificationPreferencesSnapshot) => Promise<void>;
}

export function NotificationPreferencesSection({
  locale,
  compact = false,
  snapshot,
  state = 'unavailable',
  error,
  onSave,
}: NotificationPreferencesSectionProperties) {
  const [draft, setDraft] = useState<NotificationPreferencesSnapshot>(
    snapshot ?? defaultSnapshot(),
  );
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string>();
  useEffect(() => {
    if (snapshot !== undefined) setDraft(snapshot);
  }, [snapshot]);

  const update = (
    predicate: (preference: NotificationPreferencesSnapshot['preferences'][number]) => boolean,
    transform: (
      preference: NotificationPreferencesSnapshot['preferences'][number],
    ) => NotificationPreferencesSnapshot['preferences'][number],
  ) => {
    setDraft((current) => ({
      ...current,
      preferences: current.preferences.map((preference) =>
        predicate(preference) ? transform(preference) : preference,
      ),
    }));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onSave === undefined) return;
    setSaveState('saving');
    setSaveError(undefined);
    try {
      await onSave(draft);
      setSaveState('success');
    } catch (caught) {
      setSaveState('error');
      setSaveError(
        caught instanceof Error ? caught.message : 'NOTIFICATION_PREFERENCES_UPDATE_FAILED',
      );
    }
  }

  return (
    <section
      className={`workspace-settings-page__section workspace-settings-page__section--notifications${compact ? ' workspace-notification-preferences--compact' : ''}`}
      data-settings-compact-group={compact ? 'notifications' : undefined}
    >
      <div className="workspace-settings-page__section-heading">
        <div>
          <p>{locale === 'vi-VN' ? 'Thông báo' : 'Notifications'}</p>
          <h2>
            {locale === 'vi-VN'
              ? 'Chọn cách bạn muốn được nhắc'
              : 'Choose how you want to be notified'}
          </h2>
        </div>
        <span>
          {locale === 'vi-VN'
            ? 'Áp dụng riêng cho workspace hiện tại'
            : 'Applies to this workspace'}
        </span>
      </div>
      {state === 'loading' || state === 'error' || state === 'unavailable' ? (
        <div
          className={`workspace-notification-preferences__state workspace-notification-preferences__state--${state}`}
          data-notification-preferences-state={state}
          role={state === 'error' ? 'alert' : 'status'}
        >
          <span aria-hidden="true" className="workspace-notification-preferences__state-icon">
            {state === 'loading' ? '◌' : state === 'error' ? '!' : 'i'}
          </span>
          <div>
            <strong>
              {state === 'loading'
                ? locale === 'vi-VN'
                  ? 'Đang tải tùy chọn thông báo'
                  : 'Loading notification preferences'
                : state === 'error'
                  ? locale === 'vi-VN'
                    ? 'Không thể tải tùy chọn thông báo'
                    : 'Notification preferences could not load'
                  : locale === 'vi-VN'
                    ? 'Tùy chọn thông báo chưa khả dụng'
                    : 'Notification preferences unavailable'}
            </strong>
            <p>
              {error === 'NOTIFICATION_PREFERENCES_FORBIDDEN'
                ? locale === 'vi-VN'
                  ? 'Phiên hiện tại không có quyền đọc tùy chọn thông báo.'
                  : 'This session cannot read notification preferences.'
                : state === 'loading'
                  ? locale === 'vi-VN'
                    ? 'Đang đồng bộ các tùy chọn của workspace này.'
                    : 'Syncing preferences for this workspace.'
                  : locale === 'vi-VN'
                    ? 'Tùy chọn thông báo tạm thời chưa khả dụng.'
                    : 'Notification preferences are temporarily unavailable.'}
            </p>
          </div>
        </div>
      ) : (
        <form
          className="workspace-notification-preferences"
          data-notification-preferences="ready"
          onSubmit={(event) => void submit(event)}
        >
          <div className="workspace-notification-preferences__intro" data-notification-policy>
            <span className="workspace-notification-preferences__revision">
              {locale === 'vi-VN' ? `Phiên bản ${draft.revision}` : `Revision ${draft.revision}`}
            </span>
            <p>
              {locale === 'vi-VN'
                ? 'Thông báo bảo mật và thanh toán quan trọng luôn được giữ lại theo chính sách máy chủ.'
                : 'Critical security and billing notices stay enabled under server policy.'}
            </p>
          </div>
          <div className="workspace-notification-preferences__groups">
            {CATEGORY_GROUPS.map((group) => (
              <section
                className="workspace-notification-preferences__group"
                data-notification-category-group={group.id}
                key={group.id}
              >
                <header className="workspace-notification-preferences__group-heading">
                  <h3>{groupLabel(locale, group.id)}</h3>
                  <p>{groupDescription(locale, group.id)}</p>
                </header>
                <div className="workspace-notification-preferences__categories">
                  {group.categories.map((category) => {
                    const entries = draft.preferences.filter(
                      (preference) => preference.category === category,
                    );
                    const representative = entries[0];
                    if (representative === undefined) return null;
                    return (
                      <article
                        className="workspace-notification-preferences__card"
                        data-notification-category={category}
                        key={category}
                      >
                        <div className="workspace-notification-preferences__card-heading">
                          <div>
                            <span>{categoryLabel(locale, category)}</span>
                            <strong>
                              {representative.mandatory
                                ? locale === 'vi-VN'
                                  ? 'Được bảo vệ theo chính sách'
                                  : 'Protected by policy'
                                : locale === 'vi-VN'
                                  ? 'Có thể tùy chỉnh'
                                  : 'Customizable'}
                            </strong>
                          </div>
                          <label className="workspace-notification-preferences__urgency">
                            <span>{locale === 'vi-VN' ? 'Mức tối thiểu' : 'Minimum urgency'}</span>
                            <select
                              aria-label={`${categoryLabel(locale, category)} minimum urgency`}
                              disabled={saveState === 'saving'}
                              onChange={(event) =>
                                update(
                                  (preference) => preference.category === category,
                                  (preference) => ({
                                    ...preference,
                                    minimumUrgency: event.target
                                      .value as typeof preference.minimumUrgency,
                                  }),
                                )
                              }
                              value={representative.minimumUrgency}
                            >
                              <option value="LOW">
                                {locale === 'vi-VN' ? 'Từ thấp' : 'Low and above'}
                              </option>
                              <option value="NORMAL">
                                {locale === 'vi-VN' ? 'Từ thường' : 'Normal and above'}
                              </option>
                              <option value="HIGH">
                                {locale === 'vi-VN' ? 'Từ cao' : 'High and above'}
                              </option>
                              <option value="CRITICAL">
                                {locale === 'vi-VN' ? 'Chỉ nghiêm trọng' : 'Critical only'}
                              </option>
                            </select>
                          </label>
                        </div>
                        <div className="workspace-notification-preferences__rows">
                          {entries.map((preference) => (
                            <div
                              className="workspace-notification-preferences__row"
                              data-notification-channel={preference.channel}
                              key={preference.channel}
                            >
                              <label>
                                <input
                                  aria-label={`${channelLabel(locale, preference.channel)} for ${categoryLabel(locale, category)}`}
                                  checked={preference.enabled}
                                  disabled={preference.mandatory || saveState === 'saving'}
                                  onChange={(event) =>
                                    update(
                                      (current) =>
                                        current.category === category &&
                                        current.channel === preference.channel,
                                      (current) => ({ ...current, enabled: event.target.checked }),
                                    )
                                  }
                                  type="checkbox"
                                />
                                <span>{channelLabel(locale, preference.channel)}</span>
                              </label>
                              <select
                                aria-label={`${channelLabel(locale, preference.channel)} delivery mode for ${categoryLabel(locale, category)}`}
                                disabled={
                                  !preference.enabled ||
                                  preference.mandatory ||
                                  saveState === 'saving'
                                }
                                onChange={(event) =>
                                  update(
                                    (current) =>
                                      current.category === category &&
                                      current.channel === preference.channel,
                                    (current) => ({
                                      ...current,
                                      deliveryMode: event.target
                                        .value as typeof current.deliveryMode,
                                    }),
                                  )
                                }
                                value={preference.deliveryMode}
                              >
                                <option value="IMMEDIATE">
                                  {locale === 'vi-VN' ? 'Ngay lập tức' : 'Immediately'}
                                </option>
                                <option value="DIGEST">
                                  {locale === 'vi-VN' ? 'Bản tóm tắt' : 'Digest'}
                                </option>
                              </select>
                            </div>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          {(() => {
            const first = draft.preferences[0];
            if (first === undefined) return null;
            return (
              <div className="workspace-notification-preferences__quiet-hours">
                <div>
                  <strong>{locale === 'vi-VN' ? 'Giờ yên lặng' : 'Quiet hours'}</strong>
                  <small>
                    {locale === 'vi-VN'
                      ? 'Tạm hoãn thông báo thường trong khoảng thời gian này.'
                      : 'Hold ordinary notifications during this window.'}
                  </small>
                </div>
                <label>
                  <input
                    checked={first.quietHours.enabled}
                    disabled={saveState === 'saving'}
                    onChange={(event) =>
                      update(
                        () => true,
                        (current) => ({
                          ...current,
                          quietHours: { ...current.quietHours, enabled: event.target.checked },
                        }),
                      )
                    }
                    type="checkbox"
                  />
                  <span>{locale === 'vi-VN' ? 'Bật' : 'Enable'}</span>
                </label>
                <input
                  aria-label={locale === 'vi-VN' ? 'Giờ bắt đầu yên lặng' : 'Quiet hours start'}
                  disabled={!first.quietHours.enabled || saveState === 'saving'}
                  onChange={(event) =>
                    update(
                      () => true,
                      (current) => ({
                        ...current,
                        quietHours: { ...current.quietHours, start: event.target.value },
                      }),
                    )
                  }
                  type="time"
                  value={first.quietHours.start}
                />
                <span aria-hidden="true">{locale === 'vi-VN' ? 'đến' : 'to'}</span>
                <input
                  aria-label={locale === 'vi-VN' ? 'Giờ kết thúc yên lặng' : 'Quiet hours end'}
                  disabled={!first.quietHours.enabled || saveState === 'saving'}
                  onChange={(event) =>
                    update(
                      () => true,
                      (current) => ({
                        ...current,
                        quietHours: { ...current.quietHours, end: event.target.value },
                      }),
                    )
                  }
                  type="time"
                  value={first.quietHours.end}
                />
                <select
                  aria-label={locale === 'vi-VN' ? 'Múi giờ thông báo' : 'Notification timezone'}
                  disabled={saveState === 'saving'}
                  onChange={(event) =>
                    update(
                      () => true,
                      (current) => ({ ...current, timezone: event.target.value }),
                    )
                  }
                  value={first.timezone}
                >
                  <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh</option>
                  <option value="Asia/Bangkok">Asia/Bangkok</option>
                  <option value="Asia/Singapore">Asia/Singapore</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            );
          })()}
          {saveState === 'success' ? (
            <p className="workspace-notification-preferences__success" role="status">
              {locale === 'vi-VN'
                ? 'Đã lưu tùy chọn thông báo.'
                : 'Notification preferences saved.'}
            </p>
          ) : null}
          {saveState === 'error' ? (
            <p className="workspace-notification-preferences__error" role="alert">
              {saveError === 'NOTIFICATION_PREFERENCES_REVISION_CONFLICT'
                ? locale === 'vi-VN'
                  ? 'Tùy chọn đã thay đổi ở nơi khác. Hãy tải lại rồi thử lại.'
                  : 'These preferences changed elsewhere. Reload and try again.'
                : locale === 'vi-VN'
                  ? 'Không thể lưu tùy chọn thông báo lúc này.'
                  : 'Notification preferences could not be saved right now.'}
            </p>
          ) : null}
          <button
            className="workspace-notification-preferences__save"
            disabled={onSave === undefined || saveState === 'saving'}
            type="submit"
          >
            {saveState === 'saving'
              ? locale === 'vi-VN'
                ? 'Đang lưu…'
                : 'Saving…'
              : locale === 'vi-VN'
                ? 'Lưu tùy chọn thông báo'
                : 'Save notification preferences'}
          </button>
        </form>
      )}
    </section>
  );
}

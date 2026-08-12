export type NotificationCenterItem = {
  readonly eventId: string;
  readonly kind: string;
  readonly label: string;
  readonly unresolved: boolean;
};

export type NotificationCenterProperties = {
  readonly locale: 'vi-VN' | 'en';
  readonly items: readonly NotificationCenterItem[];
};

const TITLE = {
  'vi-VN': 'Trung tâm thông báo',
  en: 'Notification center',
} as const;

export function NotificationCenter({ locale, items }: NotificationCenterProperties) {
  return (
    <section aria-label={TITLE[locale]} className="notification-center">
      <h2>{TITLE[locale]}</h2>
      <ul>
        {items.map((item) => (
          <li key={item.eventId} data-kind={item.kind} data-unresolved={String(item.unresolved)}>
            {item.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

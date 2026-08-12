export type DesktopNotificationItem = {
  readonly id: string;
  readonly label: string;
};

export type DesktopNotificationCenterProperties = {
  readonly locale: 'vi-VN' | 'en';
  readonly items: readonly DesktopNotificationItem[];
};

export function NotificationCenter({ locale, items }: DesktopNotificationCenterProperties) {
  const title = locale === 'vi-VN' ? 'Trung tâm thông báo' : 'Notification center';
  return (
    <section aria-label={title} className="desktop-notification-center">
      <h2>{title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.label}</li>
        ))}
      </ul>
    </section>
  );
}

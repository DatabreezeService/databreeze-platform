import type { DesktopLocale } from '../../../shared/desktop-contract-v1.ts';
import type { FolderReviewQueueItemV1 } from '../../../shared/folder-intake-contract-v1.ts';

const copy = {
  'vi-VN': {
    title: 'Hàng đợi xem xét thư mục',
    empty: 'Không có tệp nào đang chờ xem xét hoặc cách ly.',
    reason: 'Lý do',
    profile: 'Hồ sơ',
    hybridNote: 'Tệp gốc vẫn ở thư mục cục bộ; không đổi tên, di chuyển hoặc xóa trong V1.',
  },
  en: {
    title: 'Folder review queue',
    empty: 'No files are awaiting review or quarantine.',
    reason: 'Reason',
    profile: 'Profile',
    hybridNote:
      'Source files remain in the local folder; V1 never renames, moves, or deletes them.',
  },
} as const;

export interface FolderReviewQueueProps {
  readonly locale: DesktopLocale;
  readonly items: readonly FolderReviewQueueItemV1[];
}

export function FolderReviewQueue({ locale, items }: FolderReviewQueueProps) {
  const text = copy[locale];
  return (
    <section aria-labelledby="folder-review-title" className="folder-review-queue">
      <h2 id="folder-review-title">{text.title}</h2>
      <p>{text.hybridNote}</p>
      {items.length === 0 ? <p>{text.empty}</p> : null}
      <ul>
        {items.map((item) => (
          <li key={item.eventId}>
            <span>
              {text.reason}: {item.reason}
            </span>
            <span>
              {text.profile}: {item.profileHint}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

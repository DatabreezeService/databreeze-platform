export function LocaleFlag({
  className = 'locale-flag',
  locale,
}: {
  readonly className?: string;
  readonly locale: 'en' | 'vi-VN';
}) {
  if (locale === 'vi-VN') {
    return (
      <svg
        aria-hidden="true"
        className={className}
        height="12"
        style={{ display: 'inline-block', verticalAlign: 'middle', borderRadius: '1px' }}
        viewBox="0 0 18 12"
        width="18"
      >
        <rect fill="#da251d" height="12" width="18" />
        <polygon
          fill="#ff0"
          points="9,1.55 10.08,5.08 13.8,5.08 10.8,7.2 11.88,10.7 9,8.55 6.12,10.7 7.2,7.2 4.2,5.08 7.92,5.08"
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      height="12"
      style={{ display: 'inline-block', verticalAlign: 'middle', borderRadius: '1px' }}
      viewBox="0 0 18 12"
      width="18"
    >
      <rect fill="#b22234" height="12" width="18" />
      <rect fill="#fff" height="1" width="18" y="1" />
      <rect fill="#fff" height="1" width="18" y="3" />
      <rect fill="#fff" height="1" width="18" y="5" />
      <rect fill="#fff" height="1" width="18" y="7" />
      <rect fill="#fff" height="1" width="18" y="9" />
      <rect fill="#fff" height="1" width="18" y="11" />
      <rect fill="#3c3b6e" height="6.5" width="8" />
    </svg>
  );
}

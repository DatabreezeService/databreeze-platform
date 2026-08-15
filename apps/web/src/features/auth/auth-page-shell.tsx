import wordmarkUrl from '@databreeze/design-tokens/brand/generated/web/navigation-wordmark-blue-204x50.png';
import markUrl from '@databreeze/design-tokens/brand/generated/web/install-icon-512.png';
import type { ReactNode } from 'react';

export function AuthPageShell({
  locale,
  title,
  description,
  eyebrow,
  children,
  footer,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly title: string;
  readonly description: string;
  readonly eyebrow?: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  const isVi = locale === 'vi-VN';

  return (
    <div className="auth-page">
      <div className="auth-page__story">
        <div className="auth-page__story-bg-glow" aria-hidden="true" />
        <div className="auth-page__story-inner">
          <header className="auth-page__story-top">
            <a href={`/${locale}`} className="auth-brand" aria-label="DataBreeze">
              <img
                src="/landing/assets/databreeze-mark.png"
                alt=""
                className="auth-brand__mark"
              />
              <span className="auth-brand__name">DataBreeze</span>
            </a>
          </header>

          <div className="auth-page__story-body">
            <p className="auth-story__eyebrow">
              <span className="auth-story__dot" aria-hidden="true" />
              {isVi ? 'Không gian dữ liệu hợp nhất' : 'Unified Data Workspace'}
            </p>
            <h2 className="auth-story__title">
              {isVi ? (
                <>
                  Dữ liệu <span className="auth-story__gradient">biết cất lời.</span>
                </>
              ) : (
                <>
                  Data that speaks with{' '}
                  <span className="auth-story__gradient">evidence.</span>
                </>
              )}
            </h2>
            <p className="auth-story__desc">
              {isVi
                ? 'Biến dữ liệu rời rạc thành dashboard sống, được kiểm tra, có bằng chứng và luôn cập nhật.'
                : 'Turn fragmented data into live, governed dashboards with verifiable lineage and real-time freshness.'}
            </p>
          </div>

          <footer className="auth-page__story-bottom">
            <div className="auth-story__pillars">
              <span>{isVi ? 'Nguồn gốc minh bạch' : 'Verifiable Lineage'}</span>
              <span className="auth-story__pillar-dot" aria-hidden="true">·</span>
              <span>{isVi ? 'AI có kiểm chứng' : 'Auditable AI'}</span>
              <span className="auth-story__pillar-dot" aria-hidden="true">·</span>
              <span>{isVi ? 'Bảo mật đa tầng' : 'Enterprise Isolation'}</span>
            </div>
          </footer>
        </div>
      </div>

      <section className="auth-page__panel" aria-labelledby="auth-card-title">
        <nav className="auth-page__panel-nav" aria-label="Language and navigation">
          <a href={`/${locale}`} className="auth-page__back-link">
            <span aria-hidden="true">←</span>
            <span>{isVi ? 'Trang chủ' : 'Home'}</span>
          </a>
          <a
            href={isVi ? '/en/sign-in' : '/vi-VN/sign-in'}
            className="auth-page__locale-toggle"
            aria-label={isVi ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
          >
            <span className="auth-page__locale-flag">{isVi ? '🇻🇳' : '🇬🇧'}</span>
            <span>{isVi ? 'Tiếng Việt' : 'English'}</span>
          </a>
        </nav>

        <div className="auth-card">
          <div className="auth-card__heading">
            {eyebrow ? (
              <div className="auth-card__eyebrow-wrap">
                <p className="auth-card__eyebrow">{eyebrow}</p>
              </div>
            ) : null}
            <h1 id="auth-card-title">{title}</h1>
            <p className="auth-card__description">{description}</p>
          </div>

          {children}

          {footer ? <div className="auth-card__footer">{footer}</div> : null}
        </div>
      </section>
    </div>
  );
}

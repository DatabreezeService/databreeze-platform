import wordmarkUrl from '@databreeze/design-tokens/brand/generated/web/navigation-wordmark-blue-204x50.png';
import markUrl from '@databreeze/design-tokens/brand/generated/web/install-icon-512.png';
import type { ReactNode } from 'react';

export function AuthPageShell({
  locale,
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  const isVi = locale === 'vi-VN';
  const otherLocale = isVi ? 'en' : 'vi-VN';
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : `/${locale}/sign-in`;
  const alternateHref = currentPath.replace(`/${locale}`, `/${otherLocale}`);

  return (
    <main className="auth-page">
      <section className="auth-page__story" aria-label={isVi ? 'DataBreeze' : 'DataBreeze'}>
        <div className="auth-page__story-bg-glow" aria-hidden="true" />
        <div className="auth-page__story-inner">
          <header className="auth-page__brand-header">
            <a
              href={`/${locale}`}
              className="auth-page__brand-link"
              aria-label={isVi ? 'Về trang chủ DataBreeze' : 'Back to DataBreeze home'}
            >
              <div className="auth-page__brand-badge">
                <img className="auth-page__mark" src={markUrl} alt="" width={36} height={36} />
              </div>
              <img className="auth-page__wordmark" src={wordmarkUrl} alt="DataBreeze" width={168} height={42} />
            </a>
          </header>

          <div className="auth-page__story-copy">
            <div className="auth-page__story-kicker">
              <span className="auth-page__story-kicker-dot" aria-hidden="true" />
              <span>{isVi ? 'Không gian dữ liệu được quản trị' : 'Governed Data Workspace'}</span>
            </div>
            <h2>
              {isVi ? (
                <>
                  Từ dữ liệu đến <span className="auth-page__hero-highlight">quyết định</span> rõ ràng hơn.
                </>
              ) : (
                <>
                  From data to <span className="auth-page__hero-highlight">decisions</span>, with clarity.
                </>
              )}
            </h2>
            <p>
              {isVi
                ? 'Kết nối nguồn dữ liệu, kiểm tra bằng chứng, tự động hóa quy trình ETL và cộng tác an toàn trong một không gian chuẩn mực.'
                : 'Bring sources, evidence, analysis, and collaboration together in one unified, high-trust workspace.'}
            </p>

            <div className="auth-page__pipeline-card" aria-hidden="true">
              <div className="auth-page__pipeline-header">
                <div className="auth-page__pipeline-status">
                  <span className="auth-page__pipeline-indicator" />
                  <span>{isVi ? 'Dữ liệu được kiểm toán trực tiếp' : 'Live Governed Pipeline'}</span>
                </div>
                <span className="auth-page__pipeline-tag">v2.4 active</span>
              </div>
              <div className="auth-page__pipeline-flow">
                <div className="auth-page__pipeline-step">
                  <div className="auth-page__step-icon">📄</div>
                  <div className="auth-page__step-details">
                    <strong>sales_report_2026.xlsx</strong>
                    <span>{isVi ? '14,820 dòng • Hợp lệ' : '14,820 rows • Validated'}</span>
                  </div>
                </div>
                <div className="auth-page__pipeline-arrow">→</div>
                <div className="auth-page__pipeline-step">
                  <div className="auth-page__step-icon">⚡</div>
                  <div className="auth-page__step-details">
                    <strong>ETL & Quality Guard</strong>
                    <span>{isVi ? '100% Khớp nguồn' : '100% Verified trace'}</span>
                  </div>
                </div>
                <div className="auth-page__pipeline-arrow">→</div>
                <div className="auth-page__pipeline-step auth-page__pipeline-step--highlight">
                  <div className="auth-page__step-icon">📊</div>
                  <div className="auth-page__step-details">
                    <strong>Executive Canvas</strong>
                    <span>{isVi ? 'Cập nhật tức thì' : 'Live Snapshot'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="auth-page__story-footer">
            <div
              className="auth-page__story-metrics"
              aria-label={isVi ? 'Nguyên tắc sản phẩm' : 'Product principles'}
            >
              <span className="auth-page__metric-chip">
                <span className="auth-page__metric-dot" />
                {isVi ? 'Dữ liệu có nguồn gốc' : 'Traceable data'}
              </span>
              <span className="auth-page__metric-chip">
                <span className="auth-page__metric-dot" />
                {isVi ? 'Quyền được kiểm tra' : 'Permission-aware'}
              </span>
              <span className="auth-page__metric-chip">
                <span className="auth-page__metric-dot" />
                {isVi ? 'Kết quả có bằng chứng' : 'Evidence-backed results'}
              </span>
            </div>
            <p className="auth-page__story-note">
              {isVi
                ? 'Bản quyền © 2026 DataBreeze. Bảo mật và quản trị dữ liệu chuẩn doanh nghiệp.'
                : '© 2026 DataBreeze. Enterprise-grade security and governance.'}
            </p>
          </div>
        </div>
      </section>

      <section className="auth-page__panel">
        <div className="auth-page__panel-nav">
          <a
            href={`/${locale}`}
            className="auth-page__back-link"
            aria-label={isVi ? 'Về trang chủ' : 'Back to home'}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M10 13L5 8L10 3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{isVi ? 'Trang chủ' : 'Home'}</span>
          </a>
          <a
            href={alternateHref}
            className="auth-page__locale-toggle"
            title={isVi ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
          >
            <span className="auth-page__locale-flag">{isVi ? '🇻🇳' : '🇬🇧'}</span>
            <span className="auth-page__locale-text">{isVi ? 'Tiếng Việt' : 'English'}</span>
          </a>
        </div>

        <div className="auth-card">
          <div className="auth-card__heading">
            <div className="auth-card__eyebrow-wrap">
              <p className="auth-card__eyebrow">{eyebrow}</p>
            </div>
            <h1>{title}</h1>
            <p className="auth-card__description">{description}</p>
          </div>
          {children}
          {footer ? <div className="auth-card__footer">{footer}</div> : null}
        </div>
      </section>
    </main>
  );
}

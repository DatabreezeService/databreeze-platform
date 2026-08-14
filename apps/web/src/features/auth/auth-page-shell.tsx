import wordmarkUrl from '@databreeze/design-tokens/brand/generated/web/navigation-wordmark-blue-204x50.png';
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
  return (
    <main className="auth-page">
      <section className="auth-page__story" aria-label={locale === 'vi-VN' ? 'DataBreeze' : 'DataBreeze'}>
        <div className="auth-page__story-inner">
          <img className="auth-page__wordmark" src={wordmarkUrl} alt="DataBreeze" width={204} height={50} />
          <div className="auth-page__story-copy">
            <p className="auth-page__story-kicker">
              {locale === 'vi-VN' ? 'Không gian dữ liệu được quản trị' : 'Governed workspace for better decisions'}
            </p>
            <h2>{locale === 'vi-VN' ? 'Từ dữ liệu đến quyết định rõ ràng hơn.' : 'From data to decisions, with clarity.'}</h2>
            <p>
              {locale === 'vi-VN'
                ? 'Kết nối nguồn dữ liệu, kiểm tra bằng chứng và cộng tác trong một không gian an toàn.'
                : 'Bring sources, evidence, analysis, and collaboration together in one trusted workspace.'}
            </p>
          </div>
          <div className="auth-page__story-metrics" aria-label={locale === 'vi-VN' ? 'Nguyên tắc sản phẩm' : 'Product principles'}>
            <span>{locale === 'vi-VN' ? 'Dữ liệu có nguồn gốc' : 'Traceable data'}</span>
            <span>{locale === 'vi-VN' ? 'Quyền được kiểm tra' : 'Permission-aware'}</span>
            <span>{locale === 'vi-VN' ? 'Kết quả có bằng chứng' : 'Evidence-backed results'}</span>
          </div>
        </div>
      </section>
      <section className="auth-page__panel">
        <div className="auth-card">
          <div className="auth-card__heading">
            <p className="auth-card__eyebrow">{eyebrow}</p>
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

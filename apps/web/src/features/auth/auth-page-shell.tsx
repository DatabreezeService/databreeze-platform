import type { ReactNode } from 'react';
import { AuthLocaleMenu } from './auth-locale-menu.tsx';
import { AuthMatrixField } from './auth-matrix-field.tsx';

const STORY_PROOFS = {
  'vi-VN': [
    {
      title: 'Nguồn gốc minh bạch',
      body: 'Mỗi số liệu gắn với nguồn đã kiểm tra.',
    },
    {
      title: 'AI có kiểm chứng',
      body: 'Câu trả lời đi kèm bằng chứng, không đoán mò.',
    },
    {
      title: 'Cách ly theo tenant',
      body: 'Dữ liệu của bạn không lẫn với không gian khác.',
    },
  ],
  en: [
    {
      title: 'Verifiable lineage',
      body: 'Every figure traces back to a checked source.',
    },
    {
      title: 'Auditable AI',
      body: 'Answers arrive with evidence, not guesses.',
    },
    {
      title: 'Tenant isolation',
      body: 'Your workspace stays sealed from every other one.',
    },
  ],
} as const;

export function AuthPageShell({
  locale,
  title,
  description,
  children,
  footer,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  const isVi = locale === 'vi-VN';
  const proofs = STORY_PROOFS[locale];

  return (
    <div className="auth-page">
      <aside className="auth-page__story">
        <AuthMatrixField />
        <header className="auth-page__story-top">
          <a href={`/${locale}`} className="auth-brand" aria-label="DataBreeze">
            <img src="/landing/assets/databreeze-mark.png" alt="" className="auth-brand__mark" />
            <span className="auth-brand__name">DataBreeze</span>
          </a>
        </header>

        <div className="auth-page__story-body">
          <h2 className="auth-story__title">
            {isVi ? 'Dữ liệu biết cất lời.' : 'Data that speaks with evidence.'}
          </h2>
          <p className="auth-story__desc">
            {isVi
              ? 'Biến dữ liệu rời rạc thành dashboard sống, được kiểm tra, có bằng chứng và luôn cập nhật.'
              : 'Turn fragmented data into live, governed dashboards with verifiable lineage and real-time freshness.'}
          </p>
          <ul className="auth-story__proofs">
            {proofs.map((proof) => (
              <li key={proof.title}>
                <strong>{proof.title}</strong>
                <span>{proof.body}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section className="auth-page__panel" aria-labelledby="auth-card-title">
        <div className="auth-page__panel-inner">
          <nav className="auth-page__panel-nav" aria-label="Language and navigation">
            <a href={`/${locale}`} className="auth-page__back-link">
              <span aria-hidden="true">←</span>
              <span>{isVi ? 'Trang chủ' : 'Home'}</span>
            </a>
            <AuthLocaleMenu locale={locale} />
          </nav>

          <div className="auth-page__panel-main">
            <div className="auth-card">
              <div className="auth-card__heading">
                <h1 id="auth-card-title">{title}</h1>
                <p className="auth-card__description">{description}</p>
              </div>

              {children}

              {footer ? <div className="auth-card__footer">{footer}</div> : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

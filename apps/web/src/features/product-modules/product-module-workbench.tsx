import { Status } from '@databreeze/ui/v1';
import { useLocale } from '../../app/locale-context.tsx';
import { appMessage } from '../../app/messages.ts';
import { getProductModuleCopy, type ProductModuleRegistration } from './product-module-registry.ts';

export function ProductModuleWorkbench({ module }: { readonly module: ProductModuleRegistration }) {
  const locale = useLocale();
  const copy = getProductModuleCopy(module, locale);
  const readinessDescriptionId = `${module.slug}-readiness-description`;

  return (
    <article aria-labelledby={`${module.slug}-heading`} className="product-workbench">
      <header className="product-workbench__header">
        <div className="product-workbench__identity">
          <p className="product-workbench__stage">
            {appMessage(locale, `module.stage.${module.stage}`)}
          </p>
          <h1 id={`${module.slug}-heading`}>{copy.name}</h1>
          <p>{copy.description}</p>
        </div>
        <div
          aria-describedby={readinessDescriptionId}
          className="product-workbench__action-state"
          role="status"
        >
          <span aria-hidden="true" className="product-workbench__action-dot" />
          <span>
            <strong>{copy.action}</strong>
            <small>{appMessage(locale, 'module.readiness.status')}</small>
          </span>
        </div>
      </header>

      <section aria-labelledby={`${module.slug}-readiness-heading`} className="module-readiness">
        <div className="module-readiness__message">
          <h2 className="sr-only" id={`${module.slug}-readiness-heading`}>
            {appMessage(locale, 'module.readiness.heading')}
          </h2>
          <Status kind="warning">{appMessage(locale, 'module.readiness.status')}</Status>
          <p id={readinessDescriptionId}>{appMessage(locale, 'module.readiness.body')}</p>
        </div>
        <dl className="module-readiness__facts">
          <div>
            <dt>{appMessage(locale, 'module.fact.surface')}</dt>
            <dd>Web</dd>
          </div>
          <div>
            <dt>{appMessage(locale, 'module.fact.requirements')}</dt>
            <dd>{module.requirementRange}</dd>
          </div>
          <div>
            <dt>{appMessage(locale, 'module.fact.data')}</dt>
            <dd>{appMessage(locale, 'module.fact.data.empty')}</dd>
          </div>
        </dl>
      </section>

      <div className="product-workbench__body">
        <section aria-labelledby={`${module.slug}-capabilities-heading`}>
          <div className="section-heading">
            <div>
              <h2 id={`${module.slug}-capabilities-heading`}>
                {appMessage(locale, 'module.capabilities.heading')}
              </h2>
              <p>{appMessage(locale, 'module.capabilities.caption')}</p>
            </div>
            <span aria-hidden="true" className="module-code">
              {module.code}
            </span>
          </div>
          <ol className="module-capabilities">
            {copy.capabilities.map((capability, index) => (
              <li key={capability}>
                <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <p>{capability}</p>
              </li>
            ))}
          </ol>
        </section>

        <aside aria-labelledby={`${module.slug}-guardrails-heading`} className="module-guardrails">
          <h2 id={`${module.slug}-guardrails-heading`}>
            {appMessage(locale, 'module.guardrails.heading')}
          </h2>
          <p>{appMessage(locale, 'module.guardrails.caption')}</p>
          <ul>
            <li>{appMessage(locale, 'module.guardrail.authorization')}</li>
            <li>{appMessage(locale, 'module.guardrail.scope')}</li>
            <li>{appMessage(locale, 'module.guardrail.evidence')}</li>
          </ul>
        </aside>
      </div>
    </article>
  );
}

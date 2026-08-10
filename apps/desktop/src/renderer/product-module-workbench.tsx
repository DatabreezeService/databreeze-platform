import { useState, type KeyboardEvent } from 'react';
import type {
  DesktopLocale,
  DesktopSafeState,
  SidecarSafeStatus,
} from '../shared/desktop-contract-v1.ts';
import { DESKTOP_PRODUCT_MODULES, desktopProductModuleCopy } from './product-module-registry.ts';

export interface DesktopWorkbenchCopy {
  readonly capabilitiesCaption: string;
  readonly capabilitiesHeading: string;
  readonly dataMode: string;
  readonly engine: string;
  readonly engineNotInstalled: string;
  readonly evidence: string;
  readonly governanceCaption: string;
  readonly governanceHeading: string;
  readonly navigationLabel: string;
  readonly workspaceLabel: string;
  readonly noData: string;
  readonly notConnected: string;
  readonly requirements: string;
  readonly tenantScope: string;
}

export function ProductModuleWorkbench({
  copy,
  locale,
  safeState,
  sidecarStatus,
}: {
  readonly copy: DesktopWorkbenchCopy;
  readonly locale: DesktopLocale;
  readonly safeState: DesktopSafeState;
  readonly sidecarStatus: SidecarSafeStatus;
}) {
  const [selectedSlug, setSelectedSlug] = useState('folder-autopilot');
  const selectedIndex = DESKTOP_PRODUCT_MODULES.findIndex((module) => module.slug === selectedSlug);
  const selectedModule = DESKTOP_PRODUCT_MODULES[selectedIndex];
  if (selectedModule === undefined) throw new Error('DESKTOP_MODULE_REGISTRY_INVALID');
  const selectedCopy = desktopProductModuleCopy(selectedModule, locale);

  function selectModule(index: number): void {
    const module = DESKTOP_PRODUCT_MODULES[index];
    if (module === undefined) return;
    setSelectedSlug(module.slug);
    globalThis.document.querySelector<HTMLElement>(`#desktop-module-tab-${module.slug}`)?.focus();
  }

  function handleModuleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    let nextIndex: number | undefined;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      nextIndex = (index + 1) % DESKTOP_PRODUCT_MODULES.length;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + DESKTOP_PRODUCT_MODULES.length) % DESKTOP_PRODUCT_MODULES.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = DESKTOP_PRODUCT_MODULES.length - 1;
    }
    if (nextIndex === undefined) return;
    event.preventDefault();
    selectModule(nextIndex);
  }

  const readiness =
    sidecarStatus.lifecycle === 'not-installed' ? copy.engineNotInstalled : copy.notConnected;

  return (
    <section className="module-workspace" aria-label={copy.workspaceLabel}>
      <nav className="module-navigation" aria-label={copy.navigationLabel}>
        <div aria-orientation="vertical" className="module-tablist" role="tablist">
          {DESKTOP_PRODUCT_MODULES.map((module, index) => {
            const moduleCopy = desktopProductModuleCopy(module, locale);
            const selected = module.slug === selectedSlug;
            return (
              <button
                aria-controls={`desktop-module-panel-${module.slug}`}
                aria-selected={selected}
                className="module-tab"
                id={`desktop-module-tab-${module.slug}`}
                key={module.slug}
                onClick={() => setSelectedSlug(module.slug)}
                onKeyDown={(event) => handleModuleKeyDown(event, index)}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
              >
                <span aria-hidden="true" className="module-tab__code">
                  {module.code}
                </span>
                <span>{moduleCopy.name}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <article
        aria-labelledby={`desktop-module-heading-${selectedModule.slug}`}
        className="module-panel"
        id={`desktop-module-panel-${selectedModule.slug}`}
        role="tabpanel"
        tabIndex={0}
      >
        <header className="module-panel__header">
          <div>
            <p className="module-panel__code">{selectedModule.code}</p>
            <h2 id={`desktop-module-heading-${selectedModule.slug}`}>{selectedCopy.name}</h2>
            <p className="module-panel__description">{selectedCopy.description}</p>
          </div>
          <button aria-describedby="desktop-module-readiness-detail" disabled type="button">
            {selectedCopy.action}
          </button>
        </header>

        <section className="module-readiness" aria-labelledby="desktop-module-readiness-heading">
          <h3 className="visually-hidden" id="desktop-module-readiness-heading">
            {readiness}
          </h3>
          <p className="readiness-status" role="status">
            <span aria-hidden="true">!</span>
            {readiness}
          </p>
          <p id="desktop-module-readiness-detail">{copy.noData}</p>
          <dl>
            <div>
              <dt>{copy.dataMode}</dt>
              <dd>{safeState.dataMode}</dd>
            </div>
            <div>
              <dt>{copy.engine}</dt>
              <dd>{sidecarStatus.lifecycle}</dd>
            </div>
            <div>
              <dt>{copy.requirements}</dt>
              <dd>{selectedModule.requirementRange}</dd>
            </div>
          </dl>
        </section>

        <div className="module-panel__body">
          <section aria-labelledby="desktop-capabilities-heading">
            <h3 id="desktop-capabilities-heading">{copy.capabilitiesHeading}</h3>
            <p>{copy.capabilitiesCaption}</p>
            <ol className="module-capabilities">
              {selectedCopy.capabilities.map((capability, index) => (
                <li key={capability}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  <p>{capability}</p>
                </li>
              ))}
            </ol>
          </section>
          <aside className="governance-note" aria-labelledby="desktop-governance-heading">
            <h3 id="desktop-governance-heading">{copy.governanceHeading}</h3>
            <p>{copy.governanceCaption}</p>
            <ul>
              <li>{copy.tenantScope}</li>
              <li>{copy.evidence}</li>
            </ul>
          </aside>
        </div>
      </article>
    </section>
  );
}

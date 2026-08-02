import { Component, type ReactNode } from 'react';
import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';
import { appMessage } from './messages.ts';

interface ErrorBoundaryProperties {
  readonly children: ReactNode;
  readonly locale: SupportedLocaleV1;
}

interface ErrorBoundaryState {
  readonly failed: boolean;
}

export class AppErrorBoundary extends Component<ErrorBoundaryProperties, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = { failed: false };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  public override componentDidCatch(): void {
    // A later allowlisted telemetry adapter may receive a scrubbed problem code, never raw content.
  }

  public override render(): ReactNode {
    if (this.state.failed) {
      return (
        <main className="standalone-state" id="main-content">
          <div className="standalone-state__content">
            <h1>{appMessage(this.props.locale, 'app.error.title')}</h1>
            <p>{appMessage(this.props.locale, 'app.error.body')}</p>
            <a className="text-action" href={`/${this.props.locale}/workspace`}>
              {appMessage(this.props.locale, 'action.backWorkspace')}
            </a>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

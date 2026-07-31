# Brand and Product Experience

**Status:** Product specification<br>
**Version:** 1.0

## 1. Brand Continuity

The product keeps the DataBreeze name and existing approved logo. The legacy frontend’s blue and black wordmarks and dark standalone mark are migrated as source assets after integrity and licensing review; they are not redrawn merely because the codebase is new.

An asset manifest records intended background, minimum size, clear space, aspect ratio, and checksum. Derived SVG/PNG/application-icon sizes are generated reproducibly from approved sources.

If a wordmark already contains the readable DataBreeze name, adjacent duplicate “DataBreeze” text is not shown. The standalone mark may be paired with accessible product text when context requires it.

## 2. Personality

DataBreeze is:

- calm
- operational
- trustworthy
- evidence-led
- Vietnamese-first
- helpful without being childish
- precise without feeling bureaucratic

It is not styled as a futuristic AI toy, a noisy enterprise console, or a decorative marketing page.

## 3. Visual Direction

The visual metaphor is a clear morning workspace: neutral work surfaces, crisp cobalt brand emphasis, and semantic color reserved for meaning.

Base token direction:

```css
--color-bg: oklch(1.000 0.000 0);
--color-surface: oklch(0.976 0.004 255);
--color-surface-strong: oklch(0.948 0.007 255);
--color-ink: oklch(0.205 0.018 255);
--color-muted: oklch(0.470 0.020 255);
--color-border: oklch(0.900 0.010 255);
--color-primary: oklch(0.600 0.210 262);
--color-primary-hover: oklch(0.540 0.220 262);
--color-primary-soft: oklch(0.955 0.038 262);
--color-success: oklch(0.560 0.120 145);
--color-warning: oklch(0.720 0.135 75);
--color-danger: oklch(0.560 0.145 25);
--color-info: oklch(0.570 0.115 245);
```

The primary cobalt identifies the main action and selected state. Status colors never become competing brand actions and never communicate without text or iconography.

Typography uses `"Be Vietnam Pro", "Noto Sans", "Segoe UI", ui-sans-serif, system-ui, sans-serif`. Numeric business data uses tabular figures.

## 4. Shared Experience Model

Across platforms, users encounter the same concepts and status vocabulary:

- Inbox
- Artifacts and versions
- Jobs and progress
- Findings and exceptions
- Review and approval
- Reports and publication
- Devices and data location

The platforms do not need identical layouts. They must preserve identity, terminology, permissions, state, and evidence.

## 5. Web Experience

Web uses a stable application shell with:

- workspace and project context
- Inbox and global work search
- module navigation based on entitlement and permission
- jobs, reviews, and approvals
- reports
- administration and account controls

Tables, split views, evidence panels, filters, and guided steps are preferred over repeated equal card grids. Advanced configuration uses progressive disclosure and testable previews.

## 6. Desktop Experience

Desktop prioritizes:

- local Inbox and folder activity
- device/data-location status
- processing queue and resource use
- evidence inspection
- recipe preview and history
- offline/synchronization state

The interface distinguishes local completion from cloud synchronization. Folder grants and proposed mutations show exact scope and effect before authorization.

## 7. Android Experience

Android prioritizes fast capture and short decisions:

- camera, barcode, voice, share, and assigned forms
- offline queue and sync state
- exception correction
- alerts, comments, and approvals
- concise reports

Complex schema, scoring, report-template, and bulk mapping editors remain on Web or Desktop. Touch targets, scalable text, camera permissions, one-handed operation, and interrupted field work are first-class.

## 8. Language and Content

- Vietnamese is complete and reviewed before release; English is complete as the secondary language.
- Primary labels use user language such as “Kiểm tra dữ liệu” before exposing processor terminology.
- Errors say what happened, what remains safe, and the next action.
- AI-assisted content is labeled by its role rather than using generic sparkle branding.
- Confidence and completeness use plain-language states with numeric detail available when useful.
- Dates, time zones, currencies, units, decimal formats, names, and addresses are explicit.

## 9. Accessibility

Web targets WCAG 2.2 AA. Desktop and Android follow equivalent platform semantics.

Required behavior:

- full keyboard navigation on Web/Desktop
- visible focus and logical focus order
- screen-reader names, roles, values, and live progress
- no color-only meaning
- text zoom and Android font scaling
- reduced motion
- minimum touch targets
- accessible chart summaries and data tables
- captions/transcripts or alternatives for recorded content
- validation summaries linked to fields

## 10. Status and Feedback

Every long-running action shows:

- accepted/queued state
- current stage
- whether work is local or cloud
- whether the source is safe
- cancel or pause behavior
- actionable failure and retry state
- completion, review, or approval requirement

Optimistic UI is used only when rollback is unambiguous. Consequential approvals, file mutations, publications, and deletions wait for durable confirmation.

## 11. Design-System Maintenance

- Platform-neutral tokens are canonical and generate Web/Desktop CSS and Android resources.
- React UI components are shared between Web and Desktop.
- Android uses native Compose components implementing the same semantics and tokens.
- Components document states, accessibility, localization, loading, empty, error, offline, and permission-denied behavior.
- Product modules compose existing patterns before creating new interaction conventions.
- Visual regression protects stable high-value surfaces without replacing semantic tests.

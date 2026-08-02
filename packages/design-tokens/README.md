# Design Tokens

Platform-neutral DataBreeze color, typography, spacing, motion, and icon tokens with generated outputs for React and Android.

The canonical v1 semantic contract is `tokens/source/v1.json`. Run `pnpm tokens:generate` after an approved token change; `pnpm tokens:check` compares the committed TypeScript, CSS, Android XML, and manifest outputs without rewriting them. Consumers use only the versioned exports `@databreeze/design-tokens/v1`, `@databreeze/design-tokens/css/v1`, and `@databreeze/design-tokens/android/v1`.

The token contract provides WCAG-tested foreground/background pairs, 44px/dp minimum controls, persistent focus geometry, reduced-motion durations, non-color status icons, and logo-usage policies. Logo tokens govern usage only: the approved source files and generated derivatives remain checksum-protected and are never redrawn or recolored.

## Canonical brand assets

`brand/source/` contains the three immutable legacy assets. Never edit those files. Their approved dimensions and SHA-256 values live in `brand/manifest.json` and are checked before any derivative is created.

The declarative `brand/derivative-plan.json` records every Web, Windows Desktop, and Android output, including its source, purpose, dimensions, content box, and safe-zone policy. The generator permits only approved source cropping, aspect-preserving resizing, transparent padding, an approved source-color background, Android alpha-mask extraction, and PNG/ICO container conversion. It does not redraw, recolor, or distort a presented logo.

Run `pnpm brand:generate` after an approved plan or pipeline change. Run `pnpm brand:check` to regenerate into a temporary clean directory and byte-compare the result with `brand/generated/` and `brand/derivatives.json`. `pnpm build` performs the same drift check.

Wordmark derivatives already contain the DataBreeze name and must not be placed beside duplicate visible “DataBreeze” text. Standalone-mark derivatives may be paired with product text only when the surrounding interface or accessible name requires it.

Android notification PNGs are platform-ready white alpha masks derived from the approved mark’s alpha geometry. Their white RGB bytes are non-presentational mask data; Android controls the runtime tint. The pipeline verifies that mask alpha matches the approved mark geometry exactly.

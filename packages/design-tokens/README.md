# Design Tokens

Platform-neutral DataBreeze color, typography, spacing, motion, and icon tokens with generated outputs for React and Android.

## Canonical brand assets

`brand/source/` contains the three immutable legacy assets. Never edit those files. Their approved dimensions and SHA-256 values live in `brand/manifest.json` and are checked before any derivative is created.

The declarative `brand/derivative-plan.json` records every Web, Windows Desktop, and Android output, including its source, purpose, dimensions, content box, and safe-zone policy. The generator permits only source cropping, aspect-preserving resizing, transparent padding, and PNG/ICO container conversion. It does not redraw, recolor, or distort the logo.

Run `pnpm brand:generate` after an approved plan or pipeline change. Run `pnpm brand:check` to regenerate into a temporary clean directory and byte-compare the result with `brand/generated/` and `brand/derivatives.json`. `pnpm build` performs the same drift check.

Wordmark derivatives already contain the DataBreeze name and must not be placed beside duplicate visible “DataBreeze” text. Standalone-mark derivatives may be paired with product text only when the surrounding interface or accessible name requires it.

Android notification PNGs are full-color, transparent reference sources. The native Android shell owns the later platform-specific monochrome/tint resource so this foundation pipeline never recolors the approved source.

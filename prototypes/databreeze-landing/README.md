# DataBreeze Landing Page Prototype

An isolated, dependency-free landing page concept for DataBreeze.

## Isolation boundary

- The prototype is outside every package listed in `pnpm-workspace.yaml`.
- It does not import repository packages, application code, generated contracts, or service code.
- It does not call APIs, persist data, or modify product routes.
- All visuals, interactions, and demo values are local presentation-only fixtures.
- The feedback form validates input in the browser but does not transmit or persist submissions.

## Brand asset

The transparent DataBreeze mark is stored at `assets/databreeze-mark.png` and is used by the
favicon, site header, product mockup, closing section, feedback section, and footer.

The interface palette follows the DataBreeze brand system: near-black navy foundations,
electric cobalt actions, violet accents, periwinkle data highlights, and cool white surfaces.

Typography uses locally hosted Geist Variable for interface copy and Geist Mono Variable for
technical labels and tabular data. Vietnamese, Latin Extended, and Latin subsets live under
`assets/fonts/`; the SIL Open Font License is included alongside them.

## Preview

Open `index.html` directly in a browser. No install or build is required.

For an HTTP preview from the repository root:

```bash
python3 -m http.server 4178 --directory prototypes/databreeze-landing
```

Then open `http://localhost:4178`.

## Checks

```bash
node --check prototypes/databreeze-landing/script.js
```

The page supports desktop and mobile layouts and respects `prefers-reduced-motion`.
Move the pointer across each section to inspect the shared section spotlight. The feedback form
supports native required-field validation, a live message counter, and a non-persistent prototype
submission state.

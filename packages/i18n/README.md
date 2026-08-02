# Internationalization

`@databreeze/i18n/v1` is the canonical TypeScript foundation for DataBreeze product language. It provides a bounded bilingual vocabulary, strict text interpolation, locale negotiation, and validated `Intl` formatting helpers. Vietnamese (`vi-VN`) is the exact default and English (`en`) is complete for every published v1 key.

This package provides partial foundation coverage for IAM-016, WEB-013, WEB-021, WEB-022, DSK-021, AND-017, and NCO-017. It does not claim that future screens or notification templates are already translated.

## Public contract

- `MESSAGE_CATALOGS_V1` and `MESSAGE_KEYS_V1` contain stable, versioned keys with identical placeholder schemas in both locales.
- `negotiateLocaleV1` gives a supported user preference priority over `Accept-Language` and safely falls back to `vi-VN`.
- `formatMessageV1` requires every declared `{name}` parameter, rejects undeclared parameters, bounds and NFC-normalizes safe Unicode text, and applies stricter syntax to identifier-like values such as correlation IDs. It performs literal text substitution without parsing HTML. Callers must render the returned string through their platform's text API, never an HTML injection API.
- `formatRetryAfterSecondsV1` chooses an explicit singular or plural catalog variant through `Intl.PluralRules` and rejects negative, fractional, or unsafe integer values.
- Date/time formatting always requires an explicit IANA time zone. Decimal, currency, percent, list, relative-time, and plural helpers reject unsupported locales and malformed values instead of silently changing business values.

## Boundaries

The package has no runtime dependencies and must not depend on UI frameworks, Web/Desktop shells, Android resources, persistence, IAM services, notification delivery, feature modules, remote translation systems, or provider adapters. Android will consume generated terminology and fixtures in its own implementation task; it does not import this TypeScript package.

## Expanding the catalogs

1. Add a stable key to both `vi-VN` and `en` in the same change. Prefer domain-neutral foundation language here; feature-specific copy belongs with the feature registration.
2. Use natural professional Vietnamese, then complete English copy. Do not add a partial fallback, placeholder copy, HTML, controls, or bidirectional formatting characters.
3. Declare every interpolation parameter and its `identifier`, `text`, or finite `number` type identically in both locales.
4. Add behavior-focused tests for the new message or formatter case. Run the package tests, typecheck, build self-import, and root repository checks.
5. Preserve existing v1 key semantics. Breaking key, placeholder, or meaning changes require a new versioned export rather than mutating a released contract.

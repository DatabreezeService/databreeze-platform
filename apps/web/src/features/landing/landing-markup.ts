import { renderLandingPricingSection } from './pricing-section.ts';

export const TEAMMATE_LANDING_ASSET_BASE = '/landing/';

const HEADER_CTA_PATTERN = /<a class="header-cta" href="#experience">[\s\S]*?<\/a>/u;
const DOWNLOADS_NAV_PATTERN =
  /<a class="downloads-nav-link" data-downloads-nav href="[^"]*">[\s\S]*?<\/a>/u;
const PRICING_NAV_PATTERN = /<a data-pricing-nav href="#pricing">[\s\S]*?<\/a>/u;
const PRICING_SLOT_PATTERN = /<div data-pricing-slot><\/div>/u;

export function prepareTeammateLandingMarkup(
  html: string,
  input: {
    readonly locale: 'en' | 'vi-VN';
    readonly registerHref: string;
    readonly signInHref: string;
    readonly signInLabel: string;
    readonly downloadsHref: string;
    readonly downloadsLabel: string;
    readonly assetBase?: string;
  },
): string {
  const assetBase = input.assetBase ?? TEAMMATE_LANDING_ASSET_BASE;
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/iu)?.[1] ?? html;
  const withoutScripts = body.replace(/<script\b[\s\S]*?<\/script>/giu, '');
  const withAssets = withoutScripts.replaceAll('./assets/', `${assetBase}assets/`);
  if (!HEADER_CTA_PATTERN.test(withAssets)) {
    throw new Error('Teammate landing markup is missing the header CTA.');
  }
  if (!DOWNLOADS_NAV_PATTERN.test(withAssets)) {
    throw new Error('Teammate landing markup is missing the downloads navigation link.');
  }
  if (!PRICING_NAV_PATTERN.test(withAssets) || !PRICING_SLOT_PATTERN.test(withAssets)) {
    throw new Error('Teammate landing markup is missing the pricing navigation or slot.');
  }

  const signInLink = `<a class="header-cta" href="${escapeHtml(input.signInHref)}"><span>${escapeHtml(input.signInLabel)}</span><span aria-hidden="true">↗</span></a>`;
  const downloadsLink = `<a class="downloads-nav-link" href="${escapeHtml(input.downloadsHref)}">${escapeHtml(input.downloadsLabel)}</a>`;
  return withAssets
    .replace(DOWNLOADS_NAV_PATTERN, downloadsLink)
    .replace(
      HEADER_CTA_PATTERN,
      (originalCta) => `<div class="header-actions">${signInLink}${originalCta}</div>`,
    )
    .replace(
      PRICING_NAV_PATTERN,
      `<a data-pricing-nav href="#pricing">${input.locale === 'en' ? 'Pricing' : 'Bảng giá'}</a>`,
    )
    .replace(
      PRICING_SLOT_PATTERN,
      renderLandingPricingSection({ locale: input.locale, registerHref: input.registerHref }),
    );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export const TEAMMATE_LANDING_ASSET_BASE = '/landing/';

const HEADER_CTA_PATTERN = /<a class="header-cta" href="#experience">[\s\S]*?<\/a>/u;

export function prepareTeammateLandingMarkup(
  html: string,
  input: {
    readonly signInHref: string;
    readonly signInLabel: string;
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

  const signInLink = `<a class="header-cta" href="${escapeHtml(input.signInHref)}"><span>${escapeHtml(input.signInLabel)}</span><span aria-hidden="true">↗</span></a>`;
  return withAssets.replace(
    HEADER_CTA_PATTERN,
    (originalCta) => `<div class="header-actions">${signInLink}${originalCta}</div>`,
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

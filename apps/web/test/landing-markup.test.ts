import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { prepareTeammateLandingMarkup } from '../src/features/landing/landing-markup.ts';

const teammateLandingHtml = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../prototypes/databreeze-landing/index.html',
  ),
  'utf8',
);

describe('teammate landing markup [WEB-013]', () => {
  it('keeps HuuThanh1610 hero copy and adds a locale sign-in CTA', () => {
    const markup = prepareTeammateLandingMarkup(teammateLandingHtml, {
      locale: 'vi-VN',
      billingHref: '/vi-VN/billing',
      signInHref: '/vi-VN/sign-in',
      signInLabel: 'Đăng nhập',
      downloadsHref: '/vi-VN/downloads',
      downloadsLabel: 'Ứng dụng',
    });

    expect(markup).toContain('Dữ liệu biết cất lời.');
    expect(markup).toContain('href="/vi-VN/sign-in"');
    expect(markup).toContain('href="/vi-VN/downloads"');
    expect(markup).toContain('>Ứng dụng</a>');
    expect(markup).not.toContain('data-downloads-nav');
    expect(markup).toContain('/landing/assets/databreeze-mark.png');
    expect(markup).not.toContain('<script');
  });

  it('renders the exact repository catalog prices with an in-page pricing destination [BUA-003, WEB-014]', () => {
    const markup = prepareTeammateLandingMarkup(teammateLandingHtml, {
      locale: 'vi-VN',
      billingHref: '/vi-VN/billing',
      signInHref: '/vi-VN/sign-in',
      signInLabel: 'Đăng nhập',
      downloadsHref: '/vi-VN/downloads',
      downloadsLabel: 'Ứng dụng',
    });

    expect(markup).toContain('href="#pricing">Bảng giá</a>');
    expect(markup).toContain('id="pricing"');
    expect(markup).toContain('data-monthly="149000"');
    expect(markup).toContain('data-annual="1490000"');
    expect(markup).toContain('data-monthly="399000"');
    expect(markup).toContain('data-annual="3990000"');
    expect(markup).toContain('data-monthly="999000"');
    expect(markup).toContain('data-annual="9990000"');
    expect(markup).toContain('Được chọn nhiều nhất');
  });

  it('keeps pricing bilingual and routes plan CTAs to billing [BUA-002, WEB-013]', () => {
    const markup = prepareTeammateLandingMarkup(teammateLandingHtml, {
      locale: 'en',
      billingHref: '/en/billing',
      signInHref: '/en/sign-in',
      signInLabel: 'Sign in',
      downloadsHref: '/en/downloads',
      downloadsLabel: 'Apps',
    });

    expect(markup).toContain('href="#pricing">Pricing</a>');
    expect(markup).toContain('Plans that grow with your data.');
    expect(markup).toContain('Most popular');
    expect(markup).toContain('href="/en/billing?planId=personal-monthly"');
    expect(markup).toContain('data-annual-href="/en/billing?planId=personal-annual"');
    expect(markup).not.toContain('payos');
  });
});

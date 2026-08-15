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
      signInHref: '/vi-VN/sign-in',
      signInLabel: 'Đăng nhập',
    });

    expect(markup).toContain('Dữ liệu biết cất lời.');
    expect(markup).toContain('href="/vi-VN/sign-in"');
    expect(markup).toContain('/landing/assets/databreeze-mark.png');
    expect(markup).not.toContain('<script');
  });
});

import { describe, expect, it } from 'vitest';

import { createSignInRedirect, readAuthReturnTarget } from '../src/features/auth/auth-redirect.ts';

describe('authenticated billing handoff [WEB-002, WEB-011, WEB-021]', () => {
  it('encodes the selected billing route for the protected sign-in redirect', () => {
    const redirect = createSignInRedirect({
      locale: 'vi-VN',
      returnTo: '/vi-VN/billing?planId=professional-annual',
    });

    expect(redirect).toBe(
      '/vi-VN/sign-in?returnTo=%2Fvi-VN%2Fbilling%3FplanId%3Dprofessional-annual',
    );
    expect(readAuthReturnTarget(new URL(redirect, 'https://app.databreeze.local').search)).toBe(
      '/vi-VN/billing?planId=professional-annual',
    );
  });

  it('rejects external, auth-loop, and non-localized return targets', () => {
    expect(readAuthReturnTarget('?returnTo=https%3A%2F%2Fevil.example')).toBeUndefined();
    expect(readAuthReturnTarget('?returnTo=%2Fvi-VN%2Fsign-in')).toBeUndefined();
    expect(readAuthReturnTarget('?returnTo=%2Fbilling')).toBeUndefined();
  });
});

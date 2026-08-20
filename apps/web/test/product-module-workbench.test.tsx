import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LocaleProvider } from '../src/app/locale-context.tsx';
import { ProductModuleWorkbench } from '../src/features/product-modules/product-module-workbench.tsx';
import { PRODUCT_MODULE_REGISTRY } from '../src/features/product-modules/product-module-registry.ts';

describe('product module readiness surface', () => {
  it('uses a clear readiness state instead of a dead disabled action', () => {
    const module = PRODUCT_MODULE_REGISTRY[0];
    if (module === undefined) throw new Error('The product registry must contain a module');

    render(
      <LocaleProvider locale="vi-VN">
        <ProductModuleWorkbench module={module} />
      </LocaleProvider>,
    );

    expect(screen.queryByRole('button', { name: module.copy['vi-VN'].action })).toBeNull();
    expect(
      screen
        .getAllByRole('status')
        .some((element) => element.textContent?.includes('API quản trị chưa được kết nối')),
    ).toBe(true);
    expect(screen.getByText(module.copy['vi-VN'].action)).toBeTruthy();
  });
});

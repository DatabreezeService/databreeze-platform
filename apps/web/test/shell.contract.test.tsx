import { describe, expect, it } from 'vitest';
import * as shellModule from '../src/app/app.tsx';

describe('governed web shell contract', () => {
  it('provides a renderable application boundary', () => {
    expect(shellModule).toBeDefined();
    expect(shellModule).toHaveProperty('createAppRouter');
    expect(shellModule).toHaveProperty('ApplicationBoundary');
    expect(shellModule).toHaveProperty('createWebQueryClient');
    expect(shellModule).toHaveProperty('filterNavigationItems');
  });
});

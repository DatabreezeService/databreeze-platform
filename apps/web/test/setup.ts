import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Lazy route chunks are intentionally kept out of the shell bundle. Give the
// jsdom harness the same bounded window as the inbox contract tests when the
// full suite is running in parallel.
configure({ asyncUtilTimeout: 10_000 });

afterEach(() => {
  cleanup();
});

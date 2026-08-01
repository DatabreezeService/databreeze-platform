import assert from 'node:assert/strict';

import { designTokenEntriesV1, designTokenVersion } from '@databreeze/design-tokens/v1';

assert.equal(designTokenVersion, 1);
assert.ok(designTokenEntriesV1.some((token) => token.name === 'color.primary'));

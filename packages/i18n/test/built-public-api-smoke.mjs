import assert from 'node:assert/strict';

const api = await import('../dist/v1.js');

assert.equal(api.I18N_SCHEMA_VERSION_V1, 1);
assert.equal(api.DEFAULT_LOCALE_V1, 'vi-VN');
assert.equal(api.negotiateLocaleV1('en-US'), 'en');
assert.equal(api.formatMessageV1('vi-VN', 'action.save'), 'Lưu');
assert.equal(typeof api.formatCurrencyV1, 'function');

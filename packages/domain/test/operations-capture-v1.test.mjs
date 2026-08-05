import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOperationsFormV1,
  validateOperationsSubmissionV1,
} from '@databreeze/domain/operations-capture/v1';

const scope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000501',
  workspaceId: '00000000-0000-4000-8000-000000000502',
};
const id = (suffix) => `00000000-0000-4000-8000-0000000005${suffix}`;

void test('[OC-001, OC-006, OC-014] versions a typed operations form and validates a submission', () => {
  const form = createOperationsFormV1({
    formId: id('03'),
    tenantScope: scope,
    version: 1,
    name: 'Site visit',
    fields: [
      { fieldId: id('04'), key: 'site', label: 'Site', type: 'TEXT', required: true },
      { fieldId: id('05'), key: 'count', label: 'Count', type: 'INTEGER', required: true },
    ],
  });
  assert.equal(form.accepted, true);
  if (!form.accepted) return;
  const submission = validateOperationsSubmissionV1(form.value, {
    submissionId: id('06'),
    tenantScope: scope,
    values: { site: 'Hanoi', count: 4 },
  });
  assert.equal(submission.accepted, true);
  if (submission.accepted) assert.equal(submission.value.status, 'VALID');
});

void test('[OC-007] rejects incomplete and incorrectly typed field values', () => {
  const form = createOperationsFormV1({
    formId: id('07'),
    tenantScope: scope,
    version: 1,
    name: 'Inspection',
    fields: [{ fieldId: id('08'), key: 'count', label: 'Count', type: 'INTEGER', required: true }],
  });
  assert.equal(form.accepted, true);
  if (!form.accepted) return;
  const submission = validateOperationsSubmissionV1(form.value, {
    submissionId: id('09'),
    tenantScope: scope,
    values: { count: 'four' },
  });
  assert.equal(submission.accepted, true);
  if (submission.accepted) assert.equal(submission.value.status, 'INVALID');
});

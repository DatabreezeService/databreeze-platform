import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryLandingFeedbackAdapter } from '../../../src/features/lfb/adapter/in-memory-landing-feedback.adapter.js';
import { Sha256LandingFeedbackAdmissionDigestAdapter } from '../../../src/features/lfb/adapter/sha256-landing-feedback-admission-digest.adapter.js';

const validCommand = {
  schemaVersion: 4,
  email: 'nguyen.van.an@example.vn',
  name: 'Nguyễn Văn An',
  organization: 'Công ty TNHH GiácData',
  role: 'owner',
  experience: 'trial',
  category: 'product',
  rating: 5,
  message: 'Giao diện rõ ràng, tôi đã nhập liệu và xuất báo cáo trong buổi thử đầu tiên.',
  contactPermission: true,
};

void test('[WEB-026] anonymous valid submission is accepted, persisted, and acknowledged', async () => {
  const intake = new InMemoryLandingFeedbackAdapter();
  const { app } = await createApiApplication({ landingFeedbackIntake: intake });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/landing/feedbacks',
      payload: validCommand,
    });
    assert.equal(response.statusCode, 201);
    const body = JSON.parse(response.body) as {
      readonly schemaVersion?: number;
      readonly receivedAt?: string;
      readonly referenceId?: string;
    };
    assert.equal(body.schemaVersion, 4);
    assert.ok(body.receivedAt);
    assert.match(body.referenceId ?? '', /^[0-9a-f-]{36}$/u);
    assert.equal(response.body.includes(validCommand.message), false);

    const stored = await intake.readRecent(200);
    assert.equal(stored.total, 1);
    assert.equal(stored.items[0]?.email, 'nguyen.van.an@example.vn');
    assert.equal(stored.items[0]?.rating, 5);
  } finally {
    await app.close();
  }
});

void test('[WEB-026] extra fields are rejected without partial storage', async () => {
  const intake = new InMemoryLandingFeedbackAdapter();
  const { app } = await createApiApplication({ landingFeedbackIntake: intake });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/landing/feedbacks',
      payload: { ...validCommand, sourceIp: '203.0.113.7' },
    });
    assert.equal(response.statusCode, 400);
    const stored = await intake.readRecent(200);
    assert.equal(stored.total, 0);
  } finally {
    await app.close();
  }
});

void test('[WEB-026] out-of-range rating and short messages are rejected', async () => {
  const { app } = await createApiApplication({
    landingFeedbackIntake: new InMemoryLandingFeedbackAdapter(),
  });
  try {
    const ratingResponse = await app.inject({
      method: 'POST',
      url: '/v1/landing/feedbacks',
      payload: { ...validCommand, rating: 6 },
    });
    assert.equal(ratingResponse.statusCode, 400);

    const messageResponse = await app.inject({
      method: 'POST',
      url: '/v1/landing/feedbacks',
      payload: { ...validCommand, message: 'ngắn' },
    });
    assert.equal(messageResponse.statusCode, 400);
  } finally {
    await app.close();
  }
});

void test('[WEB-026] sources beyond the admission limit receive 429 and are not stored', async () => {
  const intake = new InMemoryLandingFeedbackAdapter();
  const { app } = await createApiApplication({
    landingFeedbackIntake: intake,
    landingFeedbackIpAdmission: { allow: async () => false },
    landingFeedbackAdmissionDigest: new Sha256LandingFeedbackAdmissionDigestAdapter(),
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/landing/feedbacks',
      payload: validCommand,
    });
    assert.equal(response.statusCode, 429);
    assert.equal(
      (JSON.parse(response.body) as { readonly code?: string }).code,
      'LANDING_FEEDBACK_RATE_LIMITED',
    );
    const stored = await intake.readRecent(200);
    assert.equal(stored.total, 0);
  } finally {
    await app.close();
  }
});

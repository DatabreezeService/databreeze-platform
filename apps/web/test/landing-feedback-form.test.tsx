import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LandingRoutePage } from '../src/features/landing/landing-page.tsx';

const validReceipt = {
  schemaVersion: 4,
  receivedAt: '2026-08-17T09:30:00.000Z',
  referenceId: '8f14e45f-ceea-467f-a830-aabd8ddc5bdc',
};

function renderLanding(locale: 'vi-VN' | 'en' = 'vi-VN') {
  return render(
    <MemoryRouter initialEntries={[`/${locale}`]}>
      <Routes>
        <Route path="/:locale" element={<LandingRoutePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillFeedbackForm() {
  const user = userEvent.setup();
  const form = document.querySelector<HTMLFormElement>('[data-feedback-form]');
  if (form === null) throw new Error('feedback form missing from landing markup');

  await user.type(
    form.querySelector<HTMLInputElement>('[name="email"]')!,
    'nguyen.van.an@example.vn',
  );
  await user.type(form.querySelector<HTMLInputElement>('[name="name"]')!, 'Nguyễn Văn An');
  await user.type(
    form.querySelector<HTMLInputElement>('[name="organization"]')!,
    'Công ty TNHH GiácData',
  );
  await user.selectOptions(form.querySelector<HTMLSelectElement>('[name="role"]')!, 'owner');
  form.querySelector<HTMLInputElement>('[name="experience"][value="trial"]')!.checked = true;
  await user.selectOptions(form.querySelector<HTMLSelectElement>('[name="category"]')!, 'product');
  form.querySelector<HTMLInputElement>('[name="rating"][value="5"]')!.checked = true;
  await user.type(
    form.querySelector<HTMLTextAreaElement>('[name="message"]')!,
    'Giao diện rõ ràng, tôi đã nhập liệu và xuất báo cáo trong buổi thử đầu tiên.',
  );
  form.querySelector<HTMLInputElement>('[name="contactPermission"]')!.checked = true;
  return { user, form };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('landing feedback form submission [WEB-026]', () => {
  it('submits the closed command contract and shows server-confirmed success', async () => {
    const calls: Array<{ readonly url: string; readonly init: RequestInit | undefined }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
          init,
        });
        return new Response(JSON.stringify(validReceipt), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    renderLanding();

    const { user, form } = await fillFeedbackForm();
    await user.click(form.querySelector<HTMLButtonElement>('[data-feedback-submit]')!);

    await waitFor(() => {
      expect(screen.getByText('Cảm ơn bạn! Góp ý đã được ghi nhận trên máy chủ.')).toBeTruthy();
    });

    expect(calls.length).toBe(1);
    expect(calls[0]?.url).toBe('/v1/landing/feedbacks');
    expect(calls[0]?.init?.method).toBe('POST');
    const requestBody = calls[0]?.init?.body;
    if (typeof requestBody !== 'string') throw new Error('expected a JSON request body');
    const body = JSON.parse(requestBody) as Record<string, unknown>;
    expect(body).toMatchObject({
      schemaVersion: 4,
      email: 'nguyen.van.an@example.vn',
      name: 'Nguyễn Văn An',
      role: 'owner',
      experience: 'trial',
      category: 'product',
      rating: 5,
      contactPermission: true,
    });
    expect((form.querySelector<HTMLInputElement>('[name="email"]') ?? { value: '' }).value).toBe(
      '',
    );
  });

  it('never claims success when the server throttles the submission', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'LANDING_FEEDBACK_RATE_LIMITED' }), {
            status: 429,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    renderLanding();

    const { user, form } = await fillFeedbackForm();
    await user.click(form.querySelector<HTMLButtonElement>('[data-feedback-submit]')!);

    await waitFor(() => {
      expect(
        screen.getByText('Bạn đã gửi quá nhiều góp ý trong thời gian ngắn. Vui lòng thử lại sau.'),
      ).toBeTruthy();
    });
    expect(screen.queryByText('Cảm ơn bạn! Góp ý đã được ghi nhận trên máy chủ.')).toBeNull();
    expect(form.querySelector<HTMLInputElement>('[name="email"]')?.value).toBe(
      'nguyen.van.an@example.vn',
    );
  });

  it('renders localized retry copy in English', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'LANDING_FEEDBACK_RATE_LIMITED' }), {
            status: 429,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    renderLanding('en');

    const { user, form } = await fillFeedbackForm();
    await user.click(form.querySelector<HTMLButtonElement>('[data-feedback-submit]')!);

    await waitFor(() => {
      expect(
        screen.getByText('Too many feedback submissions were sent. Please try again later.'),
      ).toBeTruthy();
    });
  });
});

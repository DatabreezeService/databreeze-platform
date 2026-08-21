import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlatformAdminRoutePage } from '../src/features/platform-admin/platform-admin-page.tsx';

const validOverview = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      '../../packages/test-fixtures/contracts/v4/payloads/platform-admin-overview/valid.json',
    ),
    'utf8',
  ),
) as Record<string, unknown>;

const feedbackRows: ReadonlyArray<
  readonly [string, string, string, string, string, string, number, string, boolean, string]
> = [
  [
    'Lê Thanh Hải',
    'lethanhhai177@gmail.com',
    'An Nam Retail Group',
    'owner',
    'active',
    'product',
    5,
    'DataBreeze giúp chuỗi 18 cửa hàng hợp nhất dữ liệu bán hàng từ POS và Excel nhanh chóng.',
    true,
    '2026-08-14T09:30:00.000Z',
  ],
  [
    'Duy Đỗ',
    'doychannel1802@gmail.com',
    'Sài Gòn Logistics Corp',
    'operations',
    'active',
    'feature',
    5,
    'Khả năng xử lý các file lịch trình xe và chi phí nhiên liệu hàng ngày rất mượt mà.',
    true,
    '2026-08-13T14:15:00.000Z',
  ],
  [
    'Lâm Gia Kiệt',
    'lamgiakiet.2005@gmail.com',
    'Dược Phẩm Thăng Long',
    'accounting',
    'trial',
    'data-trust',
    5,
    'Chế độ Hybrid bảo mật cực kỳ ấn tượng, quy trình kiểm toán nội bộ thông qua nhanh.',
    true,
    '2026-08-12T11:45:00.000Z',
  ],
  [
    'Trần Đặng Minh Quân',
    'trandangminhquan2005@gmail.com',
    'Fintech Solutions VN',
    'analyst',
    'active',
    'performance',
    5,
    'Dataset hơn 200.000 dòng tải vào phân tích và vẽ biểu đồ rất nhanh.',
    true,
    '2026-08-11T16:20:00.000Z',
  ],
  [
    'Mai Nguyễn Duy Khánh',
    'mndkhanh@gmail.com',
    'Chuỗi F&B Cà Phê Mộc',
    'owner',
    'active',
    'design',
    5,
    'Giao diện trực quan, sang trọng và không rườm rà cho người không rành kỹ thuật.',
    true,
    '2026-08-10T08:10:00.000Z',
  ],
  [
    'Hoàng Đức',
    'duc140205@gmail.com',
    'Nông Sản Miền Tây Co.',
    'technology',
    'trial',
    'feature',
    4,
    'Kiến trúc client-server và contract JSON Schema của nền tảng rất chặt chẽ.',
    true,
    '2026-08-09T17:05:00.000Z',
  ],
  [
    'Huỳnh An Khương',
    'huynhankhuong0511@gmail.com',
    'May Mặc VinaText',
    'operations',
    'trial',
    'product',
    4,
    'Dùng thử 2 tuần cho xưởng may thấy tiết kiệm ít nhất 10 tiếng mỗi tuần.',
    true,
    '2026-08-08T10:30:00.000Z',
  ],
  [
    'Nhi Phạm',
    'xpnhi023@gmail.com',
    'Thời Trang NEM - Chi Nhánh Miền Nam',
    'analyst',
    'active',
    'feature',
    5,
    'Rất thích tính năng truy vết lineage nguồn gốc của từng chỉ số KPI.',
    true,
    '2026-08-07T13:40:00.000Z',
  ],
  [
    'Lê Trần Gia Huy',
    'huyletran188205@gmail.com',
    'Đại Tín Tax & Accounting',
    'accounting',
    'trial',
    'data-trust',
    5,
    'Khả năng đọc và đối soát file hóa đơn chứng từ kèm OCR chuẩn xác đáng kinh ngạc.',
    false,
    '2026-08-06T15:50:00.000Z',
  ],
  [
    'Nguyễn Phan Mạnh Tú',
    'Manhtuhere@gmail.com',
    'Giao Hàng Express 247',
    'operations',
    'exploring',
    'design',
    4,
    'Website landing page trình bày sản phẩm rất ấn tượng và rõ ràng.',
    true,
    '2026-08-05T09:15:00.000Z',
  ],
  [
    'Nguyễn Trần Minh Quân',
    'quanntm1206@gmail.com',
    'Bảo Hiểm Số AlphaCare',
    'technology',
    'trial',
    'performance',
    5,
    'Ứng dụng Desktop chạy Native rất nhẹ và đồng bộ mượt lên Web app.',
    true,
    '2026-08-04T11:20:00.000Z',
  ],
  [
    'Nguyễn Quốc Huy',
    'huynguyenfptu@gmail.com',
    'Vật Liệu Xây Dựng Tiến Phát',
    'other',
    'exploring',
    'other',
    4,
    'Mong muốn được tư vấn gói Team hoặc Professional cho công ty 25 nhân sự.',
    true,
    '2026-08-03T16:00:00.000Z',
  ],
];

const serverFeedbacks = {
  schemaVersion: 4,
  generatedAt: '2026-08-17T09:30:00.000Z',
  total: feedbackRows.length,
  feedbacks: feedbackRows.map(
    (
      [
        name,
        email,
        organization,
        role,
        experience,
        category,
        rating,
        message,
        contactPermission,
        createdAt,
      ],
      index,
    ) => ({
      id: `00000000-0000-4000-8000-${String(8_900 + index).padStart(12, '0')}`,
      createdAt,
      email,
      name,
      organization,
      role,
      experience,
      category,
      rating,
      message,
      contactPermission,
    }),
  ),
};

function stubPlatformAdminServer(
  feedbacks = serverFeedbacks,
  overview: Record<string, unknown> = validOverview,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/v1/platform-admin/feedbacks'))
        return new Response(JSON.stringify(feedbacks), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      return new Response(JSON.stringify(overview), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPlatformAdmin(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/:locale/platform-admin" element={<PlatformAdminRoutePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('platform admin feedbacks & reviews [WEB-025, WEB-027, IAM-026]', () => {
  it('shows the full settled revenue amount in every overview summary', async () => {
    const overview = {
      ...validOverview,
      totals: {
        ...(validOverview['totals'] as Record<string, unknown>),
        settledRevenueVnd: 3_129_000,
      },
    };
    stubPlatformAdminServer(serverFeedbacks, overview);
    renderPlatformAdmin('/vi-VN/platform-admin');

    expect(await screen.findAllByText('3.129.000 ₫')).toHaveLength(2);
  });

  it('starts the registration chart at the first month with users', async () => {
    const overview = {
      ...validOverview,
      registrationSeries: [
        { month: '2026-02', count: 0 },
        { month: '2026-03', count: 0 },
        { month: '2026-04', count: 0 },
        { month: '2026-05', count: 0 },
        { month: '2026-06', count: 8 },
        { month: '2026-07', count: 39 },
        { month: '2026-08', count: 26 },
      ],
    };
    stubPlatformAdminServer(serverFeedbacks, overview);
    renderPlatformAdmin('/vi-VN/platform-admin');

    const chart = await screen.findByRole('img', { name: 'Người dùng mới' });
    expect(chart.textContent).not.toContain('2026-03');
    expect(chart.textContent).toContain('2026-06');
    expect(chart.textContent).toContain('2026-07');
    expect(chart.textContent).toContain('2026-08');
  });

  it('starts the revenue chart at the first month with settled revenue', async () => {
    const overview = {
      ...validOverview,
      revenueSeries: [
        { month: '2026-02', revenueVnd: 0, paidOrders: 0 },
        { month: '2026-03', revenueVnd: 0, paidOrders: 0 },
        { month: '2026-04', revenueVnd: 0, paidOrders: 0 },
        { month: '2026-05', revenueVnd: 0, paidOrders: 0 },
        { month: '2026-06', revenueVnd: 0, paidOrders: 0 },
        { month: '2026-07', revenueVnd: 745_000, paidOrders: 5 },
        { month: '2026-08', revenueVnd: 2_384_000, paidOrders: 16 },
      ],
    };
    stubPlatformAdminServer(serverFeedbacks, overview);
    renderPlatformAdmin('/vi-VN/platform-admin');

    const chart = await screen.findByRole('img', { name: 'Doanh thu theo tháng' });
    expect(chart.textContent).not.toContain('2026-02');
    expect(chart.textContent).not.toContain('2026-06');
    expect(chart.textContent).toContain('2026-07');
    expect(chart.textContent).toContain('2026-08');
  });

  it('renders navigation links with the server-authoritative feedback count badge', async () => {
    stubPlatformAdminServer();
    renderPlatformAdmin('/vi-VN/platform-admin');

    const feedbacksLink = await screen.findByRole('link', { name: /Ý kiến & Đánh giá/u });
    expect(feedbacksLink.getAttribute('href')).toBe('/vi-VN/platform-admin?tab=feedbacks');
    expect(feedbacksLink.textContent).toContain('12');

    const overviewLink = screen.getByRole('link', { name: /Tổng quan vận hành/u });
    expect(overviewLink.getAttribute('href')).toBe('/vi-VN/platform-admin');
  });

  it('renders the server feedbacks view when ?tab=feedbacks is opened', async () => {
    stubPlatformAdminServer();
    renderPlatformAdmin('/vi-VN/platform-admin?tab=feedbacks');

    expect(
      await screen.findByRole('heading', { name: 'Ý kiến & Đánh giá từ Landing Page' }),
    ).toBeTruthy();

    expect(screen.getByText('Tổng số lượt góp ý')).toBeTruthy();
    expect(screen.getByText('Điểm đánh giá trung bình')).toBeTruthy();
    expect(screen.getByText('Sẵn sàng liên hệ')).toBeTruthy();

    expect(screen.getByText('Lê Thanh Hải')).toBeTruthy();
    expect(screen.getByText('An Nam Retail Group')).toBeTruthy();
    expect(screen.getByText('Duy Đỗ')).toBeTruthy();
    expect(screen.getByText('Sài Gòn Logistics Corp')).toBeTruthy();
    expect(screen.getByText('Lâm Gia Kiệt')).toBeTruthy();
    expect(screen.getByText('Nguyễn Quốc Huy')).toBeTruthy();
  });

  it('renders stable seeded labels and a short stable label for runtime feedback', async () => {
    const runtimeId = '9f96d562-70e9-4a7a-b80a-bb737092bca4';
    stubPlatformAdminServer({
      ...serverFeedbacks,
      total: serverFeedbacks.total + 1,
      feedbacks: [
        ...serverFeedbacks.feedbacks,
        {
          ...serverFeedbacks.feedbacks[0]!,
          id: runtimeId,
          email: 'runtime@example.com',
          name: 'Runtime feedback',
        },
      ],
    });
    renderPlatformAdmin('/vi-VN/platform-admin?tab=feedbacks');

    expect(await screen.findByText('#FB-01')).toBeTruthy();
    expect(screen.getByText('#FB-12')).toBeTruthy();
    expect(screen.getByText('#9F96D562')).toBeTruthy();
    expect(screen.queryByText(`#${runtimeId}`)).toBeNull();
    expect(screen.queryByText('#00000000-0000-4000-8000-000000008900')).toBeNull();
  });

  it('does not render the email address for anonymous feedback', async () => {
    stubPlatformAdminServer();
    renderPlatformAdmin('/vi-VN/platform-admin?tab=feedbacks');

    expect(await screen.findByText('Chỉ góp ý ẩn danh')).toBeTruthy();
    expect(screen.queryByText('huyletran188205@gmail.com')).toBeNull();
  });

  it('does not make an anonymous email discoverable through search', async () => {
    stubPlatformAdminServer();
    const user = userEvent.setup();
    renderPlatformAdmin('/vi-VN/platform-admin?tab=feedbacks');

    const searchInput = await screen.findByPlaceholderText(
      'Tìm theo tên, email, công ty, nội dung góp ý…',
    );
    await user.type(searchInput, 'huyletran188205@gmail.com');

    expect(screen.getByText('Không tìm thấy góp ý nào phù hợp')).toBeTruthy();
    expect(screen.queryByText('Lê Trần Gia Huy')).toBeNull();
  });

  it('filters server feedbacks dynamically using the search bar', async () => {
    stubPlatformAdminServer();
    const user = userEvent.setup();
    renderPlatformAdmin('/vi-VN/platform-admin?tab=feedbacks');

    const searchInput = await screen.findByPlaceholderText(
      'Tìm theo tên, email, công ty, nội dung góp ý…',
    );

    await user.type(searchInput, 'lethanhhai177');
    expect(screen.getByText('Lê Thanh Hải')).toBeTruthy();
    expect(screen.queryByText('Duy Đỗ')).toBeNull();

    const clearBtn = screen.getByRole('button', { name: 'Clear search' });
    await user.click(clearBtn);
    expect(screen.getByText('Duy Đỗ')).toBeTruthy();
  });

  it('filters server feedbacks by category dropdown', async () => {
    stubPlatformAdminServer();
    const user = userEvent.setup();
    renderPlatformAdmin('/vi-VN/platform-admin?tab=feedbacks');

    const categorySelect = await screen.findByLabelText('Loại góp ý:');
    await user.selectOptions(categorySelect, 'performance');

    expect(screen.getByText('Trần Đặng Minh Quân')).toBeTruthy();
    expect(screen.getByText('Nguyễn Trần Minh Quân')).toBeTruthy();
    expect(screen.queryByText('Lê Thanh Hải')).toBeNull();
  });

  it('filters server feedbacks by star rating', async () => {
    stubPlatformAdminServer();
    const user = userEvent.setup();
    renderPlatformAdmin('/vi-VN/platform-admin?tab=feedbacks');

    const ratingSelect = await screen.findByLabelText('Đánh giá sao:');
    await user.selectOptions(ratingSelect, '4');

    expect(screen.getByText('Hoàng Đức')).toBeTruthy();
    expect(screen.getByText('Huỳnh An Khương')).toBeTruthy();
    expect(screen.getByText('Nguyễn Phan Mạnh Tú')).toBeTruthy();
    expect(screen.getByText('Nguyễn Quốc Huy')).toBeTruthy();
    expect(screen.queryByText('Lê Thanh Hải')).toBeNull();
  });

  it('shows an empty state when filters match no feedback and allows resetting', async () => {
    stubPlatformAdminServer();
    const user = userEvent.setup();
    renderPlatformAdmin('/vi-VN/platform-admin?tab=feedbacks');

    const searchInput = await screen.findByPlaceholderText(
      'Tìm theo tên, email, công ty, nội dung góp ý…',
    );
    await user.type(searchInput, 'non_existent_query_xyz');

    expect(screen.getByText('Không tìm thấy góp ý nào phù hợp')).toBeTruthy();

    const resetButtons = screen.getAllByRole('button', { name: /Đặt lại bộ lọc/u });
    await user.click(resetButtons[0]!);

    expect(screen.getByText('Lê Thanh Hải')).toBeTruthy();
  });

  it('renders a forbidden state when the server denies platform access', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'PLATFORM_ADMIN_FORBIDDEN' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    renderPlatformAdmin('/vi-VN/platform-admin?tab=feedbacks');

    expect(
      await screen.findByRole('heading', { name: 'Tài khoản không có quyền nền tảng' }),
    ).toBeTruthy();
  });

  it('renders localized copy in English when on /en route', async () => {
    stubPlatformAdminServer();
    renderPlatformAdmin('/en/platform-admin?tab=feedbacks');

    expect(
      await screen.findByRole('heading', { name: 'Landing Page Feedbacks & Reviews' }),
    ).toBeTruthy();

    expect(screen.getByText('Total Feedback Submissions')).toBeTruthy();
    expect(screen.getByText('Average Star Rating')).toBeTruthy();
    expect(screen.getByText('Open to Follow-up')).toBeTruthy();

    const feedbacksLink = screen.getByRole('link', { name: /Feedbacks & Reviews/u });
    expect(feedbacksLink.getAttribute('href')).toBe('/en/platform-admin?tab=feedbacks');
  });
});

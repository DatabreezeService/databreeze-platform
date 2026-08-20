import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AnalysisPage } from '../src/features/analysis/analysis-page.tsx';

describe('[DDA-055][DDA-056] Analysis destination', () => {
  it('shows workspace-scoped history context and the supplied dataset-version event', () => {
    render(
      <AnalysisPage
        locale="vi-VN"
        activeConversationId="conversation-july"
        conversations={[
          {
            conversationId: 'conversation-july',
            title: 'Vì sao doanh thu tháng 7 giảm?',
            datasetContext: [
              {
                datasetLabel: 'Doanh thu TP.HCM',
                datasetVersionLabel: 'phiên bản 41',
              },
            ],
            messages: [
              {
                messageId: 'answer-1',
                role: 'AGENT',
                text: 'Tôi sẽ dùng dữ liệu đã được cấp quyền cho cuộc trò chuyện này.',
              },
            ],
          },
          {
            conversationId: 'conversation-cost',
            title: 'Chi phí vận hành thay đổi thế nào?',
            datasetContext: [
              {
                datasetLabel: 'Chi phí vận hành',
                datasetVersionLabel: 'phiên bản 12',
              },
            ],
            messages: [],
          },
        ]}
        contextEvents={[
          {
            eventId: 'advanced-1',
            kind: 'DATASET_VERSION_ADVANCED',
            datasetLabel: 'Doanh thu TP.HCM',
            fromVersionLabel: 'phiên bản 41',
            toVersionLabel: 'phiên bản 42',
          },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Phân tích' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Lịch sử hội thoại' })).toBeTruthy();
    expect(screen.getByText('Doanh thu TP.HCM · phiên bản 41')).toBeTruthy();
    expect(screen.getByText('Chi phí vận hành · phiên bản 12')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain(
      'Doanh thu TP.HCM: phiên bản 41 → phiên bản 42',
    );
    expect(screen.queryByRole('button', { name: 'Mở trợ lý' })).toBeNull();
  });

  it('submits a question only through the active workspace conversation', async () => {
    const user = userEvent.setup();
    const submitted: string[] = [];
    render(
      <AnalysisPage
        locale="vi-VN"
        activeConversationId="conversation-july"
        conversations={[
          {
            conversationId: 'conversation-july',
            title: 'Vì sao doanh thu tháng 7 giảm?',
            datasetContext: [
              {
                datasetLabel: 'Doanh thu TP.HCM',
                datasetVersionLabel: 'phiên bản 41',
              },
            ],
            messages: [],
          },
        ]}
        onSendMessage={(message) => submitted.push(message)}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: 'Nhập câu hỏi phân tích' }),
      'So sánh với tháng trước',
    );
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));

    expect(submitted).toEqual(['So sánh với tháng trước']);
  });

  it('starts from useful analysis prompts without sending until the user confirms', async () => {
    const user = userEvent.setup();
    const submitted: string[] = [];
    render(
      <AnalysisPage
        locale="vi-VN"
        activeConversationId="conversation-july"
        conversations={[
          {
            conversationId: 'conversation-july',
            title: 'Bức tranh kinh doanh',
            datasetContext: [
              {
                datasetLabel: 'Bán hàng toàn quốc',
                datasetVersionLabel: 'phiên bản 12',
              },
            ],
            messages: [],
          },
        ]}
        onSendMessage={(message) => submitted.push(message)}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Trợ lý DataBreeze' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Tìm điểm bất thường' }));

    const composer = screen.getByRole<HTMLTextAreaElement>('textbox', {
      name: 'Nhập câu hỏi phân tích',
    });
    expect(composer.value).toBe('Tìm điểm bất thường trong dữ liệu này');
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'Nhập câu hỏi phân tích' }),
    );
    expect(submitted).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));
    expect(submitted).toEqual(['Tìm điểm bất thường trong dữ liệu này']);
  });

  it('creates a new analysis only through the explicit history action', async () => {
    const user = userEvent.setup();
    let created = 0;
    render(
      <AnalysisPage
        locale="vi-VN"
        conversations={[]}
        onCreateConversation={() => {
          created += 1;
        }}
      />,
    );

    expect(screen.queryByText('Phân tích mới')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Tạo hội thoại mới' }));
    expect(created).toBe(1);
  });

  it('keeps session search compact and filters only after the search control opens', async () => {
    const user = userEvent.setup();
    render(
      <AnalysisPage
        locale="vi-VN"
        conversations={[
          {
            conversationId: 'conversation-revenue',
            title: 'Doanh thu theo khu vực',
            datasetContext: [],
            messages: [],
          },
          {
            conversationId: 'conversation-cost',
            title: 'Chi phí vận hành',
            datasetContext: [],
            messages: [],
          },
        ]}
        onCreateConversation={() => undefined}
      />,
    );

    expect(screen.queryByRole('searchbox', { name: 'Tìm lịch sử hội thoại' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Tìm lịch sử hội thoại' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tạo hội thoại mới' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Tìm lịch sử hội thoại' }));
    const search = screen.getByRole('searchbox', { name: 'Tìm lịch sử hội thoại' });
    expect(search).toBeTruthy();
    await user.type(search, 'chi phí');

    expect(screen.getByRole('button', { name: 'Chi phí vận hành' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Doanh thu theo khu vực' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Đóng tìm kiếm lịch sử hội thoại' }));
    expect(screen.queryByRole('searchbox', { name: 'Tìm lịch sử hội thoại' })).toBeNull();
  });

  it('orders borderless search and create actions without a header collapse control', () => {
    render(
      <AnalysisPage
        locale="en"
        activeConversationId="conversation-1"
        conversations={[
          {
            conversationId: 'conversation-1',
            title: 'Compare regional performance',
            datasetContext: [{ datasetLabel: 'Regional sales', datasetVersionLabel: 'version 6' }],
            messages: [],
          },
        ]}
        onCreateConversation={() => undefined}
      />,
    );

    const history = screen.getByRole('complementary', { name: 'Conversation history' });
    const header = history.querySelector('.analysis-conversation-history__header');
    const labels = Array.from(header?.querySelectorAll('button') ?? []).map((button) =>
      button.getAttribute('aria-label'),
    );

    expect(labels).toEqual(['Search conversation history', 'Create new conversation']);
    expect(screen.queryByRole('button', { name: 'Collapse conversation history' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Expand conversation history' })).toBeNull();
  });
});

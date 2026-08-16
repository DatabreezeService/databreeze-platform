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

    expect(
      (screen.getByRole('textbox', { name: 'Nhập câu hỏi phân tích' }) as HTMLTextAreaElement)
        .value,
    ).toBe('Tìm điểm bất thường trong dữ liệu này');
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

    await user.click(screen.getByRole('button', { name: 'Phân tích mới' }));
    expect(created).toBe(1);
  });

  it('collapses history without removing the active thread', async () => {
    const user = userEvent.setup();
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
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Collapse conversation history' }));

    expect(screen.queryByRole('list', { name: 'Conversation history items' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Compare regional performance' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Expand conversation history' })).toBeTruthy();
  });
});

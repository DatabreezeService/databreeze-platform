import { createAgentStore, type AgentConversationSummaryV1 } from './agent-store.ts';

export const SEEDED_AGENT_CONVERSATIONS: readonly AgentConversationSummaryV1[] = Object.freeze([
  Object.freeze({
    conversationId: 'conv-revenue-q2',
    title: 'Báo cáo Doanh thu Q2 & Phân tích Tăng trưởng',
    datasetLabel: 'Doanh thu Doanh nghiệp 2026',
    datasetVersionLabel: 'v2.4 (Đã kiểm chứng)',
    messages: Object.freeze([
      Object.freeze({
        messageId: 'msg-1-1',
        role: 'USER',
        text: 'Tóm tắt các chỉ số tăng trưởng doanh thu quý 2 và nguyên nhân chính?',
        createdLabel: '10:14 · Hôm nay',
      }),
      Object.freeze({
        messageId: 'msg-1-2',
        role: 'ASSISTANT',
        text: 'Doanh thu Q2/2026 đạt 18.4 tỷ VND (tăng +24.6% YoY). Động lực chính đến từ phân khúc Khách hàng Doanh nghiệp (+38%) và tỷ lệ duy trì khách hàng (Retention Rate) đạt 94.2%. Chi phí chuyển đổi giảm 12% nhờ tự động hóa intake dữ liệu.',
        createdLabel: '10:14 · Hôm nay',
      }),
      Object.freeze({
        messageId: 'msg-1-3',
        role: 'USER',
        text: 'Có biểu đồ so sánh xu hướng theo tháng không?',
        createdLabel: '10:15 · Hôm nay',
      }),
      Object.freeze({
        messageId: 'msg-1-4',
        role: 'ASSISTANT',
        text: 'Tôi đã đối chiếu dữ liệu 6 tháng đầu năm. Xu hướng tăng trưởng đều qua các tháng 4, 5, 6 với biên lợi nhuận gộp duy trì ở mức 68.5%. Bạn có thể xem trực tiếp hoặc thêm vào Dashboard.',
        createdLabel: '10:15 · Hôm nay',
      }),
    ]),
  }),
  Object.freeze({
    conversationId: 'conv-conversion-funnel',
    title: 'Phân tích Tỷ lệ Chuyển đổi & Phễu Người dùng',
    datasetLabel: 'Hành vi Người dùng Web & App',
    datasetVersionLabel: 'v1.8 (Thời gian thực)',
    messages: Object.freeze([
      Object.freeze({
        messageId: 'msg-2-1',
        role: 'USER',
        text: 'Phân tích tỷ lệ rớt đơn ở bước thanh toán trên Web?',
        createdLabel: 'Hôm qua',
      }),
      Object.freeze({
        messageId: 'msg-2-2',
        role: 'ASSISTANT',
        text: 'Tỷ lệ hoàn tất thanh toán đạt 87.3%. Điểm rơi lớn nhất nằm ở bước xác thực OTP ngân hàng (chiếm 64% các giao dịch hủy). Đề xuất bổ sung phương thức QR Pay tự động.',
        createdLabel: 'Hôm qua',
      }),
    ]),
  }),
  Object.freeze({
    conversationId: 'conv-logistics-quality',
    title: 'Đánh giá Chất lượng Dữ liệu Kho vận',
    datasetLabel: 'Kho vận & Đơn vị Vận chuyển',
    datasetVersionLabel: 'v3.1 (Hợp nhất)',
    messages: Object.freeze([
      Object.freeze({
        messageId: 'msg-3-1',
        role: 'USER',
        text: 'Kiểm tra độ trễ đồng bộ dữ liệu kho vận từ chi nhánh miền Nam?',
        createdLabel: '2 ngày trước',
      }),
      Object.freeze({
        messageId: 'msg-3-2',
        role: 'ASSISTANT',
        text: 'Tất cả 14 nguồn cấp dữ liệu đã hoàn tất sync với 0 cảnh báo schema. Độ trễ trung bình: 1.2 giây. Toàn bộ 128,400 bản ghi đều đạt chuẩn kiểm định chất lượng.',
        createdLabel: '2 ngày trước',
      }),
    ]),
  }),
]);

/**
 * WEB-024/DDA-031: one client-side agent session follows the signed-in user
 * across Dashboard, Analysis, and Data. Server history remains authoritative.
 */
export const workspaceAgentStore = createAgentStore(
  SEEDED_AGENT_CONVERSATIONS[0],
  SEEDED_AGENT_CONVERSATIONS,
);


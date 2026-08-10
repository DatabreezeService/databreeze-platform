import type { ReceiptOcrPort, ReceiptOcrRequest, ReceiptOcrResult } from './receipt-ocr.port.js';

/** Deterministic fake adapter for tests/demo. Not a production OCR claim. */
export class DeterministicFakeReceiptOcrAdapter implements ReceiptOcrPort {
  public async extract(request: ReceiptOcrRequest): Promise<ReceiptOcrResult> {
    void request;
    return Object.freeze({
      adapterVersion: 'fake-ocr-1',
      modelVersion: 'fake-model-1',
      fields: Object.freeze([
        Object.freeze({
          field: 'merchant',
          value: 'Cafe',
          confidence: 90,
          evidenceCoordinates: Object.freeze({ page: 1, x: 0.12, y: 0.08, width: 0.4, height: 0.07 }),
        }),
        Object.freeze({
          field: 'transactionDateTime',
          value: '2026-08-10T10:15:00Z',
          confidence: 86,
          evidenceCoordinates: Object.freeze({ page: 1, x: 0.12, y: 0.18, width: 0.35, height: 0.05 }),
        }),
        Object.freeze({
          field: 'currency',
          value: 'VND',
          confidence: 97,
          evidenceCoordinates: Object.freeze({ page: 1, x: 0.12, y: 0.28, width: 0.15, height: 0.04 }),
        }),
        Object.freeze({
          field: 'subtotal',
          value: '100000',
          confidence: 88,
          evidenceCoordinates: Object.freeze({ page: 1, x: 0.55, y: 0.62, width: 0.25, height: 0.04 }),
        }),
        Object.freeze({
          field: 'tax',
          value: '20000',
          confidence: 84,
          evidenceCoordinates: Object.freeze({ page: 1, x: 0.55, y: 0.68, width: 0.25, height: 0.04 }),
        }),
        Object.freeze({
          field: 'total',
          value: '120000',
          confidence: 95,
          evidenceCoordinates: Object.freeze({ page: 1, x: 0.55, y: 0.76, width: 0.25, height: 0.05 }),
        }),
      ]),
    });
  }
}

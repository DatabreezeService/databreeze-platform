import { describe, expect, it, vi } from 'vitest';
import {
  getSpreadsheetAudit,
  listSpreadsheetAudits,
  SpreadsheetAuditClientError,
} from '../src/features/spreadsheet-auditor/spreadsheet-audit-api.ts';

const artifactVersionId = '00000000-0000-4000-8000-000000000001';
const auditId = '00000000-0000-4000-8000-000000000002';
const sheetId = '00000000-0000-4000-8000-000000000003';
const findingId = '00000000-0000-4000-8000-000000000004';

const result = {
  auditId,
  artifactVersionId,
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '00000000-0000-4000-8000-000000000005',
    workspaceId: '00000000-0000-4000-8000-000000000006',
  },
  workbookSha256: 'a'.repeat(64),
  sheets: [{ sheetId, name: 'Đơn hàng', maxRow: 24, maxColumn: 8, formulaCount: 16 }],
  findings: [
    {
      findingId,
      sheetId,
      address: 'C4',
      kind: 'FORMULA_FAMILY_OUTLIER',
      severity: 'WARNING',
      formulaFingerprint: 'b'.repeat(64),
      formula: '=SUM(A1:A3)',
      sourceValue: '42',
    },
  ],
  blockedReasons: [],
  processorVersion: 'spreadsheet-auditor-0.1.0',
  createdAt: '2026-08-04T00:00:00.000Z',
  sourceValue: 'sensitive workbook content',
};

describe('spreadsheet audit API client', () => {
  it('parses the accepted envelope and discards value-bearing unknown fields', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ accepted: true, value: [result] }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const audits = await listSpreadsheetAudits(artifactVersionId);

    expect(fetchMock).toHaveBeenCalledWith(
      `/v1/spreadsheet-audits?artifactVersionId=${artifactVersionId}`,
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.findings[0]).not.toHaveProperty('formula');
    expect(audits[0]?.findings[0]).not.toHaveProperty('sourceValue');
    expect(audits[0]).not.toHaveProperty('sourceValue');
  });

  it('parses one exact result through the same value-free contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ accepted: true, value: result }))),
    );

    const audit = await getSpreadsheetAudit(auditId);

    expect(audit.auditId).toBe(auditId);
    expect(audit.findings[0]?.address).toBe('C4');
    expect(JSON.stringify(audit)).not.toContain('SUM');
    expect(JSON.stringify(audit)).not.toContain('sensitive workbook content');
  });

  it('rejects malformed or rejected envelopes without exposing the response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ accepted: false, code: 'TENANT_DETAIL' }), { status: 200 }),
        ),
    );

    await expect(listSpreadsheetAudits(artifactVersionId)).rejects.toEqual(
      expect.objectContaining<Partial<SpreadsheetAuditClientError>>({
        code: 'SPREADSHEET_AUDIT_RESPONSE_INVALID',
      }),
    );

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ accepted: true, value: [null] }), { status: 200 }),
        ),
    );
    await expect(listSpreadsheetAudits(artifactVersionId)).rejects.toEqual(
      expect.objectContaining({ code: 'SPREADSHEET_AUDIT_RESPONSE_INVALID' }),
    );
  });

  it('rejects identifiers before making a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(listSpreadsheetAudits('not-an-id')).rejects.toEqual(
      expect.objectContaining({ code: 'SPREADSHEET_AUDIT_INVALID_IDENTIFIER' }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

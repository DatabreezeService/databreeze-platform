import { describe, expect, it } from 'vitest';
import {
  PublicationProjectionService,
  type ProjectionPreview,
} from '../src/application/publication-projection.service.ts';

const WORKSPACE_POLICY = {
  maxProjectionClass: 'SELECTED_ROWS_COLUMNS' as const,
  allowedFields: ['amount', 'period', 'region'],
  allowOriginalContent: false,
};

describe('DDA-037 publication projection preview', () => {
  it('requires preview of classification, fields, counts, destination, evidence, and policy', () => {
    const service = new PublicationProjectionService({ workspacePolicy: WORKSPACE_POLICY });
    const preview = service.preview({
      class: 'DASHBOARD_AGGREGATES',
      fieldAllowlist: ['amount', 'period'],
      rowCount: 12,
      byteCount: 2048,
      destination: 'CLOUD_WORKSPACE_PROJECTION',
      evidenceConsequences: ['AGGREGATE_ONLY', 'NO_RAW_CELLS'],
      dataMode: 'HYBRID',
      version: 1,
    });

    expect(preview).toMatchObject({
      accepted: true,
      value: {
        class: 'DASHBOARD_AGGREGATES',
        fieldAllowlist: ['amount', 'period'],
        rowCount: 12,
        byteCount: 2048,
        destination: 'CLOUD_WORKSPACE_PROJECTION',
        evidenceConsequences: ['AGGREGATE_ONLY', 'NO_RAW_CELLS'],
        effectiveDataMode: 'HYBRID',
        version: 1,
      },
    } satisfies { accepted: true; value: Partial<ProjectionPreview> });
  });

  it('allows narrowing but rejects broadening beyond workspace policy', () => {
    const service = new PublicationProjectionService({ workspacePolicy: WORKSPACE_POLICY });

    expect(
      service.preview({
        class: 'METADATA_ONLY',
        fieldAllowlist: [],
        rowCount: 0,
        byteCount: 128,
        destination: 'CLOUD_WORKSPACE_PROJECTION',
        evidenceConsequences: ['METADATA_ONLY'],
        dataMode: 'HYBRID',
        version: 1,
      }).accepted,
    ).toBe(true);

    expect(
      service.preview({
        class: 'ORIGINAL_CONTENT',
        fieldAllowlist: ['amount'],
        rowCount: 12,
        byteCount: 2048,
        destination: 'CLOUD_WORKSPACE_PROJECTION',
        evidenceConsequences: ['RAW_CONTENT'],
        dataMode: 'HYBRID',
        version: 1,
      }),
    ).toEqual({ accepted: false, code: 'PROJECTION_POLICY_BROADENING' });

    expect(
      service.preview({
        class: 'SELECTED_ROWS_COLUMNS',
        fieldAllowlist: ['amount', 'secret_col'],
        rowCount: 12,
        byteCount: 2048,
        destination: 'CLOUD_WORKSPACE_PROJECTION',
        evidenceConsequences: ['SELECTED_ROWS'],
        dataMode: 'HYBRID',
        version: 1,
      }),
    ).toEqual({ accepted: false, code: 'PROJECTION_FIELD_NOT_ALLOWED' });
  });

  it('requires a new version and review when the manifest projection changes', () => {
    const service = new PublicationProjectionService({ workspacePolicy: WORKSPACE_POLICY });
    const first = service.approve({
      class: 'DASHBOARD_AGGREGATES',
      fieldAllowlist: ['amount', 'period'],
      rowCount: 12,
      byteCount: 2048,
      destination: 'CLOUD_WORKSPACE_PROJECTION',
      evidenceConsequences: ['AGGREGATE_ONLY'],
      dataMode: 'HYBRID',
      version: 1,
    });
    expect(first.accepted).toBe(true);

    expect(
      service.approve({
        class: 'SELECTED_ROWS_COLUMNS',
        fieldAllowlist: ['amount', 'period'],
        rowCount: 12,
        byteCount: 4096,
        destination: 'CLOUD_WORKSPACE_PROJECTION',
        evidenceConsequences: ['SELECTED_ROWS'],
        dataMode: 'HYBRID',
        version: 1,
      }),
    ).toEqual({ accepted: false, code: 'PROJECTION_VERSION_REVIEW_REQUIRED' });

    const next = service.approve({
      class: 'SELECTED_ROWS_COLUMNS',
      fieldAllowlist: ['amount', 'period'],
      rowCount: 12,
      byteCount: 4096,
      destination: 'CLOUD_WORKSPACE_PROJECTION',
      evidenceConsequences: ['SELECTED_ROWS'],
      dataMode: 'HYBRID',
      version: 2,
    });
    expect(next.accepted).toBe(true);
  });
});

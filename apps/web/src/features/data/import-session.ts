import type { DatasetCardV1, DatasetRecordV1, DatasetSourceFileV1 } from './data-model.ts';
import { toDatasetCardV1 } from './data-model.ts';
import { buildDatasetRecordFromTabular, parseTabularFiles, TabularParseError, type ParsedTabularData, type TabularSourceFileV1 } from './csv-parser.ts';
import {
  DataImportApiError,
  dataImportApi,
  filesToDataImportFiles,
  type DataImportDestinationV1,
  type DataImportRecordV1,
  type DataImportReviewV1,
} from './data-import-api.ts';
import { localDataStore } from './local-data-store.ts';
import { generateStarterDashboard } from '../dashboards/starter-dashboard-generator.ts';

/**
 * Unified dual-track import controller (DDA-053/WEB-021). The server track is
 * authoritative whenever the API is reachable; demo/offline runs take the
 * local track with the same record shape and review UX. Server rejections
 * (auth/validation) surface as failures instead of silently going local.
 */

export type ImportTrackV1 = 'SERVER' | 'LOCAL';
export type ImportSessionStatusV1 = 'CREATING' | 'REVIEW' | 'APPROVING' | 'READY' | 'FAILED';

export interface ImportSessionStateV1 {
  readonly status: ImportSessionStatusV1;
  readonly track: ImportTrackV1;
  readonly record?: DataImportRecordV1;
  readonly parsed?: ParsedTabularData;
  readonly error?: { readonly code: string; readonly message: string };
}

export interface ImportSessionInputV1 {
  readonly destination: DataImportDestinationV1;
  readonly datasetName: string;
  readonly files: readonly TabularSourceFileV1[];
  readonly locale: 'en' | 'vi-VN';
  readonly demoMode?: boolean;
}

export interface ImportApprovedResultV1 {
  readonly dataset: DatasetCardV1;
  readonly starterDashboardId: string | undefined;
  readonly dashboardStatus: 'READY' | 'BUILDING' | 'UNAVAILABLE';
  readonly track: ImportTrackV1;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function buildLocalReview(parsed: ParsedTabularData, locale: 'en' | 'vi-VN'): DataImportReviewV1 {
  const record = buildDatasetRecordFromTabular(parsed, locale);
  const quality = record.quality ?? { completeness: 1, validity: 1, uniqueness: 1, consistency: 1 };
  return Object.freeze({
    beforeSample: parsed.rows.slice(0, 5),
    afterSample: parsed.rows.slice(0, 5),
    counts: Object.freeze({
      input: parsed.totalRows,
      output: parsed.totalRows,
      changed: 0,
      rejected: parsed.malformedRowCount,
    }),
    quality: Object.freeze({
      completeness: quality.completeness,
      validity: quality.validity,
      uniqueness: quality.uniqueness,
      consistency: quality.consistency,
    }),
    warnings: record.preparation?.warnings ?? [],
    corrections: [],
    reviewRequired: true as const,
  });
}

export class ImportSession {
  private readonly input: ImportSessionInputV1;
  private readonly listeners: Set<() => void> = new Set();
  private stateValue: ImportSessionStateV1;

  public constructor(input: ImportSessionInputV1) {
    this.input = input;
    this.stateValue = { status: 'CREATING', track: input.demoMode === true ? 'LOCAL' : 'SERVER' };
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public getState = (): ImportSessionStateV1 => this.stateValue;

  private setState(next: Partial<ImportSessionStateV1>): void {
    this.stateValue = { ...this.stateValue, ...next };
    for (const listener of this.listeners) listener();
  }

  public async start(): Promise<void> {
    let parsed: ParsedTabularData;
    try {
      parsed = await parseTabularFiles(this.input.files);
    } catch (error) {
      if (error instanceof TabularParseError) {
        this.setState({
          status: 'FAILED',
          error: { code: error.code, message: error.detail ?? error.code },
        });
        return;
      }
      throw error;
    }

    if (this.stateValue.track === 'LOCAL') {
      await this.startLocalTrack(parsed);
      return;
    }

    try {
      const created = await dataImportApi.create({
        destination: this.input.destination,
        datasetName: this.input.datasetName,
        idempotencyKey: `web-import-${crypto.randomUUID()}`,
        files: await filesToDataImportFiles(
          this.input.files.map((file) => ({
            name: file.fileName,
            type: mediaTypeFor(file.fileName),
            arrayBuffer: () => Promise.resolve(file.bytes),
          })),
        ),
      });
      this.setState({ status: 'REVIEW', track: 'SERVER', record: created.value, parsed });
    } catch (error) {
      this.setState({
        status: 'FAILED',
        parsed,
        error: {
          code: error instanceof DataImportApiError ? error.code : 'DATA_IMPORT_UNAVAILABLE',
          message: error instanceof Error ? error.message : 'unknown',
        },
      });
    }
  }

  private async startLocalTrack(parsed: ParsedTabularData): Promise<void> {
    const now = new Date().toISOString();
    const record: DataImportRecordV1 = {
      importId: crypto.randomUUID(),
      revision: 1,
      state: 'REVIEW_REQUIRED',
      destination: this.input.destination.kind,
      ...(this.input.destination.kind === 'EXISTING_DATASET'
        ? { datasetId: this.input.destination.datasetId }
        : {}),
      datasetName: this.input.datasetName,
      idempotencyKey: `local-import-${crypto.randomUUID()}`,
      sources: await Promise.all(
        parsed.fileSources.map(async (file) => {
          const source = this.input.files.find((candidate) => candidate.fileName.endsWith(file.fileName)) ??
            this.input.files[0]!;
          return Object.freeze({
            sessionId: crypto.randomUUID(),
            artifactVersionId: crypto.randomUUID(),
            fileName: file.fileName,
            mediaType: mediaTypeFor(file.fileName),
            contentSha256: await sha256Hex(source.bytes),
            byteSize: Math.max(file.byteSize, 1),
            rowCount: file.rowCount,
            fields: parsed.columns.map((column) => ({
              fieldId: crypto.randomUUID(),
              name: column.name,
              type: column.type,
              nullable: column.nullCount > 0,
            })),
            sampleRows: parsed.rows.slice(0, 5),
          });
        }),
      ),
      review: buildLocalReview(parsed, this.input.locale),
      createdAt: now,
      updatedAt: now,
    };
    await localDataStore.putImportRecord(record);
    this.setState({ status: 'REVIEW', track: 'LOCAL', record, parsed });
  }

  public async requestRevision(message: string, fieldName?: string): Promise<void> {
    const record = this.stateValue.record;
    if (record === undefined || this.stateValue.status !== 'REVIEW') return;
    const trimmed = message.trim();
    if (trimmed.length === 0) return;

    if (this.stateValue.track === 'SERVER') {
      try {
        const updated = await dataImportApi.correction(
          record.importId,
          record.revision,
          trimmed,
          fieldName,
        );
        this.setState({ record: updated });
      } catch (error) {
        this.setState({
          error: {
            code: error instanceof DataImportApiError ? error.code : 'DATA_IMPORT_UNAVAILABLE',
            message: error instanceof Error ? error.message : 'unknown',
          },
        });
      }
      return;
    }

    const updated: DataImportRecordV1 = {
      ...record,
      revision: record.revision + 1,
      state: 'REVIEW_REQUIRED',
      review: {
        ...record.review,
        corrections: [
          ...record.review.corrections,
          {
            correctionId: crypto.randomUUID(),
            message: trimmed,
            ...(fieldName === undefined ? {} : { fieldName }),
            createdAt: new Date().toISOString(),
          },
        ],
      },
      updatedAt: new Date().toISOString(),
    };
    await localDataStore.putImportRecord(updated);
    this.setState({ record: updated });
  }

  public async approve(): Promise<ImportApprovedResultV1 | undefined> {
    const record = this.stateValue.record;
    const parsed = this.stateValue.parsed;
    if (record === undefined || parsed === undefined || this.stateValue.status !== 'REVIEW') {
      return undefined;
    }
    this.setState({ status: 'APPROVING' });

    if (this.stateValue.track === 'SERVER') {
      try {
        const approved = await dataImportApi.approve(record.importId, record.revision);
        const accepted = approved.value.accepted;
        if (accepted === undefined) throw new DataImportApiError(502, 'DATA_IMPORT_INVALID');
        const dataset = this.serverDatasetCard(approved.value);
        this.setState({ status: 'READY', record: approved.value });
        return {
          dataset,
          starterDashboardId: undefined,
          dashboardStatus: accepted.dashboardStatus,
          track: 'SERVER',
        };
      } catch (error) {
        this.setState({
          status: 'REVIEW',
          error: {
            code: error instanceof DataImportApiError ? error.code : 'DATA_IMPORT_UNAVAILABLE',
            message: error instanceof Error ? error.message : 'unknown',
          },
        });
        return undefined;
      }
    }

    const isNew = this.input.destination.kind === 'NEW_DATASET';
    let record_: DatasetRecordV1;
    let starterDashboardId: string | undefined;
    if (isNew) {
      record_ = buildDatasetRecordFromTabular(parsed, this.input.locale, {
        label: this.input.datasetName,
        origin: 'LOCAL',
        syncState: 'LOCAL_ONLY',
      });
      localDataStore.addDataset(record_, parsed);
      starterDashboardId = generateStarterDashboard(
        toDatasetCardV1(record_, this.input.locale),
        this.input.locale,
      ).dashboardId;
    } else {
      record_ = localDataStore.appendDatasetVersion(this.input.destination.datasetId, parsed);
    }

    const approvedRecord: DataImportRecordV1 = {
      ...record,
      state: 'READY',
      revision: record.revision + 1,
      accepted: {
        datasetId: record_.datasetId,
        datasetVersionId: record_.currentVersion.versionId,
        definitionVersionId: record_.currentVersion.versionId,
        dashboardStatus: 'BUILDING',
        approvedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
    await localDataStore.putImportRecord(approvedRecord);
    this.setState({ status: 'READY', record: approvedRecord });
    return {
      dataset: toDatasetCardV1(record_, this.input.locale),
      starterDashboardId,
      dashboardStatus: 'READY',
      track: 'LOCAL',
    };
  }

  private serverDatasetCard(approved: DataImportRecordV1): DatasetCardV1 {
    const accepted = approved.accepted;
    if (accepted === undefined) throw new DataImportApiError(502, 'DATA_IMPORT_INVALID');
    const firstSource = approved.sources[0];
    const fieldTypes = firstSource?.fields.map((field) => field.type) ?? [];
    const healthTone = approved.review.warnings.length === 0 ? 'HEALTHY' : 'WARNING';
    const vi = this.input.locale === 'vi-VN';
    return Object.freeze({
      datasetId: accepted.datasetId,
      versionId: accepted.datasetVersionId,
      label: approved.datasetName,
      status: 'PUBLISHED',
      publishedAt: accepted.approvedAt,
      fieldCount: fieldTypes.length,
      fieldTypes: Object.freeze(fieldTypes),
      readiness: 'READY',
      health: Object.freeze({
        label:
          healthTone === 'HEALTHY'
            ? vi
              ? 'Sẵn sàng phân tích'
              : 'Ready for analysis'
            : vi
              ? 'Đã duyệt với cảnh báo'
              : 'Approved with warnings',
        tone: healthTone,
      }),
      versionLabel: vi
        ? `Phiên bản mới · ${approved.review.counts.output.toLocaleString('vi-VN')} hàng · ${fieldTypes.length} cột`
        : `New version · ${approved.review.counts.output.toLocaleString('en-US')} rows · ${fieldTypes.length} columns`,
      sources: Object.freeze(
        approved.sources.map((source): DatasetSourceFileV1 => {
          const sourceType: DatasetSourceFileV1['sourceType'] = source.fileName
            .toLowerCase()
            .endsWith('.xlsx')
            ? 'XLSX'
            : 'CSV';
          return {
            sourceId: source.artifactVersionId,
            label: source.fileName,
            sourceType,
            statusLabel: vi ? 'Đã tiếp nhận' : 'Ingested',
            healthLabel: vi ? 'Đã kiểm tra' : 'Verified',
            originalAction: 'VIEW_SAFE' as const,
            evidenceAvailable: true,
          };
        }),
      ),
    });
  }
}

function mediaTypeFor(fileName: string): string {
  return fileName.toLowerCase().endsWith('.xlsx')
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'text/csv';
}

import { useEffect, useState, useRef } from 'react';
import type { DataImportDestinationV1 } from './data-import-api.ts';
import type { DatasetCardV1 } from './data-model.ts';
import { MAX_TABULAR_FILE_BYTES } from './csv-parser.ts';
import './data-import-drawer.css';

export interface ImportDrawerStartV1 {
  readonly destination: DataImportDestinationV1;
  readonly datasetName: string;
  readonly files: readonly File[];
  readonly projectId?: string;
}

export interface DataImportDrawerProps {
  readonly isOpen: boolean;
  readonly locale: 'en' | 'vi-VN';
  readonly onClose: () => void;
  readonly onStartImport: (input: ImportDrawerStartV1) => void;
  readonly datasets: readonly DatasetCardV1[];
  readonly initialFiles?: readonly File[];
  readonly projects?: readonly { readonly projectId: string; readonly label: string }[];
  readonly defaultProjectId?: string;
}

const ACCEPTED_EXTENSION = /\.(csv|tsv|tab|xlsx)$/iu;

function copy(locale: 'en' | 'vi-VN') {
  return locale === 'vi-VN'
    ? {
        title: 'Thêm dữ liệu vào Không gian làm việc',
        subtitle: 'Tải lên bảng tính CSV hoặc Excel để tự động phân tích cấu trúc, làm sạch và tạo bảng điều khiển.',
        modeLabel: 'Mục tiêu nạp dữ liệu',
        modeNew: 'Tạo bộ dữ liệu mới',
        modeExisting: 'Thêm vào bộ dữ liệu hiện có',
        datasetNameLabel: 'Tên bộ dữ liệu',
        datasetNamePlaceholder: 'Ví dụ: Doanh số Bán lẻ Tháng 8',
        existingDatasetLabel: 'Chọn bộ dữ liệu đích',
        dropzoneTitle: 'Kéo thả tệp CSV hoặc XLSX vào đây',
        dropzoneSubtitle: 'hoặc bấm để chọn tệp từ máy tính',
        selectedFiles: 'Tệp đã chọn:',
        submitBtn: 'Tiến hành Chuẩn hóa & Xem xét thay đổi →',
        cancel: 'Hủy',
        errorNoFile: 'Vui lòng chọn ít nhất một tệp CSV, TSV hoặc XLSX.',
        errorType: 'Một tệp không đúng định dạng (.csv, .tsv, .xlsx) đã bị bỏ qua.',
        errorSize: 'Tệp vượt quá 100 MB: ',
        errorNameRequired: 'Vui lòng đặt tên bộ dữ liệu.',
      }
    : {
        title: 'Add Data to Workspace',
        subtitle: 'Upload CSV or Excel spreadsheets for automatic type inference, cleaning, and dashboard synthesis.',
        modeLabel: 'Import Target',
        modeNew: 'Create new dataset',
        modeExisting: 'Add to existing dataset',
        datasetNameLabel: 'Dataset Name',
        datasetNamePlaceholder: 'e.g. Retail Sales August',
        existingDatasetLabel: 'Select destination dataset',
        dropzoneTitle: 'Drag & drop CSV or XLSX files here',
        dropzoneSubtitle: 'or click to browse from computer',
        selectedFiles: 'Selected files:',
        submitBtn: 'Proceed to Preparation & Review →',
        cancel: 'Cancel',
        errorNoFile: 'Please select at least one CSV, TSV, or XLSX file.',
        errorType: 'A file with an unsupported format (.csv, .tsv, .xlsx only) was skipped.',
        errorSize: 'File exceeds 100 MB: ',
        errorNameRequired: 'Please name the dataset.',
      };
}

function acceptFiles(
  candidates: readonly File[],
  text: ReturnType<typeof copy>,
): { readonly files: readonly File[]; readonly error: string | null } {
  const supported = candidates.filter((file) => ACCEPTED_EXTENSION.test(file.name));
  const oversized = supported.filter((file) => file.size > MAX_TABULAR_FILE_BYTES);
  const accepted = supported.filter((file) => file.size <= MAX_TABULAR_FILE_BYTES);
  const error =
    oversized.length > 0
      ? `${text.errorSize}${oversized.map((file) => file.name).join(', ')}`
      : candidates.length > supported.length
        ? text.errorType
        : null;
  return { files: accepted, error };
}

export function DataImportDrawer({
  isOpen,
  locale,
  onClose,
  onStartImport,
  datasets,
  initialFiles,
  projects,
  defaultProjectId,
}: DataImportDrawerProps) {
  const text = copy(locale);
  const existingDatasets = datasets;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [datasetName, setDatasetName] = useState('');
  const [selectedExistingId, setSelectedExistingId] = useState<string>(
    existingDatasets[0]?.datasetId ?? '',
  );
  const [projectChoice, setProjectChoice] = useState<string>(defaultProjectId ?? '');
  const [selectedFiles, setSelectedFiles] = useState<readonly File[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setProjectChoice(defaultProjectId ?? '');
  }, [isOpen, defaultProjectId]);

  useEffect(() => {
    if (!isOpen || initialFiles === undefined || initialFiles.length === 0) return;
    const { files, error } = acceptFiles(initialFiles, text);
    setSelectedFiles(files);
    setErrorMsg(error);
    if (!datasetName && files[0]) {
      const clean = files[0].name.replace(/\.[^/.]+$/u, '').replace(/[-_]/gu, ' ');
      setDatasetName(clean.charAt(0).toUpperCase() + clean.slice(1));
    }
  }, [isOpen, initialFiles]);

  if (!isOpen) return null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      const { files, error } = acceptFiles(Array.from(e.target.files), text);
      setSelectedFiles(files);
      if (!datasetName && files[0]) {
        const clean = files[0].name.replace(/\.[^/.]+$/u, '').replace(/[-_]/gu, ' ');
        setDatasetName(clean.charAt(0).toUpperCase() + clean.slice(1));
      }
      setErrorMsg(error);
    }
  }

  function handleStartImport(e: React.FormEvent) {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      setErrorMsg(text.errorNoFile);
      return;
    }
    const trimmedName = datasetName.trim();
    if (mode === 'new' && trimmedName.length === 0) {
      setErrorMsg(text.errorNameRequired);
      return;
    }
    onStartImport({
      destination:
        mode === 'existing' && selectedExistingId !== ''
          ? { kind: 'EXISTING_DATASET', datasetId: selectedExistingId }
          : { kind: 'NEW_DATASET' },
      datasetName: mode === 'existing' ? trimmedName || existingDatasetLabel(selectedExistingId, existingDatasets) : trimmedName,
      files: selectedFiles,
      ...(mode === 'new' && projectChoice !== '' ? { projectId: projectChoice } : {}),
    });
  }

  function existingDatasetLabel(datasetId: string, datasets: readonly { datasetId: string; label: string }[]): string {
    return datasets.find((dataset) => dataset.datasetId === datasetId)?.label ?? '';
  }

  return (
    <div className="data-import-drawer-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="data-import-drawer-panel" onClick={(e) => e.stopPropagation()}>
        <header className="data-import-drawer-header">
          <div>
            <h3>{text.title}</h3>
            <p>{text.subtitle}</p>
          </div>
          <button className="data-import-drawer-close" onClick={onClose} type="button" aria-label="Close">
            ✕
          </button>
        </header>

        <form onSubmit={handleStartImport} className="data-import-drawer-form">
          {/* Target Mode Selector */}
          <div className="data-import-form-group">
            <label className="data-import-label">{text.modeLabel}</label>
            <div className="data-import-mode-radios">
              <label className={`data-import-mode-option${mode === 'new' ? ' is-active' : ''}`}>
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === 'new'}
                  onChange={() => setMode('new')}
                />
                <span>{text.modeNew}</span>
              </label>
              <label
                className={`data-import-mode-option${mode === 'existing' ? ' is-active' : ''}`}
                aria-disabled={existingDatasets.length === 0}
              >
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === 'existing'}
                  onChange={() => setMode('existing')}
                  disabled={existingDatasets.length === 0}
                />
                <span>{text.modeExisting}</span>
              </label>
            </div>
          </div>

          {mode === 'new' ? (
            <>
              <div className="data-import-form-group">
                <label className="data-import-label" htmlFor="dataset-name-input">
                  {text.datasetNameLabel}
                </label>
                <input
                  id="dataset-name-input"
                  className="data-import-input"
                  placeholder={text.datasetNamePlaceholder}
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                />
              </div>
              {projects !== undefined && projects.length > 0 ? (
                <div className="data-import-form-group">
                  <label className="data-import-label" htmlFor="project-select">
                    {locale === 'vi-VN' ? 'Thuộc dự án' : 'Belongs to project'}
                  </label>
                  <select
                    id="project-select"
                    className="data-import-select"
                    value={projectChoice}
                    onChange={(e) => setProjectChoice(e.target.value)}
                  >
                    <option value="">{locale === 'vi-VN' ? '— Không thuộc dự án —' : '— No project —'}</option>
                    {projects.map((project) => (
                      <option key={project.projectId} value={project.projectId}>
                        {project.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </>
          ) : (
            <div className="data-import-form-group">
              <label className="data-import-label" htmlFor="existing-dataset-select">
                {text.existingDatasetLabel}
              </label>
              <select
                id="existing-dataset-select"
                className="data-import-select"
                value={selectedExistingId}
                onChange={(e) => setSelectedExistingId(e.target.value)}
              >
                {existingDatasets.map((d) => (
                  <option key={d.datasetId} value={d.datasetId}>
                    {d.label} ({d.versionLabel})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Drag and Drop Zone */}
          <div
            className="data-import-dropzone"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const { files, error } = acceptFiles(Array.from(e.dataTransfer.files), text);
                setSelectedFiles(files);
                if (!datasetName && files[0]) {
                  const clean = files[0].name.replace(/\.[^/.]+$/u, '').replace(/[-_]/gu, ' ');
                  setDatasetName(clean.charAt(0).toUpperCase() + clean.slice(1));
                }
                setErrorMsg(error);
              }
            }}
          >
            <div className="data-import-dropzone-icon" aria-hidden="true">＋</div>
            <strong>{text.dropzoneTitle}</strong>
            <small>{text.dropzoneSubtitle}</small>
            <div className="data-import-badge-row">
              <span className="data-import-badge">.CSV</span>
              <span className="data-import-badge">.TSV</span>
              <span className="data-import-badge">.XLSX</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.tab,.xlsx"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>

          {selectedFiles.length > 0 ? (
            <div className="data-import-selected-list">
              <small>{text.selectedFiles}</small>
              {selectedFiles.map((f) => (
                <div key={`${f.name}:${f.size}`} className="data-import-file-chip">
                  <span>{f.name}</span>
                  <small>({Math.round(f.size / 1024)} KB)</small>
                </div>
              ))}
            </div>
          ) : null}

          {errorMsg ? <p className="data-import-error-msg">{errorMsg}</p> : null}

          <div className="data-import-drawer-actions">
            <button type="button" className="db-button db-button--secondary" onClick={onClose}>
              {text.cancel}
            </button>
            <button
              type="submit"
              className="db-button db-button--primary"
              disabled={selectedFiles.length === 0}
            >
              {text.submitBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState, useRef } from 'react';
import { importApi } from '../services/api';

export default function DataImport({ user }) {
  const [step, setStep] = useState('idle'); // idle | uploading | validating | importing | done | error
  const [file, setFile] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const fileInputRef = useRef(null);

  const reset = () => {
    setStep('idle');
    setFile(null);
    setUploadResult(null);
    setValidationResult(null);
    setImportResult(null);
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileSelect = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!f.name.endsWith('.csv')) {
      setErrorMsg('Only CSV files are supported. Please select a valid .csv file.');
      return;
    }
    setErrorMsg('');
    setFile(f);
    setStep('idle');
  };

  const handleUpload = async () => {
    if (!file) return;
    setStep('uploading');
    setErrorMsg('');
    try {
      const result = await importApi.upload(file);
      setUploadResult(result);
      setStep('validating');
      const validation = await importApi.validate(result.file_id, result.folder_id);
      setValidationResult(validation);
      setStep('validated');
    } catch (err) {
      setErrorMsg(err.message || 'Unable to upload the file. Please check your connection and try again.');
      setStep('error');
    }
  };

  const handleImport = async () => {
    if (!uploadResult) return;
    setStep('importing');
    setErrorMsg('');
    try {
      const result = await importApi.start(
        uploadResult.file_id,
        uploadResult.folder_id,
        uploadResult.filename,
        skipDuplicates
      );
      setImportResult(result);
      setStep('done');
    } catch (err) {
      setErrorMsg(err.message || 'Import failed. Please try again or contact support.');
      setStep('error');
    }
  };

  const statusLabel = {
    idle: '',
    uploading: 'Uploading CSV file to secure storage...',
    validating: 'Validating file structure and data integrity...',
    validated: '',
    importing: 'Importing records into the database...',
    done: '',
    error: '',
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Data Import</h2>
          <div className="page-header-sub">Karnataka State Police — Bulk CSV Import</div>
        </div>
      </div>

      <div className="page-body">
        {/* Page Introduction */}
        <div className="page-intro">
          <div className="page-intro-icon">📥</div>
          <div className="page-intro-content">
            <div className="page-intro-title">Crime Records Import</div>
            <div className="page-intro-desc">
              <strong>Description:</strong> Administrative utility for uploading bulk crime statistics and location reports via formatted CSV files.
              <br />
              <strong>Purpose:</strong> To append new historical crime records and geographic coordinates to the centralized database without manual entry.
              <br />
              <strong>Instructions:</strong> Select a valid CSV file, choose duplicate handling options, click "Upload &amp; Validate", review the preview data, and confirm the import.
            </div>
            <div className="page-intro-steps">
              <span className="intro-step">① Select CSV file</span>
              <span className="intro-step">② Upload &amp; Validate</span>
              <span className="intro-step">③ Review preview</span>
              <span className="intro-step">④ Confirm import</span>
            </div>
          </div>
        </div>

        {/* Upload Card */}
        <div className="chart-card" style={{ marginBottom: 20 }}>
          <div className="chart-card-header">
            <div className="chart-card-title">Step 1 — Select File</div>
          </div>
          <div style={{ padding: '16px 0' }}>
            <div className="form-group">
              <label className="form-label">CSV File *</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="form-input"
                onChange={handleFileSelect}
                disabled={['uploading', 'validating', 'importing'].includes(step)}
              />
              {file && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>
                  Selected: <strong style={{ color: '#e2e8f0' }}>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </div>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={e => setSkipDuplicates(e.target.checked)}
                  disabled={['uploading', 'validating', 'importing'].includes(step)}
                />
                <span>Skip duplicate records (recommended)</span>
              </label>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={!file || ['uploading', 'validating', 'importing'].includes(step)}
              >
                {step === 'uploading' ? 'Uploading...' : step === 'validating' ? 'Validating...' : 'Upload & Validate'}
              </button>
              {step !== 'idle' && (
                <button className="btn btn-secondary" onClick={reset}>
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Status / Loading */}
        {statusLabel[step] && (
          <div className="loading" style={{ justifyContent: 'flex-start', padding: '12px 16px', marginBottom: 16 }}>
            <div className="spinner" style={{ width: 18, height: 18, marginRight: 10 }}></div>
            {statusLabel[step]}
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div className="error-banner" style={{ marginBottom: 16 }}>
            <span style={{ marginRight: 8 }}>⚠</span>{errorMsg}
          </div>
        )}

        {/* Validation Preview */}
        {validationResult && step === 'validated' && (
          <div className="chart-card" style={{ marginBottom: 20 }}>
            <div className="chart-card-header">
              <div className="chart-card-title">Step 2 — Validation Preview</div>
            </div>
            <div style={{ padding: '16px 0' }}>
              <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 16 }}>
                <div className="kpi-card">
                  <div className="kpi-card-label">Total Rows</div>
                  <div className="kpi-card-value">{validationResult.stats?.total_rows ?? '—'}</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-card-label">Valid Rows</div>
                  <div className="kpi-card-value" style={{ color: '#10b981' }}>{validationResult.stats?.valid_rows ?? '—'}</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-card-label">Invalid Rows</div>
                  <div className="kpi-card-value" style={{ color: '#ef4444' }}>{validationResult.stats?.invalid_rows ?? '—'}</div>
                </div>
              </div>

              {validationResult.preview && validationResult.preview.length > 0 && (
                <div className="data-table-wrapper" style={{ maxHeight: 300, marginBottom: 16 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        {Object.keys(validationResult.preview[0]).map(k => (
                          <th key={k}>{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {validationResult.preview.slice(0, 10).map((row, i) => (
                        <tr key={i}>
                          {Object.values(row).map((v, j) => (
                            <td key={j}>{String(v ?? '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary" onClick={handleImport}>
                  Confirm Import
                </button>
                <button className="btn btn-secondary" onClick={reset}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Import Result */}
        {importResult && step === 'done' && (
          <div className="chart-card">
            <div className="chart-card-header">
              <div className="chart-card-title" style={{ color: '#10b981' }}>✓ Import Successful</div>
            </div>
            <div style={{ padding: '16px 0' }}>
              <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="kpi-card">
                  <div className="kpi-card-label">Records Imported</div>
                  <div className="kpi-card-value" style={{ color: '#10b981' }}>{importResult.imported ?? importResult.records_imported ?? '—'}</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-card-label">Skipped</div>
                  <div className="kpi-card-value">{importResult.skipped ?? importResult.records_skipped ?? 0}</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-card-label">Failed</div>
                  <div className="kpi-card-value" style={{ color: importResult.failed > 0 ? '#ef4444' : undefined }}>{importResult.failed ?? importResult.records_failed ?? 0}</div>
                </div>
              </div>
              <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={reset}>
                Import Another File
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

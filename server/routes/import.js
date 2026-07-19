'use strict';

/**
 * KSP Crime Intelligence Platform — Import Routes
 * ─────────────────────────────────────────────────
 * Provides a 3-step, Catalyst File Store-based CSV import pipeline:
 *
 *   POST /api/import/upload    — Upload CSV → Catalyst File Store, returns file_id
 *   POST /api/import/validate  — Download file, parse, validate, detect duplicates
 *   POST /api/import/start     — Download file, bulk-insert into crime_raw
 *
 * Also preserves:
 *   POST /api/import/crimes    — Single JSON record insert (unchanged)
 *   GET  /api/import/health    — Health check (unchanged)
 */

const express = require('express');
const multer  = require('multer');
const router  = express.Router();

const { authenticateToken }    = require('../middleware/auth');
const { requireRole }          = require('../middleware/roleMiddleware');
const { validateCrimeRecord }  = require('../services/validationService');
const crimeRepository          = require('../repositories/crimeRepository');
const pipelineService          = require('../services/pipelineService');
const filestoreService         = require('../services/filestoreService');
const DbscanRunner             = require('../services/dbscanRunner');
const fs                       = require('fs');
const path                     = require('path');

/**
 * Wrap async route handlers so unhandled promise rejections are forwarded to next().
 */
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ─── Multer — memory storage, CSV files only, 50 MB cap ──────────────────────
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.originalname.toLowerCase().endsWith('.csv') ||
               /text\/(csv|plain)/i.test(file.mimetype) ||
               /csv/i.test(file.mimetype);
    cb(ok ? null : new Error('Only .csv files are accepted.'), ok);
  },
});

// ─── Karnataka geographic bounding box (for coordinate warnings) ─────────────
// Approximately covers the state of Karnataka, India.
const KA_BOUNDS = { minLat: 11.5, maxLat: 18.5, minLng: 74.0, maxLng: 78.6 };

// ─────────────────────────────────────────────────────────────────────────────
// CSV Parsing Helpers
// (Pure Node.js — zero external packages)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a single CSV line into an array of trimmed string values.
 * Correctly handles double-quoted fields that contain commas or newlines.
 */
function parseCSVLine(line) {
  const parts = [];
  let current  = '';
  let inQuotes = false;

  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      parts.push(current.trim().replace(/\r/g, ''));
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current.trim().replace(/\r/g, ''));
  return parts;
}

function normalizeHeader(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/\-+/g, '_');
}

/**
 * Parse a full CSV string into { headers, rows }.
 * Strips UTF-8 BOM, uses first non-empty line as headers, skips blank lines.
 */
function parseCSV(csvText) {
  const text     = (csvText || '').replace(/^\uFEFF/, ''); // strip BOM
  const lines    = text.split('\n');
  const nonEmpty = lines.filter(l => l.replace(/\r/g, '').trim().length > 0);

  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = parseCSVLine(nonEmpty[0]).map(normalizeHeader);
  const rows    = [];

  for (let i = 1; i < nonEmpty.length; i++) {
    const parts = parseCSVLine(nonEmpty[i]);
    const row   = {};
    headers.forEach((h, idx) => {
      row[h] = parts[idx] !== undefined ? parts[idx] : '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

// ─── Severity normaliser ──────────────────────────────────────────────────────

function normalizeSeverity(value) {
  if (value === undefined || value === null) return 1;
  const normalized = String(value).trim();
  if (normalized === '') return 1;

  const severityMap = { low: 1, medium: 2, high: 3, critical: 4 };
  const mapped = severityMap[normalized.toLowerCase()];
  if (mapped !== undefined) return mapped;

  const numeric = parseInt(normalized, 10);
  return Number.isNaN(numeric) ? 1 : numeric;
}

// ─── Date normaliser ──────────────────────────────────────────────────────────

function formatDateToYYYYMMDD(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function excelSerialToDate(serial) {
  const days = Number(serial);
  if (Number.isNaN(days) || days <= 0) return null;

  const wholeDays    = Math.floor(days);
  const timeFraction = days - wholeDays;
  const msPerDay     = 24 * 60 * 60 * 1000;
  const excelEpoch   = Date.UTC(1899, 11, 31);

  let dateMs = excelEpoch + wholeDays * msPerDay;
  if (wholeDays >= 60) dateMs -= msPerDay; // Excel 1900 leap-year bug correction

  dateMs += Math.round(timeFraction * msPerDay);
  const date = new Date(dateMs);
  return isNaN(date.getTime()) ? null : date;
}

function normalizeDateValue(value) {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? '' : formatDateToYYYYMMDD(value);
  }

  const raw = String(value || '').trim();
  if (!raw) return '';

  const numericValue = Number(raw);
  const isExcelSerial = /^[0-9]+(?:\.[0-9]+)?$/.test(raw) &&
                        numericValue > 0 && numericValue < 100000;
  if (isExcelSerial) {
    const excelDate = excelSerialToDate(numericValue);
    if (excelDate) return formatDateToYYYYMMDD(excelDate);
  }

  const normalized = raw.replace(/\//g, '-').trim();
  const isoMatch   = /^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized);
  if (isoMatch) {
    const parsed = new Date(normalized);
    if (!isNaN(parsed.getTime())) return formatDateToYYYYMMDD(parsed);
  }

  const parts = normalized.split('-');
  if (parts.length === 3) {
    const [p1, p2, p3] = parts;
    const n1 = Number(p1), n2 = Number(p2), n3 = Number(p3);
    if (!Number.isNaN(n1) && !Number.isNaN(n2) && !Number.isNaN(n3)) {
      let parsed;
      if (/^\d{4}$/.test(p1)) {
        parsed = new Date(normalized);
      } else if (/^\d{4}$/.test(p3)) {
        parsed = (p1.length > 2 || Number(p1) > 12)
          ? new Date(n3, n2 - 1, n1)
          : new Date(n3, n1 - 1, n2);
      }
      if (parsed && !isNaN(parsed.getTime())) return formatDateToYYYYMMDD(parsed);
    }
  }

  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? '' : formatDateToYYYYMMDD(parsed);
}

// ─── Row mapper ───────────────────────────────────────────────────────────────

/**
 * Map a raw CSV row (all string values) to a typed crime record.
 * Preserves original business logic from previous import.js.
 */
function mapRowToRecord(rawRow) {
  const incidentDateValue = normalizeDateValue(rawRow.incident_date || rawRow.date);

  return {
    crime_id:      (rawRow.crime_id   || '').trim(),
    crime_type:    (rawRow.crime_type || '').trim(),
    latitude:      rawRow.latitude  !== '' ? parseFloat(rawRow.latitude)  : NaN,
    longitude:     rawRow.longitude !== '' ? parseFloat(rawRow.longitude) : NaN,
    district:      (rawRow.district  || '').trim(),
    severity:      normalizeSeverity(rawRow.severity),
    incident_date: incidentDateValue || new Date().toISOString().slice(0, 10),
    status:        (rawRow.status || 'raw').trim(),
  };
}

// ─── Row validator (lenient — any non-empty crime_type accepted) ──────────────

/**
 * Validates a mapped CSV row against business rules.
 * Uses lenient crime_type validation (any non-empty string) to support
 * real-world KSP crime categories that exceed the whitelist in validationService.js.
 */
function validateCsvRecord(record) {
  const errors = [];

  if (!record || typeof record !== 'object') {
    return { valid: false, errors: ['Record must be a valid object.'] };
  }

  if (!record.crime_id || typeof record.crime_id !== 'string' || record.crime_id.trim() === '') {
    errors.push('Missing or invalid crime_id. It must be a non-empty string.');
  }

  if (!record.crime_type || typeof record.crime_type !== 'string' || record.crime_type.trim() === '') {
    errors.push('Missing or invalid crime_type. It must be a non-empty string.');
  }

  const lat = Number(record.latitude);
  if (isNaN(lat) || lat < -90 || lat > 90) {
    errors.push('Invalid latitude. Must be a number between -90 and 90.');
  }

  const lng = Number(record.longitude);
  if (isNaN(lng) || lng < -180 || lng > 180) {
    errors.push('Invalid longitude. Must be a number between -180 and 180.');
  }

  if (!record.district || typeof record.district !== 'string' || record.district.trim() === '') {
    errors.push('Missing or invalid district. It must be a non-empty string.');
  }

  return { valid: errors.length === 0, errors };
}

// Required CSV column headers (matched after header normalisation)
const REQUIRED_HEADERS = ['crime_id', 'crime_type', 'latitude', 'longitude', 'district'];

// Maximum number of rows for which duplicate DB lookups are performed in /validate
const DUPE_CHECK_LIMIT = 500;


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/import/crimes  (UNCHANGED — single JSON record insert)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   POST /api/import/crimes
 * @access  ADMIN only
 * @desc    Validate a single crime JSON record, insert into crime_raw,
 *          write import_history, and log to Pipeline_Logs.
 *
 * Request body (JSON):
 *   {
 *     "crime_id":      "C-2023-001",   required, unique
 *     "crime_type":    "Theft",        required
 *     "latitude":      12.9716,        required, number
 *     "longitude":     77.5946,        required, number
 *     "severity":      3,              required, integer 1-5
 *     "district":      "Central",      required
 *     "incident_date": "2023-06-01",   optional — defaults to today
 *     "status":        "raw"           optional — defaults to "raw"
 *   }
 *
 * Success (201): { success: true, message, data }
 * Error   (400): { success: false, errors: [...] }
 * Error   (500): { success: false, error }
 */
router.post('/crimes', authenticateToken, requireRole('ADMIN'), asyncHandler(async (req, res) => {

  // ── Step 1: Validate ────────────────────────────────────────────────────────
  const validationResult = validateCrimeRecord(req.body);

  if (!validationResult.valid) {
    return res.status(400).json({
      success: false,
      errors:  validationResult.errors
    });
  }

  // ── Step 2: Enrich with defaults ────────────────────────────────────────────
  const importedBy = (req.user && req.user.id) ? req.user.id : 'system';

  const enrichedRecord = {
    ...req.body,
    incident_date: req.body.incident_date || new Date().toISOString().slice(0, 10),
  };

  // ── Step 3: Start pipeline tracking ────────────────────────────────────────
  let importId;
  try {
    importId = await pipelineService.startPipeline(req, {
      filename:     'JSON_SINGLE',
      source:       'JSON',
      totalRecords: 1,
    });
  } catch (pipelineErr) {
    console.error('[Import] pipelineService.startPipeline failed:', pipelineErr.message);
    importId = null;
  }

  // ── Step 4: Log validation stage ───────────────────────────────────────────
  if (importId) {
    await pipelineService.logStage(req, importId, 'VALIDATION', 'success', 'Record passed validation.', 1);
  }

  // ── Step 5: Insert into crime_raw ──────────────────────────────────────────
  let insertedRow;
  try {
    insertedRow = await crimeRepository.insertCrime(req, enrichedRecord, importedBy);
  } catch (insertErr) {
    console.error('[Import] crimeRepository.insertCrime failed:', insertErr.message);
    if (importId) {
      await pipelineService.failPipeline(req, importId, insertErr.message, 0, 1);
    }
    return res.status(500).json({
      success: false,
      error:   'Failed to save crime record. Please try again.',
    });
  }

  // ── Step 6: Log insert stage ───────────────────────────────────────────────
  if (importId) {
    await pipelineService.logStage(
      req, importId, 'INSERT', 'success',
      `Inserted crime_id: ${enrichedRecord.crime_id}`, 1
    );
  }

  // ── Step 7: Complete pipeline ──────────────────────────────────────────────
  if (importId) {
    await pipelineService.completePipeline(req, importId, 1, 0);
  }

  // ── Step 8: Respond ────────────────────────────────────────────────────────
  return res.status(201).json({
    success: true,
    message: 'Crime record imported and saved successfully.',
    data:    enrichedRecord,
  });

}));


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/import/upload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   POST /api/import/upload
 * @access  ADMIN only
 * @desc    Accept a CSV file via multipart/form-data (field: "csv"),
 *          upload it to Catalyst File Store, and return { file_id, folder_id }.
 *
 * Prerequisites:
 *   - CATALYST_CSV_FOLDER_ID must be set in server/.env
 *   - The folder must already exist in the Catalyst Console → File Store
 *
 * Request: multipart/form-data, field name "csv", file size ≤ 50 MB
 *
 * Success (200):
 *   { success: true, file_id, folder_id, filename, size_bytes }
 *
 * Error (400): Missing file, wrong extension, exceeds size limit
 */
router.post(
  '/upload',
  authenticateToken,
  requireRole('ADMIN'),
  (req, res, next) => {
    csvUpload.single('csv')(req, res, err => {
      if (err) return res.status(400).json({ success: false, error: err.message });
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error:   'No file received. Upload a CSV file in the "csv" multipart field.',
      });
    }

    const { originalname, buffer, size } = req.file;

    if (!originalname.toLowerCase().endsWith('.csv')) {
      return res.status(400).json({
        success: false,
        error:   `Only .csv files are accepted. Received: "${originalname}"`,
      });
    }

    console.log(`[Import Upload] Uploading "${originalname}" (${size} bytes) to Catalyst File Store`);

    let result;
    try {
      result = await filestoreService.uploadCsvBuffer(req, buffer, originalname);
      console.log(`[Import Upload] Uploaded → file_id=${result.file_id}, folder_id=${result.folder_id}`);
      return res.json({ success: true, ...result });
    } catch (err) {
      console.error('[Import Upload] uploadCsvBuffer threw:', err && err.message);
      console.error(err && err.stack);
      const details = {};
      if (err && typeof err === 'object') {
        Object.getOwnPropertyNames(err).forEach(k => {
          try { details[k] = err[k]; } catch (e) { details[k] = String(err[k]); }
        });
      }
      return res.status(500).json({ success: false, error: err && err.message ? err.message : 'Upload failed', details });
    }
  })
);


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/import/validate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   POST /api/import/validate
 * @access  ADMIN only
 * @desc    Download a previously uploaded CSV from Catalyst File Store,
 *          parse and validate every row, detect duplicates in crime_raw,
 *          check coordinates against the Karnataka bounding box,
 *          and return a full preview + statistics.
 *
 * Request body (JSON):
 *   { "file_id": "...", "folder_id": "..." }
 *   (both returned by POST /api/import/upload)
 *
 * Success (200):
 *   {
 *     success: true,
 *     total_rows, valid_count, invalid_count,
 *     duplicate_count, duplicate_check_limit,
 *     duplicates_truncated,        // true if >500 valid rows (only first 500 checked)
 *     coord_warning_count,
 *     headers,
 *     preview,                     // first 10 rows with status badges
 *     errors,                      // [{ row, crime_id, errors[] }]
 *     duplicates,                  // [{ row, crime_id }]
 *     coord_warnings,              // [{ row, crime_id, lat, lng }]
 *     can_import                   // true if at least 1 valid, non-duplicate row exists
 *   }
 */
router.post('/validate', authenticateToken, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { file_id, folder_id } = req.body;

  if (!file_id || !folder_id) {
    return res.status(400).json({
      success: false,
      error:   'file_id and folder_id are required. Call POST /upload first.',
    });
  }

  // ── Download from File Store ────────────────────────────────────────────────
  const buffer  = await filestoreService.downloadCsvBuffer(req, folder_id, file_id);
  const csvText = buffer.toString('utf8');

  // ── Parse ───────────────────────────────────────────────────────────────────
  const { headers, rows } = parseCSV(csvText);

  if (headers.length === 0 || rows.length === 0) {
    const previewText = String(csvText || '').slice(0, 200);
    const previewHex = Buffer.from(String(csvText || ''), 'utf8').toString('hex').slice(0, 400);
    return res.status(400).json({
      success: false,
      error:   'CSV has no data rows. Ensure the file has a header row and at least one data row.',
      raw_preview: previewText,
      raw_preview_hex: previewHex,
    });
  }

  // ── Validate headers ────────────────────────────────────────────────────────
  const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missingHeaders.length > 0) {
    return res.status(400).json({
      success:         false,
      error:           `CSV is missing required columns: ${missingHeaders.join(', ')}`,
      missing_headers: missingHeaders,
      present_headers: headers,
      required_headers: REQUIRED_HEADERS,
    });
  }

  // ── Validate every row ──────────────────────────────────────────────────────
  const validRowsData   = [];   // { rowNum, record }
  const invalidRows     = [];   // { row, crime_id, errors[] }
  const coordWarnings   = [];   // { row, crime_id, lat, lng }

  for (let i = 0; i < rows.length; i++) {
    const record       = mapRowToRecord(rows[i]);
    const { valid, errors } = validateCsvRecord(record);
    const rowNum       = i + 2; // +2: 1-indexed + header

    if (valid) {
      validRowsData.push({ rowNum, record });

      // Coordinate sanity check (warn but do not reject)
      const { latitude: lat, longitude: lng, crime_id } = record;
      if (
        lat < KA_BOUNDS.minLat || lat > KA_BOUNDS.maxLat ||
        lng < KA_BOUNDS.minLng || lng > KA_BOUNDS.maxLng
      ) {
        coordWarnings.push({ row: rowNum, crime_id, lat, lng });
      }
    } else {
      invalidRows.push({
        row:      rowNum,
        crime_id: rows[i].crime_id || `(row ${rowNum})`,
        errors,
      });
    }
  }

  // ── Duplicate detection (DB lookup, capped at DUPE_CHECK_LIMIT) ─────────────
  const duplicates          = [];
  const duplicatesCapped    = validRowsData.length > DUPE_CHECK_LIMIT;
  const rowsToCheck         = validRowsData.slice(0, DUPE_CHECK_LIMIT);

  for (const { rowNum, record } of rowsToCheck) {
    try {
      const existing = await crimeRepository.findByCrimeId(req, record.crime_id);
      if (existing) {
        duplicates.push({ row: rowNum, crime_id: record.crime_id });
      }
    } catch (err) {
      // Non-fatal — log and continue
      console.warn(`[Import Validate] findByCrimeId failed for "${record.crime_id}":`, err.message);
    }
  }

  // ── Build preview (first 10 rows) ───────────────────────────────────────────
  const duplicateCrimeIds = new Set(duplicates.map(d => d.crime_id));
  const preview = rows.slice(0, 10).map((row, i) => {
    const record             = mapRowToRecord(row);
    const { valid, errors }  = validateCsvRecord(record);
    const isDuplicate        = duplicateCrimeIds.has(record.crime_id);
    return {
      row:    i + 2,
      ...record,
      status: isDuplicate ? 'duplicate' : (valid ? 'valid' : 'invalid'),
      errors: valid ? [] : errors,
    };
  });

  // ── can_import: at least 1 valid row that is NOT a confirmed duplicate ───────
  const validNonDuplicateCount = validRowsData
    .slice(0, DUPE_CHECK_LIMIT)
    .filter(({ record }) => !duplicateCrimeIds.has(record.crime_id))
    .length
    + (duplicatesCapped ? validRowsData.length - DUPE_CHECK_LIMIT : 0);

  const can_import = validNonDuplicateCount > 0;

  return res.json({
    success:                true,
    total_rows:             rows.length,
    valid_count:            validRowsData.length,
    invalid_count:          invalidRows.length,
    duplicate_count:        duplicates.length,
    duplicate_check_limit:  DUPE_CHECK_LIMIT,
    duplicates_truncated:   duplicatesCapped,
    coord_warning_count:    coordWarnings.length,
    headers,
    preview,
    errors:                 invalidRows,
    duplicates,
    coord_warnings:         coordWarnings,
    can_import,
  });
}));


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/import/start
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   POST /api/import/start
 * @access  ADMIN only
 * @desc    Download a previously uploaded CSV from Catalyst File Store,
 *          validate all rows, optionally skip duplicates, bulk-insert valid
 *          rows into crime_raw (batches of 200), write pipeline logs, and
 *          delete the staging file.
 *
 * Request body (JSON):
 *   {
 *     "file_id":          "...",          required
 *     "folder_id":        "...",          required
 *     "filename":         "crimes.csv",   optional (used in import_history)
 *     "skip_duplicates":  true            optional (default: false)
 *   }
 *
 * Success (201):
 *   {
 *     success: true,
 *     message: "...",
 *     summary: { total, valid, inserted, failed, rejected, skipped_duplicates },
 *     rejected_rows:      [...],   capped at 100
 *     insert_errors:      [...],
 *     skipped_duplicates: [...]    crime_ids that were skipped (capped at 100)
 *   }
 *
 * Partial success (201): same shape with non-zero failed/rejected counts
 * No rows inserted (422): httpStatus = 422
 */
router.post('/start', authenticateToken, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const {
    file_id,
    folder_id,
    filename        = 'upload.csv',
    skip_duplicates = false,
  } = req.body;

  if (!file_id || !folder_id) {
    return res.status(400).json({
      success: false,
      error:   'file_id and folder_id are required. Call POST /upload first.',
    });
  }

  // ── Download from File Store ────────────────────────────────────────────────
  const buffer  = await filestoreService.downloadCsvBuffer(req, folder_id, file_id);
  const csvText = buffer.toString('utf8');

  // ── Parse ───────────────────────────────────────────────────────────────────
  const { headers, rows } = parseCSV(csvText);

  if (headers.length === 0 || rows.length === 0) {
    return res.status(400).json({
      success: false,
      error:   'CSV has no data rows.',
    });
  }

  // ── Validate headers ────────────────────────────────────────────────────────
  const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missingHeaders.length > 0) {
    return res.status(400).json({
      success:         false,
      error:           `CSV is missing required columns: ${missingHeaders.join(', ')}`,
      missing_headers: missingHeaders,
    });
  }

  const importedBy    = (req.user && req.user.id) ? req.user.id : 'system';
  const safeFilename  = String(filename).substring(0, 500);

  console.log(`[Import Start] "${safeFilename}" — ${rows.length} rows — by ${importedBy}`);

  // ── Start pipeline ──────────────────────────────────────────────────────────
  let importId;
  try {
    importId = await pipelineService.startPipeline(req, {
      filename:     safeFilename,
      source:       'CSV',
      totalRecords: rows.length,
    });
  } catch (err) {
    console.error('[Import Start] startPipeline failed:', err.message);
    importId = null;
  }

  // ── Validate every row ──────────────────────────────────────────────────────
  const validRows    = [];
  const rejectedRows = [];

  for (let i = 0; i < rows.length; i++) {
    const record            = mapRowToRecord(rows[i]);
    const { valid, errors } = validateCsvRecord(record);

    if (valid) {
      validRows.push(record);
    } else {
      rejectedRows.push({
        csv_row:  i + 2,
        crime_id: rows[i].crime_id || `(row ${i + 2})`,
        errors,
      });
    }
  }

  console.log(`[Import Start] Validation — valid: ${validRows.length}, rejected: ${rejectedRows.length}`);

  // ── Optional duplicate filtering ────────────────────────────────────────────
  let rowsToInsert        = validRows;
  const skippedDuplicates = [];

  if (skip_duplicates && validRows.length > 0) {
    const filtered = [];
    for (const record of validRows) {
      try {
        const existing = await crimeRepository.findByCrimeId(req, record.crime_id);
        if (existing) {
          skippedDuplicates.push(record.crime_id);
        } else {
          filtered.push(record);
        }
      } catch (err) {
        console.warn(`[Import Start] findByCrimeId failed for "${record.crime_id}":`, err.message);
        filtered.push(record); // include on error to avoid silent data loss
      }
    }
    rowsToInsert = filtered;
    console.log(`[Import Start] Duplicates skipped: ${skippedDuplicates.length}`);
  }

  // ── Log validation stage ────────────────────────────────────────────────────
  if (importId) {
    await pipelineService.logStage(
      req, importId, 'VALIDATION',
      rejectedRows.length > 0 ? 'failed' : 'success',
      `Valid: ${validRows.length}, Rejected: ${rejectedRows.length}, Skipped duplicates: ${skippedDuplicates.length}.`,
      rows.length
    );
  }

  // ── Bulk insert ─────────────────────────────────────────────────────────────
  let insertResult = { inserted: 0, failed: 0, errors: [] };

  if (rowsToInsert.length > 0) {
    if (importId) {
      await pipelineService.logStage(
        req, importId, 'INSERT', 'started',
        `Bulk inserting ${rowsToInsert.length} records in batches of 200.`,
        rowsToInsert.length
      );
    }

    try {
      insertResult = await crimeRepository.insertMany(req, rowsToInsert, importedBy);
    } catch (err) {
      console.error('[Import Start] insertMany failed:', err.message);
      insertResult = { inserted: 0, failed: rowsToInsert.length, errors: [err.message] };
    }

    console.log(`[Import Start] Insert — inserted: ${insertResult.inserted}, failed: ${insertResult.failed}`);

    if (importId) {
      await pipelineService.logStage(
        req, importId, 'INSERT',
        insertResult.failed > 0 ? 'failed' : 'success',
        `Inserted: ${insertResult.inserted}, Failed: ${insertResult.failed}.`,
        insertResult.inserted
      );
    }
  } else {
    console.warn('[Import Start] No rows to insert (all rejected or all duplicates).');
    if (importId) {
      await pipelineService.logStage(
        req, importId, 'INSERT', 'failed',
        `No rows to insert. Valid: ${validRows.length}, Skipped: ${skippedDuplicates.length}, Rejected: ${rejectedRows.length}.`,
        0
      );
    }
  }

  // ── Finalise pipeline ───────────────────────────────────────────────────────
  const totalFailed = rejectedRows.length + insertResult.failed;
  if (importId) {
    if (insertResult.inserted === 0) {
      await pipelineService.failPipeline(
        req, importId,
        `No records inserted. Rejected: ${rejectedRows.length}, Insert failed: ${insertResult.failed}, Skipped: ${skippedDuplicates.length}.`,
        0, totalFailed
      );
    } else {
      await pipelineService.completePipeline(req, importId, insertResult.inserted, totalFailed);
    }
  }

  // ── Clean up staging file (non-blocking — must not crash the response) ───────
  filestoreService.deleteFile(req, folder_id, file_id).catch(err => {
    console.warn(`[Import Start] Failed to delete staging file ${file_id}:`, err.message);
  });

  // ── Respond immediately — DBSCAN runs in background ─────────────────────────
  const httpStatus = insertResult.inserted === 0 ? 422 : 201;

  res.status(httpStatus).json({
    success:       insertResult.inserted > 0,
    message:       `Import complete. Inserted: ${insertResult.inserted}/${rows.length} records.` + (insertResult.inserted > 0 ? ' Hotspot clustering queued.' : ''),
    summary: {
      total:              rows.length,
      valid:              validRows.length,
      inserted:           insertResult.inserted,
      failed:             insertResult.failed,
      rejected:           rejectedRows.length,
      skipped_duplicates: skippedDuplicates.length,
    },
    rejected_rows:      rejectedRows.slice(0, 100),
    insert_errors:      insertResult.errors,
    skipped_duplicates: skippedDuplicates.slice(0, 100),
    dbscan_status:      insertResult.inserted > 0 ? 'queued' : 'skipped',
  });

  // ── Run DBSCAN clustering in background after response is sent ───────────────
  if (insertResult.inserted > 0) {
    setImmediate(async () => {
      const { getCatalystDatetime } = require('../utils/dateUtils');
      const { addRows: addBulkRows } = require('../services/catalystService');
      const tmpPath = path.join(__dirname, '..', 'data', `_dbscan_tmp_${Date.now()}.csv`);
      try {
        const csvHeader = 'crime_id,crime_type,latitude,longitude,District,incident_date,severity,status\n';
        const csvBody   = rowsToInsert.map(r =>
          [r.crime_id, r.crime_type, r.latitude, r.longitude,
           r.district, r.incident_date || '', r.severity || 1, r.status || 'raw'].join(',')
        ).join('\n');
        fs.writeFileSync(tmpPath, csvHeader + csvBody, 'utf8');

        console.log(`[DBSCAN BG] Running DBSCAN on ${rowsToInsert.length} records from uploaded CSV…`);
        const result = await DbscanRunner.run(tmpPath);
        console.log(`[DBSCAN BG] Done. clusters=${result.metrics.total_clusters}, noise=${result.metrics.noise_points}`);

        const now = getCatalystDatetime();
        const clusterRows = (result.clusters || [])
          .filter(c => c.cluster_label !== -1)
          .map(c => {
            const rec = rowsToInsert.find(r => String(r.crime_id) === String(c.crime_id)) || {};
            return {
              crime_id:     String(c.crime_id),
              cluster_id:   parseInt(c.cluster_label, 10),
              latitude:     parseFloat(rec.latitude)  || 0,
              longitude:    parseFloat(rec.longitude) || 0,
              crime_type:   String(rec.crime_type || ''),
              district:     String(rec.district   || ''),
              generated_at: now,
            };
          });

        const BATCH = 200;
        for (let i = 0; i < clusterRows.length; i += BATCH) {
          try {
            await addBulkRows(req, 'crime_clusters', clusterRows.slice(i, i + BATCH));
          } catch (e) {
            console.error(`[DBSCAN BG] crime_clusters batch ${Math.floor(i/BATCH)+1} failed:`, e.message);
          }
        }
        if (clusterRows.length) console.log(`[DBSCAN BG] Saved ${clusterRows.length} rows → crime_clusters.`);

        const hotspotRows = (result.hotspots || []).map(h => {
          const dominantCrime = Object.entries(h.crime_types || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
          const parts = (h.date_range || '').split(' to ');
          return {
            hotspot_id:         `HS-${h.cluster_id}-${Date.now()}`,
            cluster_id:         String(h.cluster_id),
            centroid_latitude:  parseFloat(h.centroid_latitude)  || 0,
            centroid_longitude: parseFloat(h.centroid_longitude) || 0,
            crime_count:        parseInt(h.crime_count, 10)       || 0,
            dominant_crime:     String(dominantCrime).substring(0, 100),
            start_date:         parts[0] ? getCatalystDatetime(parts[0]) : now,
            end_date:           parts[1] ? getCatalystDatetime(parts[1]) : now,
            generated_at:       now,
          };
        });
        for (let i = 0; i < hotspotRows.length; i += BATCH) {
          try {
            await addBulkRows(req, 'crime_hotspots', hotspotRows.slice(i, i + BATCH));
          } catch (e) {
            console.error(`[DBSCAN BG] crime_hotspots batch ${Math.floor(i/BATCH)+1} failed:`, e.message);
          }
        }
        if (hotspotRows.length) console.log(`[DBSCAN BG] Saved ${hotspotRows.length} rows → crime_hotspots.`);

      } catch (err) {
        console.error('[DBSCAN BG] Fatal error:', err.message);
      } finally {
        try { fs.unlinkSync(tmpPath); } catch (_) {}
      }
    });
  }
}));


// ─────────────────────────────────────────────────────────────────────────────
// Global error handler for this router
// ─────────────────────────────────────────────────────────────────────────────

router.use((err, req, res, _next) => {
  const status  = err.status || 500;
  const message = err.message || 'Internal server error.';
  console.error(`[Import Route Error] ${status} — ${message}`);
  return res.status(status).json({ success: false, error: message });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/import/health
// ─────────────────────────────────────────────────────────────────────────────

router.get('/health', (req, res) => {
  res.json({
    success:           true,
    routes:            ['/upload', '/validate', '/start', '/crimes'],
    filestoreFolderId: process.env.CATALYST_CSV_FOLDER_ID || '(not set)',
    timestamp:         new Date().toISOString(),
  });
});

module.exports = router;

'use strict';

const express = require('express');
const router  = express.Router();

const { authenticateToken }    = require('../middleware/auth');
const { requireRole }          = require('../middleware/roleMiddleware');
const { validateCrimeRecord }  = require('../services/validationService');
const crimeRepository          = require('../repositories/crimeRepository');
const pipelineService          = require('../services/pipelineService');

/**
 * Wrap async route handlers so unhandled promise rejections are passed to next().
 */
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ─── CSV Parsing Helpers ─────────────────────────────────────────────────────
//
// Pure Node.js — zero external packages.
// Uses the same char-by-char quoted-field approach as server/utils/seedDatabase.js.

/**
 * Parse a single CSV line into an array of trimmed string values.
 * Correctly handles double-quoted fields that contain commas or newlines.
 *
 * @param {string} line
 * @returns {string[]}
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

/**
 * Parse a full CSV string into an array of plain objects keyed by header names.
 *
 * Rules:
 *   - UTF-8 BOM is stripped automatically.
 *   - First non-empty line is the header row (lowercased + trimmed).
 *   - Blank lines are skipped.
 *   - Values are raw strings — type coercion happens in mapRowToRecord().
 *
 * @param {string} csvText
 * @returns {{ headers: string[], rows: Object[] }}
 */
function parseCSV(csvText) {
  const text     = (csvText || '').replace(/^\uFEFF/, ''); // strip BOM
  const lines    = text.split('\n');
  const nonEmpty = lines.filter(l => l.replace(/\r/g, '').trim().length > 0);

  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = parseCSVLine(nonEmpty[0]).map(h => h.toLowerCase().trim());
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

/**
 * Map a raw CSV row (all string values) to a typed crime record object.
 *
 * Type coercions match the verified Catalyst crime_raw schema:
 *   latitude   → double  (parseFloat — sent as Number to Catalyst)
 *   longitude  → double  (parseFloat — sent as Number to Catalyst)
 *   severity   → int     (parseInt   — sent as Number to Catalyst)
 *   All others → string
 *
 * incident_date defaults to today (YYYY-MM-DD) if the CSV column is absent or empty.
 *
 * @param {Object} rawRow - Raw CSV row object (all values are strings)
 * @returns {Object} Typed crime record ready for validateCrimeRecord() and insertMany()
 */
function mapRowToRecord(rawRow) {
  return {
    crime_id:      (rawRow.crime_id      || '').trim(),
    crime_type:    (rawRow.crime_type    || '').trim(),
    latitude:      rawRow.latitude  !== '' ? parseFloat(rawRow.latitude)   : NaN,
    longitude:     rawRow.longitude !== '' ? parseFloat(rawRow.longitude)  : NaN,
    district:      (rawRow.district      || '').trim(),
    severity:      rawRow.severity  !== '' ? parseInt(rawRow.severity, 10) : NaN,
    incident_date: (rawRow.incident_date || '').trim() || new Date().toISOString().slice(0, 10),
    status:        (rawRow.status        || 'raw').trim(),
  };
}

// Required CSV column headers (matched after lowercasing the header row)
const REQUIRED_HEADERS = ['crime_id', 'crime_type', 'latitude', 'longitude', 'district', 'severity'];

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/import/crimes
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
// POST /api/import/csv
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   POST /api/import/csv
 * @access  ADMIN only
 * @desc    Receive a raw CSV file, validate every row, bulk-insert valid rows
 *          into crime_raw, write import_history, and log every stage to
 *          Pipeline_Logs. Returns a detailed per-batch summary.
 *
 * Request:
 *   Content-Type: text/csv
 *   Body: raw CSV text
 *
 *   Optional header:
 *     X-Filename: your_file.csv   (stored in import_history.filename)
 *
 *   Required CSV columns (case-insensitive):
 *     crime_id, crime_type, latitude, longitude, district, severity
 *
 *   Optional CSV columns:
 *     incident_date   (YYYY-MM-DD — defaults to today)
 *     status          (defaults to "raw")
 *
 *   Example CSV:
 *     crime_id,crime_type,latitude,longitude,district,severity,incident_date
 *     C-2023-001,Theft,12.9716,77.5946,Central,3,2023-06-01
 *     C-2023-002,Robbery,13.0068,77.5748,North,4,2023-06-02
 *
 * Success (201):
 *   {
 *     "success": true,
 *     "message": "CSV import complete. Inserted: 2/2.",
 *     "summary": {
 *       "total": 2, "valid": 2, "inserted": 2,
 *       "failed": 0, "rejected": 0
 *     },
 *     "rejected_rows":  [],   // rows that failed validation (capped at 100)
 *     "insert_errors":  []    // Catalyst errors from bulk insert batches
 *   }
 *
 * Partial success (201):
 *   Same shape, with rejected_rows and insert_errors populated.
 *
 * Error (400): { success: false, error: "..." }   — bad CSV or missing columns
 * Error (422): { success: false, ... }             — all rows rejected
 */
router.post('/csv', authenticateToken, requireRole('ADMIN'), asyncHandler(async (req, res) => {

  // ── Step 1: Extract raw CSV body ────────────────────────────────────────────
  // express.text() (registered in index.js) sets req.body to a string for
  // Content-Type: text/csv | text/plain requests.
  const csvText = typeof req.body === 'string' ? req.body : '';

  if (!csvText.trim()) {
    return res.status(400).json({
      success: false,
      error:   'Request body is empty. Send a CSV file with Content-Type: text/csv.',
    });
  }

  // ── Step 2: Parse CSV ───────────────────────────────────────────────────────
  const { headers, rows } = parseCSV(csvText);

  if (headers.length === 0 || rows.length === 0) {
    return res.status(400).json({
      success: false,
      error:   'CSV has no data rows. Ensure the file has a header row followed by at least one data row.',
    });
  }

  // ── Step 3: Validate required headers ──────────────────────────────────────
  const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missingHeaders.length > 0) {
    return res.status(400).json({
      success: false,
      error:   `CSV is missing required columns: ${missingHeaders.join(', ')}`,
      hint:    `Required headers: ${REQUIRED_HEADERS.join(', ')}`,
    });
  }

  const importedBy = (req.user && req.user.id) ? req.user.id : 'system';
  const filename   = (req.headers['x-filename'] || 'upload.csv').substring(0, 500);

  console.log(`[Import CSV] Received ${rows.length} rows from "${filename}" by ${importedBy}`);

  // ── Step 4: Start pipeline ──────────────────────────────────────────────────
  let importId;
  try {
    importId = await pipelineService.startPipeline(req, {
      filename,
      source:       'CSV',
      totalRecords: rows.length,
    });
  } catch (pipelineErr) {
    console.error('[Import CSV] pipelineService.startPipeline failed:', pipelineErr.message);
    importId = null;
  }

  // ── Step 5: Validate each row ───────────────────────────────────────────────
  const validRows    = [];  // records that passed validateCrimeRecord()
  const rejectedRows = [];  // { csvRow, crime_id, errors } for rows that failed

  for (let i = 0; i < rows.length; i++) {
    const record    = mapRowToRecord(rows[i]);
    const { valid, errors } = validateCrimeRecord(record);

    if (valid) {
      validRows.push(record);
    } else {
      rejectedRows.push({
        csv_row:  i + 2,  // +2: 1-indexed + header row
        crime_id: rows[i].crime_id || `(row ${i + 2})`,
        errors,
      });
    }
  }

  console.log(`[Import CSV] Validation — valid: ${validRows.length}, rejected: ${rejectedRows.length}`);

  if (importId) {
    await pipelineService.logStage(
      req, importId, 'VALIDATION',
      rejectedRows.length > 0 ? 'failed' : 'success',
      `Validated ${rows.length} rows. Valid: ${validRows.length}, Rejected: ${rejectedRows.length}.`,
      rows.length
    );
  }

  // ── Step 6: Bulk insert valid rows ─────────────────────────────────────────
  let insertResult = { inserted: 0, failed: 0, errors: [] };

  if (validRows.length > 0) {
    if (importId) {
      await pipelineService.logStage(
        req, importId, 'INSERT', 'started',
        `Bulk inserting ${validRows.length} valid records in batches of 200.`,
        validRows.length
      );
    }

    try {
      insertResult = await crimeRepository.insertMany(req, validRows, importedBy);
    } catch (bulkErr) {
      // insertMany() already logs full error internally
      console.error('[Import CSV] crimeRepository.insertMany threw:', bulkErr.message);
      insertResult = { inserted: 0, failed: validRows.length, errors: [bulkErr.message] };
    }

    console.log(`[Import CSV] Insert — inserted: ${insertResult.inserted}, failed: ${insertResult.failed}`);

    if (importId) {
      await pipelineService.logStage(
        req, importId, 'INSERT',
        insertResult.failed > 0 ? 'failed' : 'success',
        `Bulk insert complete. Inserted: ${insertResult.inserted}, Failed: ${insertResult.failed}.`,
        insertResult.inserted
      );
    }
  } else {
    console.warn('[Import CSV] No valid rows to insert after validation.');
    if (importId) {
      await pipelineService.logStage(
        req, importId, 'INSERT', 'failed',
        'No valid rows to insert — all rows failed validation.',
        0
      );
    }
  }

  // ── Step 7: Finalise pipeline ───────────────────────────────────────────────
  const totalFailed = rejectedRows.length + insertResult.failed;

  if (importId) {
    if (insertResult.inserted === 0) {
      await pipelineService.failPipeline(
        req, importId,
        `No records were inserted. Rejected: ${rejectedRows.length}, Insert failed: ${insertResult.failed}.`,
        0, totalFailed
      );
    } else {
      await pipelineService.completePipeline(req, importId, insertResult.inserted, totalFailed);
    }
  }

  // ── Step 8: Build and return summary ───────────────────────────────────────
  const allInserted = insertResult.inserted === rows.length;
  const noneInserted = insertResult.inserted === 0;

  const httpStatus = noneInserted ? 422 : 201;

  return res.status(httpStatus).json({
    success:        insertResult.inserted > 0,
    message:        `CSV import complete. Inserted: ${insertResult.inserted}/${rows.length} records.`,
    summary: {
      total:    rows.length,
      valid:    validRows.length,
      inserted: insertResult.inserted,
      failed:   insertResult.failed,
      rejected: rejectedRows.length,
    },
    rejected_rows:  rejectedRows.slice(0, 100),   // cap at 100 to avoid huge payloads
    insert_errors:  insertResult.errors,
  });

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

module.exports = router;

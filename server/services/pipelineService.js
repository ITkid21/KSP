'use strict';

/**
 * KSP Crime Intelligence Platform — Pipeline Service
 * ───────────────────────────────────────────────────
 * Manages the lifecycle of a data ingestion pipeline run.
 * Every import goes through: start → logStage(s) → complete / fail
 *
 * Writes to two Catalyst Data Store tables:
 *
 * import_history — one row per import batch
 *   ROWID         BIGINT   (auto)
 *   id            TEXT     (UUID v4, our PK)
 *   filename      TEXT     (original filename or "JSON_SINGLE")
 *   source        TEXT     ("CSV" | "JSON" | "API")
 *   total_records TEXT     (number as string)
 *   inserted      TEXT     (successfully inserted count)
 *   failed        TEXT     (failed count)
 *   status        TEXT     ("pending" | "complete" | "failed")
 *   imported_by   TEXT     (user UUID from req.user.id)
 *   error_message TEXT     (populated on failPipeline)
 *   created_at    TEXT     (YYYY-MM-DD HH:mm:ss)
 *   completed_at  TEXT     (YYYY-MM-DD HH:mm:ss, nullable)
 *
 * Pipeline_Logs — one or more rows per import batch (one per stage)
 *   ROWID              BIGINT   (auto, Catalyst PK)
 *   pipeline_name      TEXT     (stage name: "START" | "VALIDATION" | "INSERT" | "COMPLETE" | "FAILED")
 *   records_processed  INT      (count of records at this stage)
 *   (+ any additional columns present in the Catalyst table)
 *
 * NOTE: Table name is "Pipeline_Logs" (exact casing as created in Catalyst console).
 * NOTE: import_history table name is "import_history" (lowercase as visible in Catalyst).
 */

const { insertRow, executeQuery } = require('./catalystService');
const { getCatalystDatetime }     = require('../utils/dateUtils');
const { v4: uuidv4 }             = require('uuid');

const IMPORT_TABLE   = 'import_history';
const PIPELINE_TABLE = 'Pipeline_Logs';

// ─── Private Helpers ────────────────────────────────────────────────────────

function esc(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/'/g, "''");
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Start a new pipeline run.
 * Creates the import_history row with status "pending" and logs a "started" stage.
 *
 * @param {Object} req
 * @param {Object} options
 * @param {string} options.filename     - Original filename or "JSON_SINGLE"
 * @param {string} options.source       - "CSV" | "JSON" | "API"
 * @param {number} options.totalRecords - Total records submitted
 * @returns {Promise<string>} importId  - UUID to pass to all subsequent calls
 */
async function startPipeline(req, { filename = 'JSON_SINGLE', source = 'JSON', totalRecords = 1 } = {}) {
  const importId = uuidv4();
  const now      = getCatalystDatetime();
  const userId   = (req.user && req.user.id) ? req.user.id : 'system';

  // 1. Create import_history row
  await insertRow(req, IMPORT_TABLE, {
    id:            importId,
    filename:      filename.substring(0, 500),   // Guard column length
    source:        source,
    total_records: String(totalRecords),
    inserted:      '0',
    failed:        '0',
    status:        'pending',
    imported_by:   userId,
    error_message: '',
    created_at:    now,
    completed_at:  '',
  });

  // 2. Log the START stage (non-blocking — must not crash the pipeline)
  await _safeLogStage(req, importId, 'START', 'started', `Pipeline started. Source: ${source}. Total records: ${totalRecords}.`, totalRecords);

  console.log(`[PipelineService] Started pipeline ${importId} (source: ${source}, total: ${totalRecords})`);
  return importId;
}

/**
 * Log a pipeline stage event to pipeline_logs.
 * Safe to call at any point; logs a non-blocking warning on failure.
 *
 * @param {Object} req
 * @param {string} importId    - UUID from startPipeline()
 * @param {string} stage       - Stage name e.g. "VALIDATION", "INSERT"
 * @param {string} status      - "started" | "success" | "failed"
 * @param {string} message     - Human-readable description
 * @param {number} [recordCount] - Optional count of records processed at this stage
 * @returns {Promise<void>}
 */
async function logStage(req, importId, stage, status, message, recordCount = 0) {
  return _safeLogStage(req, importId, stage, status, message, recordCount);
}

/**
 * Mark a pipeline run as successfully complete.
 * Updates import_history with final counts and status "complete".
 *
 * @param {Object} req
 * @param {string} importId   - UUID from startPipeline()
 * @param {number} inserted   - Records successfully inserted
 * @param {number} failed     - Records that failed validation or insert
 * @returns {Promise<void>}
 */
async function completePipeline(req, importId, inserted = 0, failed = 0) {
  const now = getCatalystDatetime();

  try {
    await executeQuery(
      req,
      `UPDATE ${IMPORT_TABLE} SET ` +
        `status = 'complete', ` +
        `inserted = '${inserted}', ` +
        `failed = '${failed}', ` +
        `completed_at = '${now}' ` +
      `WHERE id = '${esc(importId)}'`
    );
  } catch (err) {
    // Log the warning but don't crash the response — the crime data is already saved
    console.error(`[PipelineService] Failed to mark import ${importId} complete:`, err.message);
  }

  await _safeLogStage(
    req, importId, 'COMPLETE', 'success',
    `Pipeline complete. Inserted: ${inserted}, Failed: ${failed}.`,
    inserted + failed
  );

  console.log(`[PipelineService] Completed pipeline ${importId} — inserted: ${inserted}, failed: ${failed}`);
}

/**
 * Mark a pipeline run as failed.
 * Updates import_history with status "failed" and records the error message.
 *
 * @param {Object} req
 * @param {string} importId     - UUID from startPipeline()
 * @param {string} errorMessage - Reason for failure
 * @param {number} [inserted]   - Partial insert count, if any
 * @param {number} [failed]     - Failed count, if known
 * @returns {Promise<void>}
 */
async function failPipeline(req, importId, errorMessage, inserted = 0, failed = 0) {
  const now     = getCatalystDatetime();
  const safeMsg = String(errorMessage || 'Unknown error').substring(0, 1000);

  try {
    await executeQuery(
      req,
      `UPDATE ${IMPORT_TABLE} SET ` +
        `status = 'failed', ` +
        `inserted = '${inserted}', ` +
        `failed = '${failed}', ` +
        `error_message = '${esc(safeMsg)}', ` +
        `completed_at = '${now}' ` +
      `WHERE id = '${esc(importId)}'`
    );
  } catch (err) {
    console.error(`[PipelineService] Failed to mark import ${importId} as failed:`, err.message);
  }

  await _safeLogStage(
    req, importId, 'FAILED', 'failed',
    `Pipeline failed: ${safeMsg}`,
    inserted + failed
  );

  console.error(`[PipelineService] Failed pipeline ${importId}: ${safeMsg}`);
}

// ─── Private Helpers ────────────────────────────────────────────────────────

/**
 * Insert a single pipeline_logs row without throwing.
 * Audit-style: pipeline logs must not crash the primary request.
 */
async function _safeLogStage(req, importId, stage, status, message, recordCount = 0) {
  try {
    // Column names mapped to the actual Catalyst Pipeline_Logs schema.
    // pipeline_name      → stage identifier (e.g. "START", "VALIDATION", "INSERT")
    // records_processed  → int count of records at this stage
    await insertRow(req, PIPELINE_TABLE, {
      pipeline_name:     String(stage).substring(0, 255),
      records_processed: Number(recordCount) || 0,
    });
  } catch (err) {
    // Non-fatal — warn only; pipeline logs must not crash the primary request
    console.warn(`[PipelineService] Failed to write pipeline log (stage: ${stage}):`, err.message);
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  startPipeline,
  logStage,
  completePipeline,
  failPipeline,
};

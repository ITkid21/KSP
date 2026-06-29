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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/import/crimes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   POST /api/import/crimes
 * @access  ADMIN only
 * @desc    Validate a single crime record, insert into crime_raw,
 *          write import_history, and log to Pipeline_Logs.
 *
 * Request body (JSON):
 *   {
 *     "crime_id":      "C-2023-001",        required, unique
 *     "crime_type":    "Theft",             required
 *     "latitude":      12.9716,             required, number
 *     "longitude":     77.5946,             required, number
 *     "severity":      3,                   required, integer 1-5
 *     "district":      "Central",           required
 *     "incident_date": "2023-06-01"         optional — defaults to today
 *     "status":        "raw"               optional — defaults to "raw"
 *   }
 *
 * Success response (201):
 *   { success: true, message: "...", data: { ...record } }
 *
 * Error response (400 — validation):
 *   { success: false, errors: [...] }
 *
 * Error response (500 — insert failure):
 *   { success: false, error: "..." }
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

  // ── Step 2: Enrich record with defaults before inserting ────────────────────
  //    incident_date: use today if caller did not supply one
  //    imported_by:   always use the authenticated user's ID
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
    // Non-blocking — pipeline tracking must never prevent the actual insert
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
    // Full error already logged inside crimeRepository.insertCrime()
    // Here we log the context and return a 500 without exposing stack trace
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
// Global error handler for this router
// ─────────────────────────────────────────────────────────────────────────────

router.use((err, req, res, _next) => {
  const status  = err.status || 500;
  const message = err.message || 'Internal server error.';
  console.error(`[Import Route Error] ${status} — ${message}`);
  return res.status(status).json({ success: false, error: message });
});

module.exports = router;

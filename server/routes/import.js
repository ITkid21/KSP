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
 *     "crime_id":   "C-2023-001",
 *     "crime_type": "Theft",
 *     "latitude":   12.9716,
 *     "longitude":  77.5946,
 *     "severity":   3,
 *     "district":   "Central"
 *   }
 *
 * Success response:
 *   { success: true, message: "...", import_id: "uuid", data: { ...record } }
 *
 * Error response (validation):
 *   { success: false, errors: [...] }
 */
router.post('/crimes', authenticateToken, requireRole('ADMIN'), asyncHandler(async (req, res) => {

  // ── Step 1: Validate ───────────────────────────────────────────────────────
  const validationResult = validateCrimeRecord(req.body);

  if (!validationResult.valid) {
    return res.status(400).json({
      success: false,
      errors:  validationResult.errors
    });
  }

  // ── Step 2: Start pipeline ─────────────────────────────────────────────────
  let importId;
  try {
    importId = await pipelineService.startPipeline(req, {
      filename:     'JSON_SINGLE',
      source:       'JSON',
      totalRecords: 1,
    });
  } catch (pipelineErr) {
    // Pipeline start failure is non-blocking — we still proceed with the insert
    console.error('[Import] pipelineService.startPipeline failed:', pipelineErr.message);
    importId = null;
  }

  // ── Step 3: Log validation success ────────────────────────────────────────
  if (importId) {
    await pipelineService.logStage(req, importId, 'VALIDATION', 'success', 'Record passed validation.', 1);
  }

  // ── Step 4: Insert into crime_raw ─────────────────────────────────────────
  let insertedRow;
  try {
    insertedRow = await crimeRepository.insertCrime(req, req.body, importId || '');
  } catch (insertErr) {
    console.error('[Import] crimeRepository.insertCrime failed:', insertErr.message);

    // Mark pipeline as failed
    if (importId) {
      await pipelineService.failPipeline(req, importId, insertErr.message, 0, 1);
    }

    return res.status(500).json({
      success: false,
      error:   'Failed to save crime record. Please try again.',
    });
  }

  // ── Step 5: Log insert success ────────────────────────────────────────────
  if (importId) {
    await pipelineService.logStage(req, importId, 'INSERT', 'success', `Inserted crime_id: ${req.body.crime_id}`, 1);
  }

  // ── Step 6: Complete pipeline ─────────────────────────────────────────────
  if (importId) {
    await pipelineService.completePipeline(req, importId, 1, 0);
  }

  // ── Step 7: Respond ───────────────────────────────────────────────────────
  return res.status(201).json({
    success:   true,
    message:   'Crime record imported and saved successfully.',
    import_id: importId || null,
    data:      req.body,
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

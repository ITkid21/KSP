'use strict';

/**
 * KSP Crime Intelligence Platform — Crime Repository
 * ──────────────────────────────────────────────────
 * Provides CRUD operations against the Catalyst Data Store `crime_raw` table.
 *
 * Catalyst Data Store — crime_raw table schema:
 *   ROWID         BIGINT  (auto, Catalyst PK)
 *   id            TEXT    (UUID v4, our application PK)
 *   crime_id      TEXT    (user-supplied, e.g. "C-2023-001")
 *   crime_type    TEXT    (Theft | Robbery | Assault | Fraud | Burglary)
 *   latitude      TEXT    (stored as string; cast to float at read time)
 *   longitude     TEXT    (stored as string; cast to float at read time)
 *   severity      TEXT    (1–5, stored as string)
 *   district      TEXT
 *   import_id     TEXT    (UUID of parent import_history row)
 *   status        TEXT    (default: "raw")
 *   created_at    TEXT    (YYYY-MM-DD HH:mm:ss)
 */

const { executeQuery, insertRow, addRows } = require('../services/catalystService');
const { getCatalystDatetime }              = require('../utils/dateUtils');
const { v4: uuidv4 }                      = require('uuid');

const TABLE = 'crime_raw';

// ─── ZCQL result unwrapper ──────────────────────────────────────────────────

/**
 * Unwrap ZCQL result rows for the crime_raw table.
 * Catalyst wraps each row as { crime_raw: { ...columns } }.
 */
function unwrap(results) {
  if (!results || !Array.isArray(results)) return [];
  return results.map(row => row[TABLE] || row);
}

/**
 * Escape single quotes in strings for safe ZCQL embedding.
 */
function esc(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/'/g, "''");
}

/**
 * Build a canonical row object for the crime_raw table.
 * Converts all numeric fields to strings for Catalyst TEXT columns.
 *
 * @param {Object} record   - Validated crime record
 * @param {string} importId - UUID of the parent import_history row
 * @returns {Object} Row-ready object
 */
function buildRow(record, importId) {
  return {
    id:         uuidv4(),
    crime_id:   record.crime_id.trim(),
    crime_type: record.crime_type,
    latitude:   String(record.latitude),
    longitude:  String(record.longitude),
    severity:   String(record.severity),
    district:   record.district.trim(),
    import_id:  importId || '',
    status:     'raw',
    created_at: getCatalystDatetime(),
  };
}

// ─── Repository Class ───────────────────────────────────────────────────────

class CrimeRepository {

  /**
   * Insert a single validated crime record into crime_raw.
   *
   * @param {Object} req    - Express request (Catalyst context)
   * @param {Object} record - Validated crime record
   * @param {string} [importId] - UUID of the parent import_history row
   * @returns {Promise<Object>} Catalyst insert result
   */
  async insertCrime(req, record, importId = '') {
    const rowData = buildRow(record, importId);
    return await insertRow(req, TABLE, rowData);
  }

  /**
   * Bulk-insert multiple validated crime records into crime_raw.
   * Chunks rows into batches of 200 to stay within Catalyst API limits
   * and avoid memory pressure on large CSV uploads.
   *
   * @param {Object}   req      - Express request (Catalyst context)
   * @param {Array}    records  - Array of validated crime record objects
   * @param {string}   [importId] - UUID of the parent import_history row
   * @returns {Promise<{ inserted: number, failed: number, errors: string[] }>}
   */
  async insertMany(req, records, importId = '') {
    const BATCH_SIZE = 200;
    let inserted = 0;
    let failed   = 0;
    const errors = [];

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch    = records.slice(i, i + BATCH_SIZE);
      const rowBatch = batch.map(r => buildRow(r, importId));

      try {
        await addRows(req, TABLE, rowBatch);
        inserted += batch.length;
      } catch (err) {
        failed += batch.length;
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`);
        console.error(`[CrimeRepository] Batch insert failed (offset ${i}):`, err.message);
      }
    }

    return { inserted, failed, errors };
  }

  /**
   * Find a crime record by the application-level crime_id.
   * Returns null if not found.
   *
   * @param {Object} req      - Express request
   * @param {string} crimeId  - User-supplied crime_id (e.g. "C-2023-001")
   * @returns {Promise<Object|null>}
   */
  async findByCrimeId(req, crimeId) {
    const results = await executeQuery(
      req,
      `SELECT * FROM ${TABLE} WHERE crime_id = '${esc(crimeId)}'`
    );
    const rows = unwrap(results);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Return all records from crime_raw.
   * Use with caution in production — prefer paginated queries for large tables.
   *
   * @param {Object} req - Express request
   * @returns {Promise<Array>}
   */
  async findAll(req) {
    const results = await executeQuery(req, `SELECT * FROM ${TABLE}`);
    return unwrap(results);
  }

  /**
   * Delete all crime_raw records associated with a specific import batch.
   * Used for rollback of a failed or unwanted import.
   *
   * @param {Object} req      - Express request
   * @param {string} importId - UUID of the import_history row to roll back
   * @returns {Promise<Object>} ZCQL DELETE result
   */
  async deleteImport(req, importId) {
    return await executeQuery(
      req,
      `DELETE FROM ${TABLE} WHERE import_id = '${esc(importId)}'`
    );
  }
}

module.exports = new CrimeRepository();

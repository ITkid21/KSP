'use strict';

/**
 * KSP Crime Intelligence Platform — Crime Repository
 * ──────────────────────────────────────────────────
 * Provides CRUD operations against the Catalyst Data Store `crime_raw` table.
 *
 * Catalyst Data Store — crime_raw VERIFIED SCHEMA (fetched 2026-06-29):
 *
 *   Column         DataType      Mandatory  Notes
 *   ─────────────────────────────────────────────────────────────────
 *   ROWID          bigint        auto       Catalyst system PK
 *   CREATORID      bigint        auto       Catalyst system
 *   CREATEDTIME    datetime      auto       Catalyst system
 *   MODIFIEDTIME   datetime      auto       Catalyst system
 *   crime_id       varchar(255)  YES        Unique, user-supplied
 *   crime_type     varchar(255)  YES
 *   latitude       double        YES        Send as Number (float)
 *   longitude      double        YES        Send as Number (float)
 *   district       varchar(100)  YES
 *   severity       int           YES        Send as Number (integer)
 *   status         varchar(200)  no         default: "raw"
 *   imported_at    datetime      YES        getCatalystDatetime() format
 *   incident_date  datetime      no         getCatalystDatetime() or today
 *   imported_by    varchar(100)  no         user UUID or "system"
 *
 * NEVER send: id, import_id, created_at — these columns do not exist.
 */

const { executeQuery, insertRow, addRows } = require('../services/catalystService');
const { getCatalystDatetime }              = require('../utils/dateUtils');

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
 *
 * TYPE RULES (from verified Catalyst schema):
 *   latitude, longitude → double  → parseFloat()  (must be Number)
 *   severity            → int     → parseInt()    (must be Number)
 *   crime_id, crime_type, district, status, imported_by → varchar → String
 *   imported_at, incident_date → datetime → getCatalystDatetime() formatted string
 *
 * @param {Object} record     - Validated crime record from the request body
 * @param {string} importedBy - User UUID (req.user.id) or "system"
 * @returns {Object} Row-ready object matching ONLY the Catalyst crime_raw columns
 */
function buildRow(record, importedBy) {
  // Resolve incident_date: use record value if provided, otherwise today
  let incidentDate;
  if (record.incident_date) {
    const parsed = getCatalystDatetime(record.incident_date);
    incidentDate = parsed || getCatalystDatetime(); // fallback to today if unparseable
  } else {
    incidentDate = getCatalystDatetime();
  }

  return {
    crime_id:      String(record.crime_id).trim(),
    crime_type:    String(record.crime_type),
    latitude:      parseFloat(record.latitude),        // double — must be Number
    longitude:     parseFloat(record.longitude),       // double — must be Number
    district:      String(record.district).trim(),
    severity:      parseInt(record.severity, 10),      // int — must be Number
    status:        record.status || 'raw',
    imported_at:   getCatalystDatetime(),               // datetime — mandatory
    incident_date: incidentDate,                        // datetime — optional, default today
    imported_by:   String(importedBy || 'system').substring(0, 100),
  };
}

// ─── Repository Class ───────────────────────────────────────────────────────

class CrimeRepository {

  /**
   * Insert a single validated crime record into crime_raw.
   *
   * @param {Object} req        - Express request (Catalyst context)
   * @param {Object} record     - Validated crime record
   * @param {string} importedBy - User UUID from req.user.id, or "system"
   * @returns {Promise<Object>} Catalyst insert result
   */
  async insertCrime(req, record, importedBy = 'system') {
    const rowData = buildRow(record, importedBy);

    console.log('========== crime_raw INSERT ==========');
    console.log(JSON.stringify(rowData, null, 2));

    let result;
    try {
      result = await insertRow(req, TABLE, rowData);
      console.log('========== INSERT SUCCESS ==========');
      console.log(result);
    } catch (err) {
      console.error('========== INSERT FAILED ==========');
      console.error(err);
      console.error(err.stack);
      throw err; // re-throw so the route handler can respond with 500
    }

    return result;
  }

  /**
   * Bulk-insert multiple validated crime records into crime_raw.
   * Chunks rows into batches of 200 to stay within Catalyst API limits.
   *
   * @param {Object} req        - Express request (Catalyst context)
   * @param {Array}  records    - Array of validated crime record objects
   * @param {string} importedBy - User UUID from req.user.id, or "system"
   * @returns {Promise<{ inserted: number, failed: number, errors: string[] }>}
   */
  async insertMany(req, records, importedBy = 'system') {
    const BATCH_SIZE = 200;
    let inserted = 0;
    let failed   = 0;
    const errors = [];

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch    = records.slice(i, i + BATCH_SIZE);
      const rowBatch = batch.map(r => buildRow(r, importedBy));

      console.log(`========== crime_raw BULK INSERT batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} rows) ==========`);
      console.log('Sample row:', JSON.stringify(rowBatch[0], null, 2));

      try {
        await addRows(req, TABLE, rowBatch);
        console.log(`========== BULK INSERT SUCCESS (batch ${Math.floor(i / BATCH_SIZE) + 1}) ==========`);
        inserted += batch.length;
      } catch (err) {
        console.error(`========== BULK INSERT FAILED (batch ${Math.floor(i / BATCH_SIZE) + 1}) ==========`);
        console.error(err);
        console.error(err.stack);
        failed += batch.length;
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`);
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
      `SELECT * FROM ${TABLE} WHERE crime_id = '${esc(String(crimeId))}'`
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
   * NOTE: deleteImport is not currently operational because crime_raw has
   * no import_id column. Retain for future schema evolution.
   * To roll back an import, filter by imported_by + imported_at range instead.
   *
   * @param {Object} req        - Express request
   * @param {string} importedBy - User UUID to filter on
   * @param {string} importedAt - Exact timestamp of the import batch
   */
  async deleteImport(req, importedBy, importedAt) {
    // Use imported_by + imported_at as a surrogate batch key
    return await executeQuery(
      req,
      `DELETE FROM ${TABLE} WHERE imported_by = '${esc(importedBy)}' AND imported_at = '${esc(importedAt)}'`
    );
  }
}

module.exports = new CrimeRepository();

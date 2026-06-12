'use strict';

const { executeQuery, insertRow } = require('../services/catalystService');
const { v4: uuidv4 } = require('uuid');

const TABLE = 'audit_logs';

function unwrap(results) {
  if (!results || !Array.isArray(results)) return [];
  return results.map(row => row[TABLE] || row);
}

function esc(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/'/g, "''");
}

class AuditRepository {

  /**
   * Insert an audit log entry.
   *
   * @param {Object}  req
   * @param {string}  userId     - UUID of the acting user
   * @param {string}  action     - e.g. 'LOGIN', 'USER_CREATE', 'CASE_UPDATE' …
   * @param {string}  resource   - table/resource name, e.g. 'auth', 'system_users'
   * @param {string}  details    - human-readable description
   * @param {Object}  [options]
   * @param {string}  [options.resource_id]  - ROWID/UUID of the affected record
   * @param {string}  [options.ip_address]
   * @param {string}  [options.created_at]   - override timestamp (ISO string)
   */
  async log(req, userId, action, resource, details, options = {}) {
    const rowData = {
      id:          uuidv4(),
      user_id:     userId || 'system',
      action:      action,
      resource:    resource,
      resource_id: options.resource_id || '',
      details:     details || '',
      ip_address:  options.ip_address || (req ? (req.ip || '::1') : '::1'),
      created_at:  options.created_at  || new Date().toISOString(),
    };

    try {
      return await insertRow(req, TABLE, rowData);
    } catch (err) {
      // Audit logging must not crash the primary request
      console.error('[AuditRepository] Failed to write audit log:', err.message);
      return null;
    }
  }

  /**
   * Get all audit logs, newest first.
   */
  async getAll(req) {
    const results = await executeQuery(req, `SELECT * FROM ${TABLE}`);
    return unwrap(results).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  /**
   * Get audit logs for a specific user.
   */
  async getByUserId(req, userId) {
    const results = await executeQuery(req, `SELECT * FROM ${TABLE} WHERE user_id = '${esc(userId)}'`);
    return unwrap(results).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  /**
   * Get audit logs filtered by action type (e.g. 'LOGIN', 'USER_CREATE').
   */
  async getByAction(req, action) {
    const results = await executeQuery(req, `SELECT * FROM ${TABLE} WHERE action = '${esc(action)}'`);
    return unwrap(results).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
}

module.exports = new AuditRepository();

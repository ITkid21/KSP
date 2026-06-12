'use strict';

const { executeQuery, insertRow } = require('../services/catalystService');

const TABLE = 'sessions';

function unwrap(results) {
  if (!results || !Array.isArray(results)) return [];
  return results.map(row => row[TABLE] || row);
}

function esc(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/'/g, "''");
}

class SessionRepository {

  /**
   * Persist a new session to Catalyst Data Store.
   * @param {Object} req
   * @param {Object} session
   * @param {string} session.id          - UUID
   * @param {string} session.user_id     - UUID of the user
   * @param {string} session.token       - JWT (max ~1800 chars safely)
   * @param {string} session.expires_at  - ISO datetime
   * @param {string} session.ip_address
   * @param {string} session.user_agent
   * @param {string} session.device_info
   * @param {string} session.created_at
   */
  async create(req, session) {
    const rowData = {
      id:          session.id,
      user_id:     session.user_id,
      token:       session.token,
      expires_at:  session.expires_at  || null,
      ip_address:  session.ip_address  || '',
      user_agent:  (session.user_agent || '').substring(0, 500),  // Guard column length
      device_info: (session.device_info || '').substring(0, 500),
      created_at:  session.created_at  || new Date().toISOString(),
    };
    return await insertRow(req, TABLE, rowData);
  }

  /**
   * Find a session by its JWT token.
   * Returns null if not found.
   */
  async findByToken(req, token) {
    // Token is long — escape only and rely on exact match
    const results = await executeQuery(req, `SELECT * FROM ${TABLE} WHERE token = '${esc(token)}'`);
    const rows = unwrap(results);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Find a session by token that has not yet expired.
   */
  async findActiveByToken(req, token) {
    const session = await this.findByToken(req, token);
    if (!session) return null;
    if (session.expires_at && new Date(session.expires_at) < new Date()) return null;
    return session;
  }

  /**
   * Delete all sessions belonging to a user (e.g. on password change / deactivation).
   */
  async deleteByUser(req, userId) {
    return await executeQuery(req, `DELETE FROM ${TABLE} WHERE user_id = '${esc(userId)}'`);
  }

  /**
   * Delete a specific session by token (used on logout).
   */
  async deleteByToken(req, token) {
    return await executeQuery(req, `DELETE FROM ${TABLE} WHERE token = '${esc(token)}'`);
  }
}

module.exports = new SessionRepository();

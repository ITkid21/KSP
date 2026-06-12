'use strict';

const { executeQuery, insertRow, updateRow } = require('../services/catalystService');

const TABLE = 'system_users';

// ─── ZCQL result unwrapper ─────────────────────────────────────────────────

/**
 * Unwrap ZCQL query results.
 * Catalyst wraps each row as { system_users: { ...columns } }
 */
function unwrap(results) {
  if (!results || !Array.isArray(results)) return [];
  return results.map(row => {
    const inner = row[TABLE];
    if (inner) {
      // Cast is_active from string/number to boolean
      if (inner.is_active !== undefined) {
        inner.is_active = inner.is_active === true || inner.is_active === 'true' || inner.is_active === 1;
      }
    }
    return inner || row;
  });
}

/**
 * Escape single quotes in strings for safe ZCQL embedding.
 */
function esc(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/'/g, "''");
}

// ─── Repository Class ──────────────────────────────────────────────────────

class UserRepository {

  /**
   * Create a new system_users row.
   * @param {Object} req - Express request (Catalyst context)
   * @param {Object} user - Full user object (all required columns)
   */
  async create(req, user) {
    const rowData = {
      id:            user.id,
      username:      user.username,
      email:         user.email,
      password_hash: user.password_hash,
      full_name:     user.full_name,
      role:          user.role || 'OFFICER',
      department:    user.department || '',
      badge_number:  user.badge_number || '',
      is_active:     user.is_active !== undefined ? user.is_active : true,
      created_at:    user.created_at || new Date().toISOString(),
      updated_at:    user.updated_at || new Date().toISOString(),
      last_login:    user.last_login || null,
    };
    return await insertRow(req, TABLE, rowData);
  }

  /**
   * Find a user by their custom UUID `id` column.
   */
  async findById(req, id) {
    const results = await executeQuery(req, `SELECT * FROM ${TABLE} WHERE id = '${esc(id)}'`);
    const rows = unwrap(results);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Find a user by `id` only if their account is active.
   */
  async findActiveById(req, id) {
    const results = await executeQuery(req, `SELECT * FROM ${TABLE} WHERE id = '${esc(id)}' AND is_active = true`);
    const rows = unwrap(results);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Find a user by username (case-sensitive ZCQL).
   */
  async findByUsername(req, username) {
    const results = await executeQuery(req, `SELECT * FROM ${TABLE} WHERE username = '${esc(username)}'`);
    const rows = unwrap(results);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Find a user by email.
   */
  async findByEmail(req, email) {
    const results = await executeQuery(req, `SELECT * FROM ${TABLE} WHERE email = '${esc(email)}'`);
    const rows = unwrap(results);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Return all users (omit password_hash at the service/route layer).
   */
  async getAll(req) {
    const results = await executeQuery(req, `SELECT * FROM ${TABLE}`);
    return unwrap(results);
  }

  /**
   * Update user fields using ZCQL UPDATE.
   * The `id` column is our custom UUID — we query by it.
   *
   * Supported updatable fields:
   *   username, email, password_hash, full_name, role,
   *   department, badge_number, is_active, last_login, updated_at
   *
   * @param {Object} req
   * @param {string} id - UUID of the user
   * @param {Object} updates - Key/value map of fields to update
   */
  async update(req, id, updates) {
    const UPDATABLE = [
      'username', 'email', 'password_hash', 'full_name', 'role',
      'department', 'badge_number', 'is_active', 'last_login', 'updated_at',
    ];

    const setClauses = [];

    UPDATABLE.forEach(field => {
      if (updates[field] === undefined) return;
      const val = updates[field];
      if (val === null) {
        setClauses.push(`${field} = NULL`);
      } else if (typeof val === 'boolean') {
        setClauses.push(`${field} = ${val}`);
      } else if (typeof val === 'number') {
        setClauses.push(`${field} = ${val}`);
      } else {
        setClauses.push(`${field} = '${esc(String(val))}'`);
      }
    });

    if (setClauses.length === 0) return null;

    // Always bump updated_at
    if (!updates.updated_at) {
      setClauses.push(`updated_at = '${new Date().toISOString()}'`);
    }

    const query = `UPDATE ${TABLE} SET ${setClauses.join(', ')} WHERE id = '${esc(id)}'`;
    return await executeQuery(req, query);
  }

  /**
   * Stamp the last_login timestamp for a user.
   */
  async updateLastLogin(req, id) {
    const now = new Date().toISOString();
    return await this.update(req, id, { last_login: now, updated_at: now });
  }

  /**
   * Hard-delete a user by id (use deactivation in production instead).
   */
  async delete(req, id) {
    return await executeQuery(req, `DELETE FROM ${TABLE} WHERE id = '${esc(id)}'`);
  }
}

module.exports = new UserRepository();

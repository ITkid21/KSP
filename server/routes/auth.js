'use strict';

const express = require('express');
const router = express.Router();

const authService = require('../services/authService');
const userRepo = require('../repositories/userRepository');
const auditRepo = require('../repositories/auditRepository');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { canManageUsers, canViewAuditLogs } = require('../middleware/roleMiddleware');

// ─── Helper ────────────────────────────────────────────────────────────────

/**
 * Wrap async route handlers so unhandled promise rejections are passed to next().
 */
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Strip password_hash from a user object before sending to client.
 */
function safeUser(user) {
  if (!user) return null;
  const { password_hash, ...safe } = user;
  return safe;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   POST /api/auth/login
 * @access  Public
 * @body    { username, password }
 * @returns { token, user }
 */
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'username and password are required.' });
  }

  const result = await authService.login(req, username.trim(), password);
  return res.status(200).json({ success: true, ...result });
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   POST /api/auth/logout
 * @access  Authenticated (any role)
 * @returns { message }
 */
router.post('/logout', authenticateToken, asyncHandler(async (req, res) => {
  await authService.logout(req, req.user.id, req.rawToken);
  return res.status(200).json({ success: true, message: 'Logged out successfully.' });
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   GET /api/auth/me
 * @access  Authenticated (any role)
 * @returns { user }
 */
router.get('/me', authenticateToken, asyncHandler(async (req, res) => {
  const user = await userRepo.findById(req, req.user.id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }
  return res.status(200).json({ success: true, user: safeUser(user) });
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/change-password
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   POST /api/auth/change-password
 * @access  Authenticated (any role — can only change own; ADMIN can change any)
 * @body    { target_user_id?, old_password?, new_password }
 */
router.post('/change-password', authenticateToken, asyncHandler(async (req, res) => {
  const { target_user_id, old_password, new_password } = req.body;

  if (!new_password) {
    return res.status(400).json({ success: false, error: 'new_password is required.' });
  }

  // If no target specified, default to self
  const targetId = target_user_id || req.user.id;

  await authService.changePassword(req, req.user, targetId, old_password || null, new_password);
  return res.status(200).json({ success: true, message: 'Password changed successfully. All sessions have been invalidated.' });
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/create-user
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   POST /api/auth/create-user
 * @access  ADMIN only
 * @body    { username, email, password, full_name, role, department, badge_number }
 * @returns { user }
 */
router.post('/create-user', authenticateToken, canManageUsers, asyncHandler(async (req, res) => {
  const newUser = await authService.createUser(req, req.user, req.body);
  return res.status(201).json({ success: true, message: 'User created successfully.', user: newUser });
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/users
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   GET /api/auth/users
 * @access  ADMIN only
 * @returns { users: [] }
 */
router.get('/users', authenticateToken, canManageUsers, asyncHandler(async (req, res) => {
  const users = await userRepo.getAll(req);
  const safe = users.map(safeUser).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return res.status(200).json({ success: true, users: safe });
}));

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/auth/users/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   PUT /api/auth/users/:id
 * @access  ADMIN only
 * @body    { full_name?, role?, department?, badge_number?, is_active?, email? }
 */
router.put('/users/:id', authenticateToken, canManageUsers, asyncHandler(async (req, res) => {
  await authService.updateUser(req, req.user, req.params.id, req.body);
  return res.status(200).json({ success: true, message: 'User updated successfully.' });
}));

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/auth/users/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   DELETE /api/auth/users/:id
 * @access  ADMIN only
 * @desc    Soft-delete (sets is_active = false, invalidates all sessions)
 */
router.delete('/users/:id', authenticateToken, canManageUsers, asyncHandler(async (req, res) => {
  await authService.deactivateUser(req, req.user, req.params.id);
  return res.status(200).json({ success: true, message: 'User deactivated successfully.' });
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/audit-logs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   GET /api/auth/audit-logs
 * @access  ADMIN only
 * @query   ?user_id=<uuid>  (optional filter)
 * @query   ?action=LOGIN    (optional filter)
 */
router.get('/audit-logs', authenticateToken, canViewAuditLogs, asyncHandler(async (req, res) => {
  const { user_id, action } = req.query;
  let logs;

  if (user_id) {
    logs = await auditRepo.getByUserId(req, user_id);
  } else if (action) {
    logs = await auditRepo.getByAction(req, action.toUpperCase());
  } else {
    logs = await auditRepo.getAll(req);
  }

  return res.status(200).json({ success: true, logs });
}));

// ─────────────────────────────────────────────────────────────────────────────
// Global error handler for this router
// ─────────────────────────────────────────────────────────────────────────────

router.use((err, req, res, _next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal server error.';
  console.error(`[Auth Route Error] ${status} — ${message}`);
  return res.status(status).json({ success: false, error: message });
});

module.exports = router;

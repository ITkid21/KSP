'use strict';

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const jwtService = require('./jwtService');
const userRepository = require('../repositories/userRepository');
const sessionRepository = require('../repositories/sessionRepository');
const auditRepository = require('../repositories/auditRepository');

const BCRYPT_ROUNDS = 12;

/**
 * Validate role is one of the allowed system roles.
 */
const VALID_ROLES = ['ADMIN', 'ANALYST', 'OFFICER'];

function normalizeRole(role) {
  if (!role) return 'OFFICER';
  const upper = role.toUpperCase();
  return VALID_ROLES.includes(upper) ? upper : 'OFFICER';
}

/**
 * Extract device metadata from the request.
 */
function extractMeta(req) {
  const userAgent = req.headers['user-agent'] || '';
  let deviceInfo = req.headers['x-device-info'] || '';
  
  // Derive device_info if not provided
  if (!deviceInfo && userAgent) {
    if (/mobile/i.test(userAgent)) {
      deviceInfo = 'Mobile';
    } else if (/tablet/i.test(userAgent)) {
      deviceInfo = 'Tablet';
    } else {
      deviceInfo = 'Desktop';
    }
  }

  return {
    ip_address: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
    user_agent: userAgent,
    device_info: deviceInfo,
  };
}

// ─────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────

/**
 * Authenticate a user and create a session.
 * @param {Object} req - Express request (Catalyst context attached)
 * @param {string} username
 * @param {string} password
 * @returns {{ token: string, user: Object }}
 */
async function login(req, username, password) {
  // 1. Find user
  const user = await userRepository.findByUsername(req, username);
  if (!user) {
    throw Object.assign(new Error('Invalid credentials.'), { status: 401 });
  }

  // 2. Check active
  if (user.is_active === false || user.is_active === 'false' || user.is_active === 0) {
    throw Object.assign(new Error('Account is deactivated. Contact your administrator.'), { status: 403 });
  }

  // 3. Verify password
  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    throw Object.assign(new Error('Invalid credentials.'), { status: 401 });
  }

  // 4. Build JWT
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    full_name: user.full_name,
    email: user.email,
    department: user.department,
    badge_number: user.badge_number,
  };
  const token = jwtService.sign(payload);
  const expiry = jwtService.getExpiry(token);

  // 5. Persist session
  const meta = extractMeta(req);
  const sessionId = uuidv4();
  
  // Prevent "Duplicate value for user_id" by clearing previous sessions for this user
  try {
    await sessionRepository.deleteByUser(req, user.id);
  } catch (err) {
    console.warn('[Session] Failed to delete existing sessions (might not exist):', err.message);
  }

  await sessionRepository.create(req, {
    id: sessionId,
    user_id: user.id,
    token,
    expires_at: expiry, // Date object or undefined, will be handled by sessionRepository
    ip_address: meta.ip_address,
    user_agent: meta.user_agent,
    device_info: meta.device_info,
  });

  // 6. Update last_login
  await userRepository.updateLastLogin(req, user.id);

  // 7. Audit log
  await auditRepository.log(req, user.id, 'LOGIN', 'auth', 'User logged in successfully', {
    ip_address: meta.ip_address,
  });

  // 8. Return (strip password_hash)
  const { password_hash, ...safeUser } = user;
  return { token, user: safeUser };
}

// ─────────────────────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────────────────────

/**
 * Invalidate user session and log the event.
 * @param {Object} req
 * @param {string} userId
 * @param {string} token - raw JWT token to invalidate
 */
async function logout(req, userId, token) {
  await sessionRepository.deleteByToken(req, token);
  await auditRepository.log(req, userId, 'LOGOUT', 'auth', 'User logged out', {
    ip_address: extractMeta(req).ip_address,
  });
}

// ─────────────────────────────────────────────────────────────
// CHANGE PASSWORD
// ─────────────────────────────────────────────────────────────

/**
 * Change a user's password.
 * Any role can change their own password.
 * ADMIN can change any user's password without providing the old one.
 * @param {Object} req
 * @param {Object} actorUser - JWT payload (the user making the request)
 * @param {string} targetUserId
 * @param {string|null} oldPassword - required unless actor is ADMIN
 * @param {string} newPassword
 */
async function changePassword(req, actorUser, targetUserId, oldPassword, newPassword) {
  const targetUser = await userRepository.findById(req, targetUserId);
  if (!targetUser) {
    throw Object.assign(new Error('User not found.'), { status: 404 });
  }

  const isAdmin = (actorUser.role || '').toUpperCase() === 'ADMIN' || (actorUser.role || '').toUpperCase() === 'SUPER_ADMIN';
  const isSelf = actorUser.id === targetUserId;

  if (!isAdmin && !isSelf) {
    throw Object.assign(new Error('You can only change your own password.'), { status: 403 });
  }

  // Non-admins must provide the old password
  if (!isAdmin) {
    if (!oldPassword) {
      throw Object.assign(new Error('Current password is required.'), { status: 400 });
    }
    const match = await bcrypt.compare(oldPassword, targetUser.password_hash);
    if (!match) {
      throw Object.assign(new Error('Current password is incorrect.'), { status: 401 });
    }
  }

  if (!newPassword || newPassword.length < 8) {
    throw Object.assign(new Error('New password must be at least 8 characters.'), { status: 400 });
  }

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await userRepository.update(req, targetUserId, { password_hash: newHash });

  // Invalidate all sessions so the user must log in again
  await sessionRepository.deleteByUser(req, targetUserId);

  await auditRepository.log(req, actorUser.id, 'PASSWORD_CHANGE', 'system_users', `Password changed for user: ${targetUser.username}`, {
    resource_id: targetUserId,
    ip_address: extractMeta(req).ip_address,
  });
}

// ─────────────────────────────────────────────────────────────
// CREATE USER
// ─────────────────────────────────────────────────────────────

/**
 * Create a new platform user. Only ADMIN can call this.
 * @param {Object} req
 * @param {Object} actorUser - JWT payload of the admin creating the user
 * @param {Object} userData - { username, email, password, full_name, role, department, badge_number }
 * @returns {Object} created user (without password_hash)
 */
async function createUser(req, actorUser, userData) {
  const roleUpper = (actorUser.role || '').toUpperCase();
  if (roleUpper !== 'ADMIN' && roleUpper !== 'SUPER_ADMIN') {
    throw Object.assign(new Error('Only ADMIN can create users.'), { status: 403 });
  }

  const { username, email, password, full_name, role, department, badge_number } = userData;

  if (!username || !email || !password || !full_name) {
    throw Object.assign(new Error('Required fields: username, email, password, full_name.'), { status: 400 });
  }

  // Check uniqueness
  const existingByUsername = await userRepository.findByUsername(req, username);
  if (existingByUsername) {
    throw Object.assign(new Error(`Username "${username}" is already taken.`), { status: 409 });
  }
  const existingByEmail = await userRepository.findByEmail(req, email);
  if (existingByEmail) {
    throw Object.assign(new Error(`Email "${email}" is already registered.`), { status: 409 });
  }

  if (password.length < 8) {
    throw Object.assign(new Error('Password must be at least 8 characters.'), { status: 400 });
  }

  const now = new Date().toISOString();
  const newUser = {
    id: uuidv4(),
    username: username.trim(),
    email: email.trim().toLowerCase(),
    password_hash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    full_name: full_name.trim(),
    role: normalizeRole(role),
    department: (department || '').trim(),
    badge_number: (badge_number || '').trim(),
    is_active: true,
    created_at: now,
    updated_at: now,
    last_login: null,
  };

  await userRepository.create(req, newUser);

  await auditRepository.log(req, actorUser.id, 'USER_CREATE', 'system_users', `Created user: ${username} (role: ${newUser.role})`, {
    resource_id: newUser.id,
    ip_address: extractMeta(req).ip_address,
  });

  const { password_hash, ...safeUser } = newUser;
  return safeUser;
}

// ─────────────────────────────────────────────────────────────
// UPDATE USER
// ─────────────────────────────────────────────────────────────

/**
 * Update user attributes. Only ADMIN can do this.
 * @param {Object} req
 * @param {Object} actorUser
 * @param {string} targetUserId
 * @param {Object} updates - allowed: full_name, role, department, badge_number, is_active
 */
async function updateUser(req, actorUser, targetUserId, updates) {
  const roleUpper = (actorUser.role || '').toUpperCase();
  if (roleUpper !== 'ADMIN' && roleUpper !== 'SUPER_ADMIN') {
    throw Object.assign(new Error('Only ADMIN can update users.'), { status: 403 });
  }

  const targetUser = await userRepository.findById(req, targetUserId);
  if (!targetUser) {
    throw Object.assign(new Error('User not found.'), { status: 404 });
  }

  const allowedFields = ['full_name', 'role', 'department', 'badge_number', 'is_active', 'email'];
  const sanitized = {};
  allowedFields.forEach(f => {
    if (updates[f] !== undefined) {
      sanitized[f] = updates[f];
    }
  });

  if (sanitized.role) {
    sanitized.role = normalizeRole(sanitized.role);
  }

  if (Object.keys(sanitized).length === 0) {
    throw Object.assign(new Error('No valid fields provided for update.'), { status: 400 });
  }

  await userRepository.update(req, targetUserId, sanitized);

  await auditRepository.log(req, actorUser.id, 'USER_UPDATE', 'system_users', `Updated user: ${targetUser.username}`, {
    resource_id: targetUserId,
    ip_address: extractMeta(req).ip_address,
  });
}

// ─────────────────────────────────────────────────────────────
// DELETE (SOFT) USER
// ─────────────────────────────────────────────────────────────

/**
 * Deactivate a user (soft delete). Only ADMIN can do this.
 * An admin cannot deactivate themselves.
 * @param {Object} req
 * @param {Object} actorUser
 * @param {string} targetUserId
 */
async function deactivateUser(req, actorUser, targetUserId) {
  const roleUpper = (actorUser.role || '').toUpperCase();
  if (roleUpper !== 'ADMIN' && roleUpper !== 'SUPER_ADMIN') {
    throw Object.assign(new Error('Only ADMIN can deactivate users.'), { status: 403 });
  }

  if (actorUser.id === targetUserId) {
    throw Object.assign(new Error('You cannot deactivate your own account.'), { status: 400 });
  }

  const targetUser = await userRepository.findById(req, targetUserId);
  if (!targetUser) {
    throw Object.assign(new Error('User not found.'), { status: 404 });
  }

  await userRepository.update(req, targetUserId, { is_active: false });
  // Invalidate all active sessions for the deactivated user
  await sessionRepository.deleteByUser(req, targetUserId);

  await auditRepository.log(req, actorUser.id, 'USER_DELETE', 'system_users', `Deactivated user: ${targetUser.username}`, {
    resource_id: targetUserId,
    ip_address: extractMeta(req).ip_address,
  });
}

module.exports = {
  login,
  logout,
  changePassword,
  createUser,
  updateUser,
  deactivateUser,
  normalizeRole,
  extractMeta,
  BCRYPT_ROUNDS,
};

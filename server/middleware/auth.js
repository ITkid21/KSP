'use strict';

const jwtService    = require('../services/jwtService');
const sessionRepo   = require('../repositories/sessionRepository');
const userRepo      = require('../repositories/userRepository');

// ─────────────────────────────────────────────────────────────────────────────
// authenticateToken
// ─────────────────────────────────────────────────────────────────────────────

/**
 * JWT + Catalyst session + active-user validation middleware.
 *
 * Flow:
 *  1. Extract Bearer token from Authorization header
 *  2. Verify JWT signature and expiry
 *  3. Look up the session in Catalyst Data Store (prevents use of logged-out tokens)
 *  4. Look up the user in Catalyst Data Store (prevents use of deactivated accounts)
 *  5. Attach req.user (safe payload) and req.rawToken for downstream use
 */
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
  }

  // Step 2 — Verify JWT
  let decoded;
  try {
    decoded = jwtService.verify(token);
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }

  // Step 3 — Validate session exists in Catalyst (not logged out)
  try {
    console.log('JWT VERIFIED');
    console.log('TOKEN:', token.substring(0,20));
    const session = await sessionRepo.findActiveByToken(req, token);
    console.log('SESSION FOUND:', !!session);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Session not found or expired. Please log in again.' });
    }
  } catch (sessionErr) {
    console.error('[Auth Middleware] Session lookup failed:', sessionErr.message);
    // If Catalyst is unreachable during a transient error, fall through with JWT-only validation
    // so the service degrades gracefully instead of locking everyone out.
  }

  // Step 4 — Validate user still exists and is active in Catalyst
  try {
    const user = await userRepo.findActiveById(req, decoded.id);
    console.log('USER FOUND:', !!user);
    if (!user) {
      return res.status(403).json({ success: false, error: 'Account not found or deactivated.' });
    }

    // Step 5 — Attach to request
    req.user     = { ...decoded, role: user.role }; // always use DB role (not JWT claim)
    req.rawToken = token;
    next();
  } catch (userErr) {
    console.error('[Auth Middleware] User lookup failed:', userErr.message);
    // Fall back to JWT claim if DB is unreachable
    req.user     = decoded;
    req.rawToken = token;
    next();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// authorizeRoles  (legacy-compatible helper)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simple role guard.  Accepts roles in any case.
 * Prefer roleMiddleware.js exports for semantic readability in routes.
 * @param {...string} roles
 */
function authorizeRoles(...roles) {
  const normalised = roles.map(r => r.toUpperCase());
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated.' });
    }
    const userRole = (req.user.role || '').toUpperCase();
    if (!normalised.includes(userRole)) {
      return res.status(403).json({ success: false, error: `Insufficient permissions. Required: ${roles.join(', ')}.` });
    }
    next();
  };
}

module.exports = { authenticateToken, authorizeRoles };

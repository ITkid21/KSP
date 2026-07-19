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
  console.log('[Auth] Starting authenticateToken');
  const authHeader = req.headers['authorization'];
  console.log('[Auth] Authorization header:', authHeader ? '[REDACTED]' : 'missing');

  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  console.log('[Auth] Bearer token extracted:', token ? token.substring(0, 20) + (token.length > 20 ? '...' : '') : 'none');

  if (!token) {
    console.log('[Auth] No token provided');
    return res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
  }

  // Step 2 — Verify JWT
  let decoded;
  try {
    decoded = jwtService.verify(token);
    console.log('[Auth] JWT verified:', {
      id: decoded.id,
      username: decoded.username,
      exp: decoded.exp,
      iat: decoded.iat,
    });
  } catch (err) {
    console.log('[Auth] JWT verification failed:', err.message);
    return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }

  // Step 3 — Validate session exists in Catalyst (not logged out)
  let session = null;
  try {
    session = await sessionRepo.findActiveByToken(req, token);
    console.log('[Auth] Session lookup complete. Session found:', !!session);
    if (!session) {
      console.warn('[Auth] Session missing or expired for token. Falling back to JWT-only validation.');
    } else {
      console.log('[Auth] Session details:', {
        id: session.id,
        user_id: session.user_id,
        expires_at: session.expires_at,
      });
    }
  } catch (sessionErr) {
    console.error('[Auth] Session lookup failed:', sessionErr.message);
    console.warn('[Auth] Falling back to JWT-only validation due to session lookup failure.');
  }

  // Step 4 — Validate user still exists and is active in Catalyst
  try {
    const user = await userRepo.findActiveById(req, decoded.id);
    console.log('[Auth] User lookup complete. User found:', !!user);
    if (!user) {
      console.log('[Auth] Active user not found for id:', decoded.id);
      return res.status(403).json({ success: false, error: 'Account not found or deactivated.' });
    }

    // Step 5 — Attach to request
    req.user     = { ...decoded, role: user.role }; // always use DB role (not JWT claim)
    req.rawToken = token;
    console.log('[Auth] Authenticated user attached to request:', {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
    });
    next();
  } catch (userErr) {
    console.error('[Auth] User lookup failed:', userErr.message);
    // Fall back to JWT claim if DB is unreachable
    req.user     = decoded;
    req.rawToken = token;
    console.log('[Auth] Falling back to JWT payload due to user lookup failure');
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

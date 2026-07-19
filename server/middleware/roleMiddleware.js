'use strict';

/**
 * Role-based permission middleware for KSP Crime Intelligence Platform.
 *
 * Roles (uppercase, matching Catalyst system_users.role):
 *   ADMIN    — Full access
 *   ANALYST  — Analytics, predictions, reports, AI tools, assigned/authorized cases
 *   OFFICER  — Assigned cases, document upload, AI Copilot, own password change
 */

/**
 * Generic role guard factory.
 * @param {...string} allowedRoles
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated.' });
    }
    const role = (req.user.role || '').toUpperCase();
    const normalized = allowedRoles.map(r => r.toUpperCase());
    if (role === 'SUPER_ADMIN' && normalized.includes('ADMIN')) {
      return next();
    }
    if (!normalized.includes(role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Required role(s): ${allowedRoles.join(', ')}.`
      });
    }
    next();
  };
}

/** Only ADMIN can create, edit, delete users and view all audit logs */
const canManageUsers = requireRole('ADMIN', 'SUPER_ADMIN');

/** Only ADMIN can view all audit logs */
const canViewAuditLogs = requireRole('ADMIN', 'SUPER_ADMIN');

/** ADMIN and ANALYST can access crime analytics */
const canAccessAnalytics = requireRole('ADMIN', 'SUPER_ADMIN', 'ANALYST');

/** ADMIN can access platform and system settings */
const canManageSettings = requireRole('ADMIN', 'SUPER_ADMIN');

/** ADMIN, ANALYST, OFFICER can use Investigation Copilot / AI tools */
const canAccessAITools = requireRole('ADMIN', 'SUPER_ADMIN', 'ANALYST', 'OFFICER');

/** ADMIN and OFFICER can upload investigation documents */
const canUploadDocuments = requireRole('ADMIN', 'SUPER_ADMIN', 'OFFICER');

/** ADMIN and ANALYST can run prediction models */
const canRunPredictions = requireRole('ADMIN', 'SUPER_ADMIN', 'ANALYST');

/** ADMIN and ANALYST can generate reports */
const canGenerateReports = requireRole('ADMIN', 'SUPER_ADMIN', 'ANALYST');

module.exports = {
  requireRole,
  canManageUsers,
  canViewAuditLogs,
  canAccessAnalytics,
  canManageSettings,
  canAccessAITools,
  canUploadDocuments,
  canRunPredictions,
  canGenerateReports,
};

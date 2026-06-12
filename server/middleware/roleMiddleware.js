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
    if (!allowedRoles.map(r => r.toUpperCase()).includes(role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Required role(s): ${allowedRoles.join(', ')}.`
      });
    }
    next();
  };
}

/** Only ADMIN can create, edit, delete users and view all audit logs */
const canManageUsers = requireRole('ADMIN');

/** Only ADMIN can view all audit logs */
const canViewAuditLogs = requireRole('ADMIN');

/** ADMIN and ANALYST can access crime analytics */
const canAccessAnalytics = requireRole('ADMIN', 'ANALYST');

/** ADMIN can access platform and system settings */
const canManageSettings = requireRole('ADMIN');

/** ADMIN, ANALYST, OFFICER can use Investigation Copilot / AI tools */
const canAccessAITools = requireRole('ADMIN', 'ANALYST', 'OFFICER');

/** ADMIN and OFFICER can upload investigation documents */
const canUploadDocuments = requireRole('ADMIN', 'OFFICER');

/** ADMIN and ANALYST can run prediction models */
const canRunPredictions = requireRole('ADMIN', 'ANALYST');

/** ADMIN and ANALYST can generate reports */
const canGenerateReports = requireRole('ADMIN', 'ANALYST');

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

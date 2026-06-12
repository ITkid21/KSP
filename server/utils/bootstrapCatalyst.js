'use strict';

/**
 * KSP Crime Intelligence Platform — Catalyst Admin Bootstrap
 * ──────────────────────────────────────────────────────────
 * Run ONCE to seed the first ADMIN user into the Catalyst Data Store.
 *
 * ── HOW TO RUN ───────────────────────────────────────────────────────────────
 *
 *   catalyst run node utils/bootstrapCatalyst.js
 *
 * The `catalyst run` prefix injects Catalyst project headers as environment
 * variables, which is required for the SDK to initialize in local scripts.
 * Running with plain `node` will fail with "unable to find type of init".
 *
 * ── PREREQUISITES ────────────────────────────────────────────────────────────
 *   1. catalyst login          (authenticate the CLI)
 *   2. catalyst init           (link this directory to your KSP project)
 *   3. Tables exist in Catalyst Data Store: system_users, sessions, audit_logs
 *
 * ── ENV VARS (optional overrides) ────────────────────────────────────────────
 *   ADMIN_BOOTSTRAP_USERNAME  (default: ksp_admin)
 *   ADMIN_BOOTSTRAP_EMAIL     (default: admin@ksp.gov.in)
 *   ADMIN_BOOTSTRAP_PASSWORD  (default: KSP@Admin2024!)
 *   ADMIN_BOOTSTRAP_FULLNAME  (default: System Administrator)
 *   ADMIN_BOOTSTRAP_BADGE     (default: KSP-ADMIN-001)
 */

const path     = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const catalyst = require('zcatalyst-sdk-node');

const TABLE = 'system_users';

// ─── Config ──────────────────────────────────────────────────────────────────

const ADMIN = {
  id:           uuidv4(),
  username:     process.env.ADMIN_BOOTSTRAP_USERNAME || 'ksp_admin',
  email:        process.env.ADMIN_BOOTSTRAP_EMAIL    || 'admin@ksp.gov.in',
  password:     process.env.ADMIN_BOOTSTRAP_PASSWORD || 'KSP@Admin2024!',
  full_name:    process.env.ADMIN_BOOTSTRAP_FULLNAME || 'System Administrator',
  badge_number: process.env.ADMIN_BOOTSTRAP_BADGE    || 'KSP-ADMIN-001',
  department:   'IT Cell',
  role:         'ADMIN',
};

const BCRYPT_ROUNDS = 12;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/'/g, "''");
}

async function executeQuery(app, query) {
  return await app.zcql().executeZCQLQuery(query);
}

async function checkUserExists(app, username, email) {
  const byUsername = await executeQuery(app, `SELECT id FROM ${TABLE} WHERE username = '${esc(username)}'`);
  if (byUsername && byUsername.length > 0) return { exists: true, field: 'username' };

  const byEmail = await executeQuery(app, `SELECT id FROM ${TABLE} WHERE email = '${esc(email)}'`);
  if (byEmail && byEmail.length > 0) return { exists: true, field: 'email' };

  return { exists: false };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function bootstrap() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  KSP Crime Intel — Catalyst Admin Bootstrap          ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // ── Preflight: ensure we are running under `catalyst run` ──────────────────
  // `catalyst run` injects these env vars.  If they are missing, the SDK
  // cannot authenticate and we fail early with a clear message.
  const projectId  = process.env['x-zc-projectid']    || process.env['X-ZC-PROJECTID'];
  const projectKey = process.env['x-zc-project-key']  || process.env['X-ZC-PROJECT-KEY'];
  const environment= process.env['x-zc-environment']  || process.env['X-ZC-ENVIRONMENT'];

  if (!projectId || !projectKey) {
    console.error('✗ Catalyst project headers not found in environment.');
    console.error('\n  This script must be run via:\n');
    console.error('    catalyst run node utils/bootstrapCatalyst.js\n');
    console.error('  Plain `node utils/bootstrapCatalyst.js` will NOT work because the');
    console.error('  Catalyst SDK needs project credentials injected by the CLI.\n');
    console.error('  Ensure you have run:');
    console.error('    1. catalyst login');
    console.error('    2. catalyst init  (inside the KSP root directory)\n');
    process.exit(1);
  }

  // ── Initialize Catalyst SDK using initializeApp() with explicit credentials ─
  // `catalyst run` sets env vars that match the catalystHeaders format.
  // We reconstruct the headers object and pass it to initialize().
  let app;
  try {
    const catalystHeaders = {
      'x-zc-projectid':   projectId,
      'x-zc-project-key': projectKey,
      'x-zc-environment': environment || 'Development',
    };

    // Inject admin token if the CLI set it (it usually sets CATALYST_AUTH env var)
    const authEnv = process.env['CATALYST_AUTH'];
    if (authEnv) {
      try {
        const authObj = JSON.parse(authEnv);
        if (authObj['x-zc-admin-cred-type']) {
          Object.assign(catalystHeaders, authObj);
        }
      } catch (_) { /* ignore malformed CATALYST_AUTH */ }
    }

    // basicio init: pass an object with catalystHeaders property
    app = catalyst.initialize({ catalystHeaders });
    console.log('✓ Catalyst SDK initialized.\n');
  } catch (err) {
    console.error('✗ Failed to initialize Catalyst SDK.');
    console.error('  Error:', err.message);
    console.error('\n  Run this script with:\n    catalyst run node utils/bootstrapCatalyst.js\n');
    process.exit(1);
  }

  // Check if admin already exists
  console.log(`Checking if user "${ADMIN.username}" already exists…`);
  const check = await checkUserExists(app, ADMIN.username, ADMIN.email);
  if (check.exists) {
    console.log(`\n⚠  Admin user already exists (matched on: ${check.field}). Bootstrap skipped.`);
    console.log('   If you need to reset, deactivate the existing user first via the Catalyst Data Store console.\n');
    process.exit(0);
  }

  // Hash password
  console.log('Hashing password (bcrypt, 12 rounds)…');
  const password_hash = await bcrypt.hash(ADMIN.password, BCRYPT_ROUNDS);

  // Build row data
  const now = new Date().toISOString();
  const rowData = {
    id:           ADMIN.id,
    username:     ADMIN.username,
    email:        ADMIN.email,
    password_hash,
    full_name:    ADMIN.full_name,
    role:         ADMIN.role,
    department:   ADMIN.department,
    badge_number: ADMIN.badge_number,
    is_active:    true,
    created_at:   now,
    updated_at:   now,
    last_login:   null,
  };

  // Insert into Catalyst Data Store
  console.log(`Inserting ADMIN user into Catalyst table "${TABLE}"…`);
  try {
    const table = app.datastore().table(TABLE);
    await table.insertRow(rowData);
    console.log('\n✓ Admin user created successfully!\n');
  } catch (err) {
    console.error('\n✗ Failed to insert admin user into Catalyst Data Store.');
    console.error('  Ensure the system_users table exists with the correct columns.');
    console.error('  Error:', err.message);
    process.exit(1);
  }

  // Summary
  console.log('══════════════════════════════════════════════════');
  console.log('  Admin Bootstrap Complete');
  console.log('══════════════════════════════════════════════════');
  console.log(`  Username  : ${ADMIN.username}`);
  console.log(`  Email     : ${ADMIN.email}`);
  console.log(`  Password  : ${ADMIN.password}`);
  console.log(`  Role      : ${ADMIN.role}`);
  console.log(`  Badge     : ${ADMIN.badge_number}`);
  console.log(`  User ID   : ${ADMIN.id}`);
  console.log('══════════════════════════════════════════════════');
  console.log('\n⚠  IMPORTANT: Change the admin password immediately after first login!\n');

  // Required Catalyst table schemas (printed for reference)
  console.log('\n📋 Catalyst Data Store — Required Table Schemas');
  console.log('────────────────────────────────────────────────');
  console.log('Table: system_users');
  console.log('  id            TEXT');
  console.log('  username      TEXT');
  console.log('  email         TEXT');
  console.log('  password_hash TEXT');
  console.log('  full_name     TEXT');
  console.log('  role          TEXT    (ADMIN | ANALYST | OFFICER)');
  console.log('  department    TEXT');
  console.log('  badge_number  TEXT');
  console.log('  is_active     BOOLEAN');
  console.log('  created_at    TEXT    (ISO datetime)');
  console.log('  updated_at    TEXT    (ISO datetime)');
  console.log('  last_login    TEXT    (ISO datetime, nullable)');
  console.log('');
  console.log('Table: sessions');
  console.log('  id            TEXT');
  console.log('  user_id       TEXT');
  console.log('  token         TEXT    (JWT, max ~1800 chars)');
  console.log('  expires_at    TEXT    (ISO datetime)');
  console.log('  ip_address    TEXT');
  console.log('  user_agent    TEXT');
  console.log('  device_info   TEXT');
  console.log('  created_at    TEXT    (ISO datetime)');
  console.log('');
  console.log('Table: audit_logs');
  console.log('  id            TEXT');
  console.log('  user_id       TEXT');
  console.log('  action        TEXT');
  console.log('  resource      TEXT');
  console.log('  resource_id   TEXT');
  console.log('  details       TEXT');
  console.log('  ip_address    TEXT');
  console.log('  created_at    TEXT    (ISO datetime)');
  console.log('\n');
}

bootstrap().catch(err => {
  console.error('Unexpected bootstrap error:', err);
  process.exit(1);
});

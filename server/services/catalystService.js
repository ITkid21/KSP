const catalyst = require('zcatalyst-sdk-node');
const { initializeLocalApp } = require('../utils/localCatalyst');
require('dotenv').config();

const storageFallback = require('./storageFallback');

function buildCatalystHeaders(req) {
  const headers = {};
  const source = req && req.headers ? req.headers : {};

  const projectId = source['x-zc-projectid'] || source['X-ZC-PROJECTID'] || process.env['x-zc-projectid'] || process.env['X-ZC-PROJECTID'];
  const projectKey = source['x-zc-project-key'] || source['X-ZC-PROJECT-KEY'] || process.env['x-zc-project-key'] || process.env['X-ZC-PROJECT-KEY'];
  const environment = source['x-zc-environment'] || source['X-ZC-ENVIRONMENT'] || process.env['x-zc-environment'] || process.env['X-ZC-ENVIRONMENT'] || process.env['CATALYST_ENVIRONMENT'] || 'Development';

  if (projectId && projectKey) {
    headers['x-zc-projectid'] = String(projectId);
    headers['x-zc-project-key'] = String(projectKey);
    headers['x-zc-environment'] = String(environment);
  }

  const adminCredential = process.env.CATALYST_ADMIN_CRED_TYPE || 'token';
  const adminToken = process.env.CATALYST_ADMIN_CRED_TOKEN || process.env.CATALYST_ADMIN_TOKEN || process.env.CATALYST_AUTH_TOKEN || '';
  const userCredential = process.env.CATALYST_USER_CRED_TYPE || 'token';
  const userToken = process.env.CATALYST_USER_CRED_TOKEN || process.env.CATALYST_USER_TOKEN || adminToken || '';

  if (adminToken) {
    headers['x-zc-admin-cred-type'] = adminCredential;
    headers['x-zc-admin-cred-token'] = String(adminToken);
  }

  if (userToken) {
    headers['x-zc-user-cred-type'] = userCredential;
    headers['x-zc-user-cred-token'] = String(userToken);
  }

  headers['x-zc-user-type'] = 'admin';

  return headers;
}

async function initializeCatalystApp(req) {
  if (req && req.catalyst) {
    return req.catalyst;
  }

  const catalystHeaders = buildCatalystHeaders(req);
  const hasProjectIdentity = Boolean(catalystHeaders['x-zc-projectid'] && catalystHeaders['x-zc-project-key']);
  const hasCredential = Boolean(catalystHeaders['x-zc-admin-cred-token'] || catalystHeaders['x-zc-user-cred-token']);

  if (hasProjectIdentity && hasCredential) {
    try {
      return catalyst.initialize({ catalystHeaders }, { type: 'basicio' });
    } catch (err) {
      console.error('[Catalyst Init Error]', err);
      console.error(err.stack);
      console.error('Execution Path: request-less init (getCatalystApp)');
    }
  }

  try {
    console.log('[Catalyst Service] Falling back to CLI-based Catalyst initialization.');
    return await initializeLocalApp();
  } catch (err) {
    console.warn('[Catalyst Service] CLI-based Catalyst initialization failed:', err.message);
    console.warn(err.stack);
    return null;
  }
}

/**
 * Get Catalyst app instance from request or environment
 * @param {Object} [req] - Express request object
 */
async function getCatalystApp(req) {
  return await initializeCatalystApp(req);
}

/**
 * Express middleware to initialize Catalyst SDK for each request
 */
async function catalystMiddleware(req, res, next) {
  try {
    const app = await initializeCatalystApp(req);
    req.catalyst = app;
    req.catalystApp = app;
    next();
  } catch (err) {
    console.error('[Catalyst Init Error]', err);
    console.error(err.stack);
    console.error('Execution Path: per request init (catalystMiddleware)');
    console.warn('[Catalyst Service] Failed to initialize Catalyst SDK per request. Falling back to local environment credentials if configured.');
    req.catalyst = null;
    req.catalystApp = null;
    next();
  }
}

/**
 * Execute ZCQL query using request context or environment
 * @param {Object} req - Express request object
 * @param {string} query - ZCQL query string
 */
async function executeQuery(req, query) {
  const app = await getCatalystApp(req);
  if (!app) {
    return storageFallback.executeQuery(req, query);
  }
  try {
    return await app.zcql().executeZCQLQuery(query);
  } catch (err) {
    console.warn('[Catalyst Service] Falling back to local storage after query error:', err.message);
    return storageFallback.executeQuery(req, query);
  }
}

/**
 * Insert a single row into a table
 * @param {Object} req - Express request object
 * @param {string} tableName - Data Store table name
 * @param {Object} rowData - Object containing column keys and values
 */
async function insertRow(req, tableName, rowData) {
  const app = await getCatalystApp(req);
  if (!app) {
    return storageFallback.insertRow(req, tableName, rowData);
  }
  try {
    const table = app.datastore().table(tableName);
    return await table.insertRow(rowData);
  } catch (err) {
    console.warn('[Catalyst Service] Falling back to local storage after insert error:', err.message);
    return storageFallback.insertRow(req, tableName, rowData);
  }
}

/**
 * Add multiple rows into a table in bulk (credit-optimized)
 * @param {Object} req - Express request object
 * @param {string} tableName - Data Store table name
 * @param {Array<Object>} rows - Array of objects containing column keys and values
 */
async function addRows(req, tableName, rows) {
  const app = await getCatalystApp(req);
  if (!app) {
    return storageFallback.addRows(req, tableName, rows);
  }
  try {
    const table = app.datastore().table(tableName);
    return await table.addRow(rows);
  } catch (err) {
    console.warn('[Catalyst Service] Falling back to local storage after addRows error:', err.message);
    return storageFallback.addRows(req, tableName, rows);
  }
}

/**
 * Update a row in a table by its ROWID
 * @param {Object} req - Express request object
 * @param {string} tableName - Data Store table name
 * @param {Object} rowData - Row object (must include ROWID field)
 */
async function updateRow(req, tableName, rowData) {
  const app = await getCatalystApp(req);
  if (!app) {
    return storageFallback.updateRow(req, tableName, rowData);
  }
  try {
    const table = app.datastore().table(tableName);
    return await table.updateRow(rowData);
  } catch (err) {
    console.warn('[Catalyst Service] Falling back to local storage after update error:', err.message);
    return storageFallback.updateRow(req, tableName, rowData);
  }
}

module.exports = {
  catalystMiddleware,
  getCatalystApp,
  executeQuery,
  insertRow,
  addRows,
  updateRow
};

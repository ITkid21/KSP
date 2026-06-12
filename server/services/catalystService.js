const catalyst = require('zcatalyst-sdk-node');
require('dotenv').config();

/**
 * Get Catalyst app instance from request or environment
 * @param {Object} [req] - Express request object
 */
function getCatalystApp(req) {
  if (req && req.catalyst) {
    return req.catalyst;
  }
  
  // Try initializing without request (for background scripts/seeders)
  try {
    return catalyst.initialize();
  } catch (err) {
    console.error('[Catalyst Init Error]', err);
    console.error(err.stack);
    console.error('Execution Path: request-less init (getCatalystApp)');
    // If running in development local script and no env set, return null
    return null;
  }
}

/**
 * Express middleware to initialize Catalyst SDK for each request
 */
function catalystMiddleware(req, res, next) {
  try {
    const app = catalyst.initialize(req);
    req.catalyst = app;
    req.catalystApp = app;
    next();
  } catch (err) {
    console.error('[Catalyst Init Error]', err);
    console.error(err.stack);
    console.error('Execution Path: per request init (catalystMiddleware)');
    console.warn('[Catalyst Service] Failed to initialize Catalyst SDK per request. Falling back to local environment credentials if configured.');
    try {
      // In local mode, try request-less init
      const app = catalyst.initialize();
      req.catalyst = app;
      req.catalystApp = app;
    } catch (localErr) {
      console.error('[Catalyst Init Error]', localErr);
      console.error(localErr.stack);
      console.error('Execution Path: request-less init fallback (catalystMiddleware)');
      req.catalyst = null;
      req.catalystApp = null;
    }
    next();
  }
}

/**
 * Execute ZCQL query using request context or environment
 * @param {Object} req - Express request object
 * @param {string} query - ZCQL query string
 */
async function executeQuery(req, query) {
  const app = getCatalystApp(req);
  if (!app) {
    throw new Error('Catalyst SDK is not initialized. Ensure request context or environment configuration exists.');
  }
  return await app.zcql().executeZCQLQuery(query);
}

/**
 * Insert a single row into a table
 * @param {Object} req - Express request object
 * @param {string} tableName - Data Store table name
 * @param {Object} rowData - Object containing column keys and values
 */
async function insertRow(req, tableName, rowData) {
  const app = getCatalystApp(req);
  if (!app) {
    throw new Error('Catalyst SDK is not initialized.');
  }
  const table = app.datastore().table(tableName);
  return await table.insertRow(rowData);
}

/**
 * Add multiple rows into a table in bulk (credit-optimized)
 * @param {Object} req - Express request object
 * @param {string} tableName - Data Store table name
 * @param {Array<Object>} rows - Array of objects containing column keys and values
 */
async function addRows(req, tableName, rows) {
  const app = getCatalystApp(req);
  if (!app) {
    throw new Error('Catalyst SDK is not initialized.');
  }
  const table = app.datastore().table(tableName);
  return await table.addRow(rows);
}

/**
 * Update a row in a table by its ROWID
 * @param {Object} req - Express request object
 * @param {string} tableName - Data Store table name
 * @param {Object} rowData - Row object (must include ROWID field)
 */
async function updateRow(req, tableName, rowData) {
  const app = getCatalystApp(req);
  if (!app) {
    throw new Error('Catalyst SDK is not initialized.');
  }
  const table = app.datastore().table(tableName);
  return await table.updateRow(rowData);
}

module.exports = {
  catalystMiddleware,
  getCatalystApp,
  executeQuery,
  insertRow,
  addRows,
  updateRow
};

'use strict';

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
require('dotenv').config();

const app  = express();
const PORT = process.env.X_ZOHO_CATALYST_LISTEN_PORT || process.env.PORT || 5000;

// ─── Core Middleware ───────────────────────────────────────────────────────

app.use(cors());
app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.url}`);
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Catalyst SDK — initialize per request so req.catalyst is always available
const { catalystMiddleware } = require('./services/catalystService');
const { ensureDefaultUsers } = require('./utils/bootstrapDefaultUsers');
app.use(catalystMiddleware);

// ─── Static Client ────────────────────────────────────────────────────────

const clientDistPath = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, 'dist')
  : path.join(__dirname, '..', 'client', 'dist');

app.use(express.static(clientDistPath));

// ─── API Routes ───────────────────────────────────────────────────────────

app.use('/api/auth',        require('./routes/auth'));
app.use('/api/import',      require('./routes/import'));
app.use('/api/crime',       require('./routes/crime'));
app.use('/api/map',         require('./routes/map'));
app.use('/api/predictions', require('./routes/predictions'));
app.use('/api/analytics',   require('./routes/analytics'));
app.use('/api/reports',     require('./routes/reports'));
app.use('/api/ai',          require('./routes/ai'));
app.use('/api/copilot',     require('./routes/copilot'));
app.use('/api/hotspots',    require('./routes/hotspots'));

// ─── Health Check ────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ─── Coming Soon Placeholders ─────────────────────────────────────────────

const soon = msg => (_, res) => res.json({ message: msg });
app.get('/api/fir',               soon('FIR Integration — Coming Soon'));
app.get('/api/sos',               soon('SOS Emergency System — Coming Soon'));
app.get('/api/cctv',              soon('CCTV Analytics — Coming Soon'));
app.get('/api/facial-recognition',soon('Facial Recognition — Coming Soon'));
app.get('/api/vehicle-tracking',  soon('Vehicle Tracking — Coming Soon'));
app.get('/api/patrol-routes',     soon('Patrol Route Optimization — Coming Soon'));
app.get('/api/resource-allocation',soon('Resource Allocation Engine — Coming Soon'));

// ─── Global Error Handler ────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error('[Global Error]', err.message);
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error.',
    stack: err.stack || null,
  });
});

// ─── SPA Fallback ────────────────────────────────────────────────────────

// Serve SPA for non-API routes; return 404 JSON for unknown API routes
app.get('*', (req, res) => {
  if (req.path && req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// ─── Start ───────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  try {
    await ensureDefaultUsers();
  } catch (err) {
    console.warn('[Startup] Default users bootstrap skipped:', err.message);
  }

  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  KSP Crime Intelligence Platform                ║`);
  console.log(`║  Server running on http://localhost:${PORT}        ║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);
});

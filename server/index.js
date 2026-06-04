const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.X_ZOHO_CATALYST_LISTEN_PORT || process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files from client build
const clientDistPath = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, 'dist')
  : path.join(__dirname, '..', 'client', 'dist');

app.use(express.static(clientDistPath));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/crime', require('./routes/crime'));
app.use('/api/map', require('./routes/map'));
app.use('/api/predictions', require('./routes/predictions'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/copilot', require('./routes/copilot'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// Future API placeholders
app.get('/api/fir', (req, res) => res.json({ message: 'FIR integration - Coming soon' }));
app.get('/api/sos', (req, res) => res.json({ message: 'SOS Emergency System - Coming soon' }));
app.get('/api/cctv', (req, res) => res.json({ message: 'CCTV Analytics - Coming soon' }));
app.get('/api/facial-recognition', (req, res) => res.json({ message: 'Facial Recognition - Coming soon' }));
app.get('/api/vehicle-tracking', (req, res) => res.json({ message: 'Vehicle Tracking - Coming soon' }));
app.get('/api/patrol-routes', (req, res) => res.json({ message: 'Patrol Route Optimization - Coming soon' }));
app.get('/api/resource-allocation', (req, res) => res.json({ message: 'Resource Allocation Engine - Coming soon' }));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  KSP Crime Intelligence Platform                ║`);
  console.log(`║  Server running on http://localhost:${PORT}        ║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);
});

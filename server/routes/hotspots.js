const express = require('express');
const db = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function parseBoolean(value) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y'].includes(normalized);
}

router.get('/', authenticateToken, (req, res) => {
  try {
    const { crime_type, risk_level, district, active_only = 'true' } = req.query;
    let data = db.getAll('hotspots');

    if (parseBoolean(active_only)) {
      data = data.filter(h => h.is_active !== 0);
    }

    if (crime_type) {
      data = data.filter(item => item.crime_type === crime_type);
    }

    if (risk_level) {
      data = data.filter(item => item.risk_level === risk_level);
    }

    if (district) {
      data = data.filter(item => item.district === district);
    }

    res.json(data.sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0)));
  } catch (err) {
    console.error('[Hotspots Route] Failed to list hotspots:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/summary', authenticateToken, (req, res) => {
  try {
    const hotspots = db.getAll('hotspots').filter(h => h.is_active !== 0);
    const riskCounts = hotspots.reduce((acc, item) => {
      const level = item.risk_level || 'unknown';
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {});

    const summary = {
      totalHotspots: hotspots.length,
      activeHotspots: hotspots.length,
      criticalHotspots: riskCounts.critical || 0,
      highHotspots: riskCounts.high || 0,
      mediumHotspots: riskCounts.medium || 0,
      lowHotspots: riskCounts.low || 0,
      topRiskScore: hotspots.reduce((max, item) => Math.max(max, item.risk_score || 0), 0)
    };

    res.json(summary);
  } catch (err) {
    console.error('[Hotspots Route] Failed to generate summary:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/clusters', authenticateToken, (req, res) => {
  try {
    const hotspots = db.getAll('hotspots').filter(h => h.is_active !== 0);
    const grouped = hotspots.reduce((acc, item) => {
      const district = item.district || 'Unknown';
      if (!acc[district]) {
        acc[district] = {
          district,
          hotspotCount: 0,
          avgRiskScore: 0,
          riskLevels: {}
        };
      }

      acc[district].hotspotCount += 1;
      acc[district].avgRiskScore += item.risk_score || 0;
      const level = item.risk_level || 'unknown';
      acc[district].riskLevels[level] = (acc[district].riskLevels[level] || 0) + 1;
      return acc;
    }, {});

    const clusters = Object.values(grouped).map(item => ({
      ...item,
      avgRiskScore: Number((item.avgRiskScore / item.hotspotCount).toFixed(2))
    })).sort((a, b) => b.avgRiskScore - a.avgRiskScore);

    res.json(clusters);
  } catch (err) {
    console.error('[Hotspots Route] Failed to build clusters:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;

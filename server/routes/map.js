const express = require('express');
const db = require('../models/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.get('/locations', authenticateToken, (req, res) => {
  try {
    const { crime_type, severity, district, overall_risk } = req.query;
    let data = db.getAll('crime_locations');
    if (crime_type) data = data.filter(d => d.crime_type === crime_type);
    if (severity) data = data.filter(d => d.severity === severity);
    if (district) data = data.filter(d => d.district === district);
    if (overall_risk) data = data.filter(d => d.overall_risk === overall_risk);
    res.json(data.sort((a, b) => (b.cases || 0) - (a.cases || 0)));
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/hotspots', authenticateToken, (req, res) => {
  try {
    const { crime_type, risk_level } = req.query;
    let data = db.getAll('hotspots').filter(h => h.is_active !== 0);
    if (crime_type) data = data.filter(d => d.crime_type === crime_type);
    if (risk_level) data = data.filter(d => d.risk_level === risk_level);
    res.json(data.sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0)));
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/heatmap-data', authenticateToken, (req, res) => {
  try {
    const { crime_type } = req.query;
    let data = db.getAll('crime_locations');
    if (crime_type) data = data.filter(d => d.crime_type === crime_type);
    const points = data.map(d => ({
      lat: d.latitude, lng: d.longitude, intensity: Math.min((d.cases || 0) / 1000, 1),
      crime_type: d.crime_type, district: d.district, severity: d.severity, cases: d.cases
    }));
    res.json(points);
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/clusters', authenticateToken, (req, res) => {
  try {
    const locations = db.getAll('crime_locations');
    const distMap = {};
    locations.forEach(l => {
      if (!distMap[l.district]) distMap[l.district] = { district: l.district, latitude: l.latitude, longitude: l.longitude, crime_types: [], total_cases: 0, overall_risk: l.overall_risk, incident_types: 0 };
      distMap[l.district].total_cases += (l.cases || 0);
      if (!distMap[l.district].crime_types.includes(l.crime_type)) distMap[l.district].crime_types.push(l.crime_type);
    });
    const clusters = Object.values(distMap).map(c => ({
      ...c, incident_types: c.crime_types.length,
      risk_score: c.overall_risk === 'critical' ? 0.9 : c.overall_risk === 'high' ? 0.7 : c.overall_risk === 'medium' ? 0.5 : 0.3
    })).sort((a, b) => b.total_cases - a.total_cases);
    res.json(clusters);
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/districts', authenticateToken, (req, res) => {
  try {
    const districts = [...new Set(db.getAll('crime_locations').map(d => d.district))].sort();
    res.json(districts);
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/crime-types', authenticateToken, (req, res) => {
  try {
    const types = [...new Set(db.getAll('crime_locations').map(d => d.crime_type))].sort();
    res.json(types);
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

module.exports = router;

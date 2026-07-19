const express = require('express');
const db = require('../models/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const DbscanRunner = require('../services/dbscanRunner');
const router = express.Router();

router.get('/', authenticateToken, (req, res) => {
  try {
    const { district, crime_type, year } = req.query;
    let data = db.getAll('predictions');
    if (district) data = data.filter(d => d.district === district);
    if (crime_type) data = data.filter(d => d.predicted_crime_type === crime_type);
    if (year) data = data.filter(d => d.predicted_year === parseInt(year));
    res.json(data.sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0)));
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.post('/generate', authenticateToken, authorizeRoles('super_admin', 'analyst'), async (req, res) => {
  try {
    const { predictions, metrics } = await DbscanRunner.run();
    db.clear('predictions');
    db.insertMany('predictions', predictions);
    res.json({ 
      message: `Predictions generated successfully using DBSCAN. Found ${metrics.number_of_clusters} clusters with ${metrics.noise_count} noise points in ${metrics.runtime_seconds.toFixed(2)}s.`, 
      count: predictions.length 
    });
  } catch (err) { 
    console.error('[DBSCAN Generation Error]', err); 
    res.status(500).json({ error: `Generation failed: ${err.message}` }); 
  }
});

router.get('/summary', authenticateToken, (req, res) => {
  try {
    const predictions = db.getAll('predictions');
    const highRisk = predictions.filter(p => (p.risk_score || 0) >= 0.7).length;

    const distMap = {};
    predictions.forEach(p => {
      if (!distMap[p.district]) distMap[p.district] = { district: p.district, total_risk: 0, count: 0 };
      distMap[p.district].total_risk += (p.risk_score || 0);
      distMap[p.district].count++;
    });
    const topDistricts = Object.values(distMap).map(d => ({ district: d.district, avg_risk: parseFloat((d.total_risk / d.count).toFixed(3)), predictions: d.count })).sort((a, b) => b.avg_risk - a.avg_risk).slice(0, 10);

    const typeMap = {};
    predictions.forEach(p => {
      if (!typeMap[p.predicted_crime_type]) typeMap[p.predicted_crime_type] = { total_risk: 0, total_conf: 0, count: 0 };
      typeMap[p.predicted_crime_type].total_risk += (p.risk_score || 0);
      typeMap[p.predicted_crime_type].total_conf += (p.confidence_score || 0);
      typeMap[p.predicted_crime_type].count++;
    });
    const topCrimeTypes = Object.entries(typeMap).map(([type, d]) => ({ crime_type: type, avg_risk: parseFloat((d.total_risk / d.count).toFixed(3)), avg_confidence: parseFloat((d.total_conf / d.count).toFixed(3)) })).sort((a, b) => b.avg_risk - a.avg_risk);

    res.json({ highRiskCount: highRisk, topDistricts, topCrimeTypes });
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

module.exports = router;

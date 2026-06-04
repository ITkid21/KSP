const express = require('express');
const db = require('../models/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
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

router.post('/generate', authenticateToken, authorizeRoles('super_admin', 'analyst'), (req, res) => {
  try {
    db.clear('predictions');
    const locations = db.getAll('crime_locations');
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const predictions = [];

    locations.forEach(loc => {
      let baseRisk = loc.severity === 'critical' ? 0.85 : loc.severity === 'high' ? 0.65 : loc.severity === 'medium' ? 0.45 : 0.25;
      let caseFactor = Math.min((loc.cases || 0) / 50000, 1);
      let riskScore = Math.min(baseRisk + caseFactor * 0.15, 0.99);
      let confidence = (loc.cases || 0) > 1000 ? 0.78 : (loc.cases || 0) > 500 ? 0.65 : 0.52;

      months.forEach((month, idx) => {
        let v = 1 + (Math.sin(idx * Math.PI / 6) * 0.1);
        predictions.push({
          id: predictions.length + 1, district: loc.district,
          latitude: loc.latitude + (Math.random() - 0.5) * 0.05,
          longitude: loc.longitude + (Math.random() - 0.5) * 0.05,
          predicted_crime_type: loc.crime_type,
          risk_score: parseFloat((riskScore * v).toFixed(3)),
          confidence_score: parseFloat(confidence.toFixed(3)),
          predicted_month: month, predicted_year: 2025,
          model_version: 'rule-based-v1', is_validated: 0,
          created_at: new Date().toISOString()
        });
      });
    });

    db.insertMany('predictions', predictions);
    res.json({ message: 'Predictions generated.', count: predictions.length });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error.' }); }
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

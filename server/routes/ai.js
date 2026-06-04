const express = require('express');
const db = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.get('/insights', authenticateToken, (req, res) => {
  try {
    const insights = db.prepare('SELECT * FROM ai_insights WHERE is_active = 1 ORDER BY created_at DESC').all();
    res.json(insights);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/generate-insights', authenticateToken, (req, res) => {
  try {
    db.prepare('DELETE FROM ai_insights').run();
    const insights = [];
    const insertInsight = db.prepare(
      'INSERT INTO ai_insights (insight_type, title, description, severity, crime_type, district, data_json) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    const yearlyData = db.prepare(
      'SELECT major_head, year, SUM(current_month_count) as total FROM crime_records GROUP BY major_head, year ORDER BY major_head, year'
    ).all();

    const catMap = {};
    yearlyData.forEach(d => {
      if (!catMap[d.major_head]) catMap[d.major_head] = {};
      catMap[d.major_head][d.year] = d.total;
    });

    Object.entries(catMap).forEach(([cat, years]) => {
      const yk = Object.keys(years).sort();
      if (yk.length >= 2) {
        const latest = years[yk[yk.length - 1]];
        const prev = years[yk[yk.length - 2]];
        if (prev > 0 && latest > 100) {
          const g = ((latest - prev) / prev * 100).toFixed(1);
          const sn = cat.split('(')[0].trim();
          if (Math.abs(g) > 5) {
            insights.push({ type: 'trend', title: g > 0 ? `${sn} Rising` : `${sn} Declining`,
              desc: g > 0 ? `${sn} increased by ${g}% in ${yk[yk.length-1]} compared to previous year. Total: ${latest.toLocaleString()}.`
                : `${sn} decreased by ${Math.abs(g)}% in ${yk[yk.length-1]}. Total: ${latest.toLocaleString()}.`,
              sev: g > 20 ? 'critical' : g > 10 ? 'warning' : g > 0 ? 'info' : 'success', crime: cat, dist: null, data: JSON.stringify(years) });
          }
        }
      }
    });

    const distRisks = db.prepare(
      "SELECT district, overall_risk, SUM(cases) as total_cases, GROUP_CONCAT(DISTINCT crime_type) as ct FROM crime_locations GROUP BY district ORDER BY total_cases DESC"
    ).all();

    distRisks.filter(d => d.overall_risk === 'critical').forEach(d => {
      insights.push({ type: 'hotspot', title: `${d.district} - Critical Risk Zone`,
        desc: `${d.district} is a critical risk zone with ${d.total_cases.toLocaleString()} total cases across ${d.ct.split(',').length} crime categories.`,
        sev: 'critical', crime: null, dist: d.district, data: JSON.stringify(d) });
    });

    Object.entries(catMap).forEach(([cat, years]) => {
      const yk = Object.keys(years).sort();
      if (yk.length >= 3) {
        let cg = true;
        for (let i = 1; i < yk.length; i++) { if (years[yk[i]] <= years[yk[i-1]]) { cg = false; break; } }
        if (cg && years[yk[yk.length-1]] > 100) {
          const sn = cat.split('(')[0].trim();
          insights.push({ type: 'pattern', title: `Continuous Growth: ${sn}`,
            desc: `${sn} has shown continuous growth since ${yk[0]}, indicating persistent upward trend.`,
            sev: 'warning', crime: cat, dist: null, data: JSON.stringify(years) });
        }
      }
    });

    const topCrimes = db.prepare(
      "SELECT crime_type, SUM(cases) as total FROM crime_locations GROUP BY crime_type ORDER BY total DESC LIMIT 5"
    ).all();
    topCrimes.forEach(c => {
      insights.push({ type: 'recommendation', title: `Focus Area: ${c.crime_type}`,
        desc: `${c.crime_type} accounts for ${c.total.toLocaleString()} cases across Karnataka. Consider increasing patrol in high-incident areas.`,
        sev: 'warning', crime: c.crime_type, dist: null, data: JSON.stringify(c) });
    });

    const insertAll = db.transaction((items) => {
      for (const i of items) {
        insertInsight.run(i.type, i.title, i.desc, i.sev, i.crime, i.dist, i.data);
      }
    });
    insertAll(insights);

    res.json({ message: 'Insights generated.', count: insights.length });
  } catch (err) {
    console.error('Insight error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;

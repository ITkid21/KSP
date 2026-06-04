const express = require('express');
const db = require('../models/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

const MONTH_ORDER = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

router.get('/overview', authenticateToken, (req, res) => {
  try {
    const records = db.getAll('crime_records');
    const locations = db.getAll('crime_locations');
    const districts = [...new Set(locations.map(l => l.district))];
    const years = [...new Set(records.map(r => r.year))].sort();

    const catMap = {};
    records.forEach(r => { if (r.major_head) catMap[r.major_head] = (catMap[r.major_head] || 0) + (r.current_month_count || 0); });
    const topCrimes = Object.entries(catMap).map(([major_head, total]) => ({ major_head, total })).sort((a, b) => b.total - a.total).slice(0, 15);

    const monthlyMap = {};
    records.forEach(r => {
      const key = `${r.year}-${r.month}`;
      if (!monthlyMap[key]) monthlyMap[key] = { year: r.year, month: r.month, total: 0 };
      monthlyMap[key].total += (r.current_month_count || 0);
    });
    const monthlyTrends = Object.values(monthlyMap).sort((a, b) => a.year - b.year || (MONTH_ORDER[a.month] || 0) - (MONTH_ORDER[b.month] || 0));

    res.json({ totalRecords: records.length, totalLocations: locations.length, totalDistricts: districts.length, yearRange: { min_year: years[0], max_year: years[years.length - 1] }, topCrimes, monthlyTrends });
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/category-breakdown', authenticateToken, (req, res) => {
  try {
    const { year } = req.query;
    let records = db.getAll('crime_records');
    if (year) records = records.filter(r => r.year === parseInt(year));
    const map = {};
    records.forEach(r => {
      const key = `${r.act}||${r.major_head}`;
      if (!map[key]) map[key] = { act: r.act, major_head: r.major_head, total: 0 };
      map[key].total += (r.current_month_count || 0);
    });
    res.json(Object.values(map).sort((a, b) => b.total - a.total));
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/severity-analysis', authenticateToken, (req, res) => {
  try {
    const locations = db.getAll('crime_locations');
    const sevMap = {};
    locations.forEach(l => {
      if (!sevMap[l.severity]) sevMap[l.severity] = { severity: l.severity, crime_types: 0, total_cases: 0 };
      sevMap[l.severity].crime_types++;
      sevMap[l.severity].total_cases += (l.cases || 0);
    });
    const riskMap = {};
    locations.forEach(l => {
      if (!riskMap[l.overall_risk]) riskMap[l.overall_risk] = { risk_level: l.overall_risk, districts: new Set(), total_cases: 0 };
      riskMap[l.overall_risk].districts.add(l.district);
      riskMap[l.overall_risk].total_cases += (l.cases || 0);
    });
    res.json({
      bySeverity: Object.values(sevMap).sort((a, b) => b.total_cases - a.total_cases),
      byRisk: Object.values(riskMap).map(r => ({ ...r, districts: r.districts.size })).sort((a, b) => b.total_cases - a.total_cases)
    });
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/year-comparison', authenticateToken, (req, res) => {
  try {
    const records = db.getAll('crime_records');
    const grouped = {};
    records.forEach(r => {
      if (!r.major_head) return;
      if (!grouped[r.major_head]) grouped[r.major_head] = {};
      grouped[r.major_head][r.year] = (grouped[r.major_head][r.year] || 0) + (r.current_month_count || 0);
    });
    const result = Object.entries(grouped).map(([category, years]) => {
      const yk = Object.keys(years).sort();
      const latest = years[yk[yk.length - 1]] || 0;
      const prev = years[yk[yk.length - 2]] || 0;
      const growth = prev > 0 ? parseFloat(((latest - prev) / prev * 100).toFixed(2)) : 0;
      return { category, years, growth, latestTotal: latest };
    }).sort((a, b) => b.latestTotal - a.latestTotal).slice(0, 20);
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/audit-logs', authenticateToken, (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Insufficient permissions.' });
    const { page = 1, limit = 50 } = req.query;
    const logs = db.getAll('audit_logs').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = logs.length;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const paged = logs.slice(offset, offset + parseInt(limit));
    // Enrich with user data
    const users = db.getAll('users');
    const enriched = paged.map(log => {
      const user = users.find(u => u.id === log.user_id);
      return { ...log, username: user?.username, full_name: user?.full_name };
    });
    res.json({ logs: enriched, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

module.exports = router;

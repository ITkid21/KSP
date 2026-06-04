const express = require('express');
const db = require('../models/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

const MONTH_ORDER = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

router.get('/records', authenticateToken, (req, res) => {
  try {
    const { year, month, major_head, page = 1, limit = 100 } = req.query;
    let records = db.getAll('crime_records');
    if (year) records = records.filter(r => r.year === parseInt(year));
    if (month) records = records.filter(r => r.month === month.toUpperCase());
    if (major_head) records = records.filter(r => r.major_head && r.major_head.toLowerCase().includes(major_head.toLowerCase()));
    const total = records.length;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    records = records.slice(offset, offset + parseInt(limit));
    res.json({ records, total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/summary', authenticateToken, (req, res) => {
  try {
    const records = db.getAll('crime_records');
    const locations = db.getAll('crime_locations');
    const hotspots = db.getAll('hotspots');

    const totalCrimes = records.reduce((s, r) => s + (r.current_month_count || 0), 0);

    // Crime by year
    const yearMap = {};
    records.forEach(r => { yearMap[r.year] = (yearMap[r.year] || 0) + (r.current_month_count || 0); });
    const crimeByYear = Object.entries(yearMap).map(([year, total]) => ({ year: parseInt(year), total })).sort((a, b) => a.year - b.year);

    let growthPercent = 0;
    if (crimeByYear.length >= 2) {
      const last = crimeByYear[crimeByYear.length - 1].total;
      const prev = crimeByYear[crimeByYear.length - 2].total;
      growthPercent = prev > 0 ? parseFloat(((last - prev) / prev * 100).toFixed(2)) : 0;
    }

    const highRiskDistricts = new Set(locations.filter(l => l.overall_risk === 'critical' || l.overall_risk === 'high').map(l => l.district));
    const activeHotspots = hotspots.filter(h => h.is_active !== 0).length;

    // Most common crime
    const crimeMap = {};
    records.forEach(r => { if (r.major_head) crimeMap[r.major_head] = (crimeMap[r.major_head] || 0) + (r.current_month_count || 0); });
    const sortedCrimes = Object.entries(crimeMap).sort((a, b) => b[1] - a[1]);
    const mostCommon = sortedCrimes[0] || ['N/A', 0];

    // Most dangerous
    const dangerousEntries = Object.entries(crimeMap).filter(([k]) => k.includes('Murder') || k.includes('MURDER'));
    const mostDangerous = dangerousEntries.sort((a, b) => b[1] - a[1])[0] || ['Murder', 0];

    res.json({
      totalCrimes, crimeGrowthPercent: growthPercent, highRiskZones: highRiskDistricts.size,
      activeHotspots, mostCommonCrime: mostCommon[0], mostCommonCrimeCount: mostCommon[1],
      mostDangerousCrime: mostDangerous[0], mostDangerousCrimeCount: mostDangerous[1], crimeByYear
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/by-month', authenticateToken, (req, res) => {
  try {
    const { year } = req.query;
    let records = db.getAll('crime_records');
    if (year) records = records.filter(r => r.year === parseInt(year));
    const monthMap = {};
    records.forEach(r => {
      const key = `${r.year}-${r.month}`;
      if (!monthMap[key]) monthMap[key] = { month: r.month, year: r.year, total: 0 };
      monthMap[key].total += (r.current_month_count || 0);
    });
    const data = Object.values(monthMap).sort((a, b) => a.year - b.year || (MONTH_ORDER[a.month] || 0) - (MONTH_ORDER[b.month] || 0));
    res.json(data);
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/by-category', authenticateToken, (req, res) => {
  try {
    const { year, limit = 15 } = req.query;
    let records = db.getAll('crime_records');
    if (year) records = records.filter(r => r.year === parseInt(year));
    const catMap = {};
    records.forEach(r => { if (r.major_head) catMap[r.major_head] = (catMap[r.major_head] || 0) + (r.current_month_count || 0); });
    const data = Object.entries(catMap).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total).slice(0, parseInt(limit));
    res.json(data);
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/growth-trends', authenticateToken, (req, res) => {
  try {
    const records = db.getAll('crime_records');
    const yearMap = {};
    records.forEach(r => { yearMap[r.year] = (yearMap[r.year] || 0) + (r.current_month_count || 0); });
    const data = Object.entries(yearMap).map(([year, total]) => ({ year: parseInt(year), total })).sort((a, b) => a.year - b.year);
    const trends = data.map((item, i) => {
      const growth = i > 0 && data[i - 1].total > 0 ? parseFloat(((item.total - data[i - 1].total) / data[i - 1].total * 100).toFixed(2)) : 0;
      return { ...item, growth };
    });
    res.json(trends);
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/district-wise', authenticateToken, (req, res) => {
  try {
    const locations = db.getAll('crime_locations');
    const distMap = {};
    locations.forEach(l => {
      if (!distMap[l.district]) distMap[l.district] = { district: l.district, overall_risk: l.overall_risk, total_cases: 0, crime_types: 0, types: new Set() };
      distMap[l.district].total_cases += (l.cases || 0);
      distMap[l.district].types.add(l.crime_type);
    });
    const data = Object.values(distMap).map(d => ({ ...d, crime_types: d.types.size, types: undefined })).sort((a, b) => b.total_cases - a.total_cases);
    res.json(data);
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/years', authenticateToken, (req, res) => {
  try {
    const years = [...new Set(db.getAll('crime_records').map(r => r.year))].sort();
    res.json(years);
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/major-heads', authenticateToken, (req, res) => {
  try {
    const heads = [...new Set(db.getAll('crime_records').map(r => r.major_head).filter(Boolean))].sort();
    res.json(heads);
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

module.exports = router;

const express = require('express');
const db = require('../models/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.get('/monthly', authenticateToken, (req, res) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'Year and month required.' });
    const data = db.prepare(
      'SELECT major_head, minor_head, current_month_count, previous_month_count, current_year_total FROM crime_records WHERE year = ? AND month = ? AND current_month_count > 0 ORDER BY current_month_count DESC'
    ).all(parseInt(year), month.toUpperCase());
    const total = data.reduce((s, d) => s + d.current_month_count, 0);
    res.json({ data, total, year: parseInt(year), month: month.toUpperCase() });
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/yearly', authenticateToken, (req, res) => {
  try {
    const { year } = req.query;
    if (!year) return res.status(400).json({ error: 'Year required.' });
    const data = db.prepare(
      'SELECT major_head, SUM(current_month_count) as total FROM crime_records WHERE year = ? GROUP BY major_head HAVING total > 0 ORDER BY total DESC'
    ).all(parseInt(year));
    const grandTotal = data.reduce((s, d) => s + d.total, 0);
    res.json({ data, grandTotal, year: parseInt(year) });
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/district', authenticateToken, (req, res) => {
  try {
    const { district } = req.query;
    if (!district) return res.status(400).json({ error: 'District required.' });
    const data = db.prepare(
      'SELECT * FROM crime_locations WHERE district = ? ORDER BY cases DESC'
    ).all(district);
    const total = data.reduce((s, d) => s + d.cases, 0);
    res.json({ data, total, district });
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/category', authenticateToken, (req, res) => {
  try {
    const { category } = req.query;
    if (!category) return res.status(400).json({ error: 'Category required.' });
    const data = db.prepare(
      'SELECT year, month, SUM(current_month_count) as total FROM crime_records WHERE major_head LIKE ? GROUP BY year, month ORDER BY year, CASE month WHEN "JAN" THEN 1 WHEN "FEB" THEN 2 WHEN "MAR" THEN 3 WHEN "APR" THEN 4 WHEN "MAY" THEN 5 WHEN "JUN" THEN 6 WHEN "JUL" THEN 7 WHEN "AUG" THEN 8 WHEN "SEP" THEN 9 WHEN "OCT" THEN 10 WHEN "NOV" THEN 11 WHEN "DEC" THEN 12 END'
    ).all(`%${category}%`);
    res.json({ data, category });
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

module.exports = router;

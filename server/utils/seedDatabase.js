const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const db = require('../models/database');

function seedUsers() {
  console.log('Seeding users...');
  if (db.count('users') > 0) { console.log('Users exist, skipping.'); return; }
  const users = [
    { id: uuidv4(), username: 'admin', email: 'admin@ksp.gov.in', password_hash: bcrypt.hashSync('admin123', 12), full_name: 'System Administrator', role: 'super_admin', department: 'IT Cell', badge_number: 'KSP-ADMIN-001', is_active: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: uuidv4(), username: 'officer1', email: 'officer1@ksp.gov.in', password_hash: bcrypt.hashSync('officer123', 12), full_name: 'Inspector Rajesh Kumar', role: 'officer', department: 'Bengaluru City', badge_number: 'KSP-BLR-1042', is_active: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: uuidv4(), username: 'analyst1', email: 'analyst1@ksp.gov.in', password_hash: bcrypt.hashSync('analyst123', 12), full_name: 'Dr. Priya Sharma', role: 'analyst', department: 'Crime Analytics Division', badge_number: 'KSP-CAD-201', is_active: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  ];
  db.insertMany('users', users);
  console.log(`Seeded ${users.length} users.`);
}

function seedCrimeLocations() {
  console.log('Seeding crime locations...');
  if (db.count('crime_locations') > 0) { console.log('Locations exist, skipping.'); return; }
  const csvPath = path.resolve(__dirname, '..', 'data', 'karnataka_crime_district_flat.csv');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map(p => p.trim().replace(/\r/g, ''));
    if (parts.length >= 7) {
      rows.push({ id: i, district: parts[0], latitude: parseFloat(parts[1]), longitude: parseFloat(parts[2]), overall_risk: parts[3], crime_type: parts[4], cases: parseInt(parts[5]) || 0, severity: parts[6], created_at: new Date().toISOString() });
    }
  }
  db.insertMany('crime_locations', rows);
  console.log(`Seeded ${rows.length} crime locations.`);
}

function seedCrimeRecords() {
  console.log('Seeding crime records (this takes a moment)...');
  if (db.count('crime_records') > 0) { console.log('Records exist, skipping.'); return; }
  const csvPath = path.resolve(__dirname, '..', 'data', 'crime_review.csv');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const rows = [];
  let id = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const parts = [];
    let current = '', inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === ',' && !inQuotes) { parts.push(current.trim().replace(/\r/g, '')); current = ''; }
      else current += ch;
    }
    parts.push(current.trim().replace(/\r/g, ''));
    if (parts.length >= 10) {
      const year = parseInt(parts[9]) || 0;
      const month = (parts[8] || '').toUpperCase();
      if (year > 0 && month) {
        id++;
        rows.push({ id, sl_no: parseInt(parts[0]) || 0, act: parts[1], major_head: parts[2], minor_head: parts[3], current_year_total: parseInt(parts[4]) || 0, previous_year_total: parseInt(parts[5]) || 0, previous_month_count: parseInt(parts[6]) || 0, current_month_count: parseInt(parts[7]) || 0, month, year });
      }
    }
  }
  db.insertMany('crime_records', rows);
  console.log(`Seeded ${rows.length} crime records.`);
}

function seedHotspots() {
  console.log('Generating hotspots...');
  if (db.count('hotspots') > 0) { console.log('Hotspots exist, skipping.'); return; }
  const locations = db.getAll('crime_locations');
  const rows = locations.map((loc, i) => {
    const riskLevel = loc.severity === 'critical' ? 'critical' : loc.severity === 'high' ? 'high' : loc.severity === 'medium' ? 'moderate' : 'low';
    const riskScore = loc.severity === 'critical' ? 0.9 : loc.severity === 'high' ? 0.7 : loc.severity === 'medium' ? 0.5 : 0.3;
    const radius = (loc.cases || 0) > 5000 ? 15 : (loc.cases || 0) > 2000 ? 10 : 7;
    return { id: i + 1, district: loc.district, latitude: loc.latitude + (Math.random() - 0.5) * 0.02, longitude: loc.longitude + (Math.random() - 0.5) * 0.02, crime_type: loc.crime_type, risk_level: riskLevel, risk_score: riskScore, incident_count: loc.cases || 0, radius_km: radius, is_active: 1, created_at: new Date().toISOString() };
  });
  db.insertMany('hotspots', rows);
  console.log(`Generated ${rows.length} hotspots.`);
}

console.log('=== KSP Crime Intelligence Platform - Database Seeder ===\n');
seedUsers();
seedCrimeLocations();
seedCrimeRecords();
seedHotspots();
console.log('\n=== Seeding complete! ===');
console.log('Default login: admin / admin123');

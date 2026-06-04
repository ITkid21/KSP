const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../models/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'ksp_crime_intel_default_secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '24h';

router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

    const user = db.findOne('users', u => u.username === username && u.is_active !== 0);
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

    if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials.' });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, full_name: user.full_name }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    db.update('users', u => u.id === user.id, { last_login: new Date().toISOString() });
    db.insert('sessions', { id: uuidv4(), user_id: user.id, token, expires_at: new Date(Date.now() + 86400000).toISOString(), created_at: new Date().toISOString() });
    db.insert('audit_logs', { id: uuidv4(), user_id: user.id, action: 'LOGIN', resource: 'auth', details: 'User logged in', ip_address: req.ip, created_at: new Date().toISOString() });

    res.json({ token, user: { id: user.id, username: user.username, email: user.email, full_name: user.full_name, role: user.role, department: user.department, badge_number: user.badge_number } });
  } catch (err) { console.error('Login error:', err); res.status(500).json({ error: 'Internal server error.' }); }
});

router.post('/register', authenticateToken, authorizeRoles('super_admin'), (req, res) => {
  try {
    const { username, email, password, full_name, role, department, badge_number, phone } = req.body;
    if (!username || !email || !password || !full_name) return res.status(400).json({ error: 'Required: username, email, password, full_name.' });

    if (db.findOne('users', u => u.username === username || u.email === email)) return res.status(409).json({ error: 'Username or email exists.' });

    const id = uuidv4();
    db.insert('users', { id, username, email, password_hash: bcrypt.hashSync(password, 12), full_name, role: role || 'officer', department, badge_number, phone, is_active: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    db.insert('audit_logs', { id: uuidv4(), user_id: req.user.id, action: 'CREATE_USER', resource: 'users', resource_id: id, details: `Created user: ${username}`, created_at: new Date().toISOString() });

    res.status(201).json({ message: 'User created.', userId: id });
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = db.findOne('users', u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const { password_hash, ...safe } = user;
    res.json(safe);
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.post('/logout', authenticateToken, (req, res) => {
  try {
    db.remove('sessions', s => s.user_id === req.user.id);
    db.insert('audit_logs', { id: uuidv4(), user_id: req.user.id, action: 'LOGOUT', resource: 'auth', details: 'Logged out', created_at: new Date().toISOString() });
    res.json({ message: 'Logged out.' });
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.get('/users', authenticateToken, authorizeRoles('super_admin'), (req, res) => {
  try {
    const users = db.getAll('users').map(({ password_hash, ...u }) => u).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(users);
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.put('/users/:id', authenticateToken, authorizeRoles('super_admin'), (req, res) => {
  try {
    const { full_name, role, department, badge_number, phone, is_active } = req.body;
    const user = db.findOne('users', u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const updates = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (role !== undefined) updates.role = role;
    if (department !== undefined) updates.department = department;
    if (badge_number !== undefined) updates.badge_number = badge_number;
    if (phone !== undefined) updates.phone = phone;
    if (is_active !== undefined) updates.is_active = is_active;
    updates.updated_at = new Date().toISOString();

    db.update('users', u => u.id === req.params.id, updates);
    db.insert('audit_logs', { id: uuidv4(), user_id: req.user.id, action: 'UPDATE_USER', resource: 'users', resource_id: req.params.id, details: `Updated user`, created_at: new Date().toISOString() });
    res.json({ message: 'User updated.' });
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

router.delete('/users/:id', authenticateToken, authorizeRoles('super_admin'), (req, res) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself.' });
    db.update('users', u => u.id === req.params.id, { is_active: 0 });
    res.json({ message: 'User deactivated.' });
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

module.exports = router;

/**
 * Lightweight JSON-file database for KSP Crime Intelligence Platform.
 * Drop-in replacement that avoids native compilation requirements.
 * Each "table" is stored as a JSON file in ./data/db/
 */
const fs = require('fs');
const path = require('path');

const DB_DIR = path.resolve(__dirname, '..', 'data', 'db');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

class JsonDB {
  constructor() {
    this.cache = {};
    this.tables = [
      'users', 'audit_logs', 'crime_records', 'crime_locations',
      'hotspots', 'predictions', 'reports', 'crime_trends',
      'ai_insights', 'ml_outputs', 'sessions',
      'cases', 'documents', 'document_chunks', 'copilot_chats', 'copilot_caches'
    ];
    this.tables.forEach(t => this._load(t));
  }

  _filePath(table) { return path.join(DB_DIR, `${table}.json`); }

  _load(table) {
    const fp = this._filePath(table);
    if (fs.existsSync(fp)) {
      try { this.cache[table] = JSON.parse(fs.readFileSync(fp, 'utf-8')); }
      catch { this.cache[table] = []; }
    } else {
      this.cache[table] = [];
    }
  }

  _save(table) {
    try {
      fs.writeFileSync(this._filePath(table), JSON.stringify(this.cache[table]), 'utf-8');
    } catch (err) {
      console.warn(`[JsonDB] Failed to persist table "${table}" (running in read-only environment, changes will remain in-memory):`, err.message);
    }
  }

  getAll(table) { return this.cache[table] || []; }

  find(table, predicate) { return (this.cache[table] || []).filter(predicate); }

  findOne(table, predicate) { return (this.cache[table] || []).find(predicate); }

  insert(table, record) {
    if (!this.cache[table]) this.cache[table] = [];
    this.cache[table].push(record);
    this._save(table);
    return record;
  }

  insertMany(table, records) {
    if (!this.cache[table]) this.cache[table] = [];
    this.cache[table].push(...records);
    this._save(table);
    return records;
  }

  update(table, predicate, updates) {
    let updated = 0;
    (this.cache[table] || []).forEach((item, idx) => {
      if (predicate(item)) {
        this.cache[table][idx] = { ...item, ...updates };
        updated++;
      }
    });
    if (updated > 0) this._save(table);
    return updated;
  }

  remove(table, predicate) {
    const before = (this.cache[table] || []).length;
    this.cache[table] = (this.cache[table] || []).filter(item => !predicate(item));
    const removed = before - this.cache[table].length;
    if (removed > 0) this._save(table);
    return removed;
  }

  clear(table) {
    this.cache[table] = [];
    this._save(table);
  }

  count(table, predicate) {
    if (!predicate) return (this.cache[table] || []).length;
    return (this.cache[table] || []).filter(predicate).length;
  }

  aggregate(table, groupKey, sumKey) {
    const result = {};
    (this.cache[table] || []).forEach(item => {
      const key = typeof groupKey === 'function' ? groupKey(item) : item[groupKey];
      if (!result[key]) result[key] = 0;
      result[key] += (typeof sumKey === 'function' ? sumKey(item) : (item[sumKey] || 0));
    });
    return result;
  }

  groupBy(table, keyFn) {
    const result = {};
    (this.cache[table] || []).forEach(item => {
      const key = keyFn(item);
      if (!result[key]) result[key] = [];
      result[key].push(item);
    });
    return result;
  }
}

const db = new JsonDB();
module.exports = db;

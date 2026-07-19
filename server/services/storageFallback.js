/**
 * Local Storage Fallback
 *
 * This file is used when Catalyst SDK cannot be initialized.
 * It provides a minimal JSON-backed fallback for Catalyst Data Store
 * operations required by import and pipeline flows.
 */

const db = require('../models/database');

function notImplemented(operation) {
    throw new Error(
        `[storageFallback] ${operation} is not implemented. Catalyst SDK was unavailable, so the application attempted to use the local fallback.`
    );
}

function trimQuotes(value) {
    if (!value || typeof value !== 'string') return value;
    return value.slice(1, -1).replace(/''/g, "'").replace(/""/g, '"');
}

function parseValue(raw) {
    if (raw === undefined || raw === null) return raw;
    let value = String(raw).trim();
    if (value.endsWith(';')) {
        value = value.slice(0, -1).trim();
    }
    const lower = value.toLowerCase();

    if (lower === 'true') return true;
    if (lower === 'false') return false;
    if (lower === 'null') return null;

    if (/^'.*'$/.test(value) || /^".*"$/.test(value)) {
        return trimQuotes(value);
    }

    if (/^-?\d+(?:\.\d+)?$/.test(value)) {
        return Number(value);
    }

    return value;
}

function normalizeTableName(table) {
    if (!table || typeof table !== 'string') return table;
    if (table.toLowerCase() === 'system_users') return 'users';
    return table;
}

function parseConditions(whereClause) {
    if (!whereClause) return [];

    return whereClause
        .split(/\s+AND\s+/i)
        .map(condition => {
            const match = condition.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
            if (!match) {
                throw new Error(`[storageFallback] Unsupported WHERE clause: ${condition}`);
            }
            return { field: match[1], value: parseValue(match[2]) };
        });
}

function matchesConditions(row, conditions) {
    return conditions.every(({ field, value }) => {
        if (!Object.prototype.hasOwnProperty.call(row, field)) return false;
        const actual = row[field];
        if (value === null || value === undefined) {
            return actual === value;
        }
        if (typeof value === 'boolean' && typeof actual === 'number') {
            return actual === (value ? 1 : 0);
        }
        if (typeof value === 'number' && typeof actual === 'boolean') {
            return (actual ? 1 : 0) === value;
        }
        return String(actual) === String(value);
    });
}

function parseAssignments(assignClause) {
    return assignClause.split(/\s*,\s*/).reduce((acc, part) => {
        const match = part.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
        if (!match) {
            throw new Error(`[storageFallback] Unsupported SET expression: ${part}`);
        }
        acc[match[1]] = parseValue(match[2]);
        return acc;
    }, {});
}

async function executeQuery(req, query) {
    if (!query || typeof query !== 'string') {
        throw new Error('[storageFallback] executeQuery requires a SQL string.');
    }

    const trimmed = query.trim().replace(/\s+/g, ' ');

    const selectMatch = trimmed.match(/^SELECT \* FROM ([A-Za-z_][A-Za-z0-9_]*)(?: WHERE (.+))?;?$/i);
    if (selectMatch) {
        const requestedTable = selectMatch[1];
        const table = normalizeTableName(requestedTable);
        const conditions = parseConditions(selectMatch[2]);
        const rows = db.getAll(table).filter(row => matchesConditions(row, conditions));
        return rows.map(row => ({ [requestedTable]: row }));
    }

    const deleteMatch = trimmed.match(/^DELETE FROM ([A-Za-z_][A-Za-z0-9_]*)(?: WHERE (.+))?;?$/i);
    if (deleteMatch) {
        const table = normalizeTableName(deleteMatch[1]);
        const conditions = parseConditions(deleteMatch[2]);
        if (conditions.length === 0) {
            db.clear(table);
        } else {
            db.remove(table, row => matchesConditions(row, conditions));
        }
        return [];
    }

    const updateMatch = trimmed.match(/^UPDATE ([A-Za-z_][A-Za-z0-9_]*) SET (.+?) WHERE (.+);?$/i);
    if (updateMatch) {
        const table = normalizeTableName(updateMatch[1]);
        const assignments = parseAssignments(updateMatch[2]);
        const conditions = parseConditions(updateMatch[3]);
        db.update(table, row => matchesConditions(row, conditions), assignments);
        return [];
    }

    throw new Error(`[storageFallback] Unsupported SQL query: ${query}`);
}

async function insertRow(req, tableName, rowData) {
    if (!tableName || typeof tableName !== 'string') {
        throw new Error('[storageFallback] insertRow requires a table name.');
    }
    if (!rowData || typeof rowData !== 'object') {
        throw new Error('[storageFallback] insertRow requires rowData object.');
    }
    return db.insert(normalizeTableName(tableName), rowData);
}

async function addRows(req, tableName, rows) {
    if (!tableName || typeof tableName !== 'string') {
        throw new Error('[storageFallback] addRows requires a table name.');
    }
    if (!Array.isArray(rows)) {
        throw new Error('[storageFallback] addRows requires an array of rows.');
    }
    return db.insertMany(normalizeTableName(tableName), rows);
}

async function updateRow(req, tableName, rowData) {
    if (!tableName || typeof tableName !== 'string') {
        throw new Error('[storageFallback] updateRow requires a table name.');
    }
    if (!rowData || typeof rowData !== 'object') {
        throw new Error('[storageFallback] updateRow requires rowData object.');
    }

    const normalizedTable = normalizeTableName(tableName);
    const key = rowData.ROWID !== undefined ? 'ROWID' : (rowData.id !== undefined ? 'id' : null);
    if (!key) {
        throw new Error('[storageFallback] updateRow requires either ROWID or id in rowData.');
    }

    const updated = db.update(normalizedTable, item => String(item[key]) === String(rowData[key]), rowData);
    if (updated === 0) {
        throw new Error(`[storageFallback] updateRow failed to find row in ${normalizedTable} by ${key} = ${rowData[key]}`);
    }

    return rowData;
}

module.exports = {
    executeQuery,
    insertRow,
    addRows,
    updateRow
};

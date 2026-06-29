'use strict';

/**
 * Service for validating crime data records during ingestion.
 * 
 * Example Usage 1 (Valid Record):
 * const record = {
 *   crime_id: 'C-2023-001',
 *   crime_type: 'Theft',
 *   latitude: 12.9716,
 *   longitude: 77.5946,
 *   severity: 3,
 *   district: 'Central'
 * };
 * const result = validateCrimeRecord(record);
 * // result: { valid: true, errors: [] }
 * 
 * Example Usage 2 (Invalid Record):
 * const invalidRecord = {
 *   crime_type: 'Unknown',
 *   latitude: 100, // Invalid latitude
 *   severity: 6,   // Out of range
 *   district: ''
 * };
 * const result = validateCrimeRecord(invalidRecord);
 * // result: { valid: false, errors: ['Missing or invalid crime_id.', ...] }
 */

const VALID_CRIME_TYPES = ['Theft', 'Robbery', 'Assault', 'Fraud', 'Burglary'];

/**
 * Validates a single crime record against business rules.
 *
 * @param {Object} record - The crime record object to validate.
 * @returns {{ valid: boolean, errors: string[] }} Validation result containing validity status and an array of error messages.
 */
function validateCrimeRecord(record) {
  const errors = [];

  if (!record || typeof record !== 'object') {
    return { valid: false, errors: ['Record must be a valid object.'] };
  }

  // crime_id -> required string
  if (!record.crime_id || typeof record.crime_id !== 'string' || record.crime_id.trim() === '') {
    errors.push('Missing or invalid crime_id. It must be a non-empty string.');
  }

  // crime_type -> required, one of: Theft, Robbery, Assault, Fraud, Burglary
  if (!record.crime_type || !VALID_CRIME_TYPES.includes(record.crime_type)) {
    errors.push(`Invalid crime_type. Must be one of: ${VALID_CRIME_TYPES.join(', ')}.`);
  }

  // latitude -> number between -90 and 90
  const lat = Number(record.latitude);
  if (isNaN(lat) || lat < -90 || lat > 90) {
    errors.push('Invalid latitude. It must be a number between -90 and 90.');
  }

  // longitude -> number between -180 and 180
  const lng = Number(record.longitude);
  if (isNaN(lng) || lng < -180 || lng > 180) {
    errors.push('Invalid longitude. It must be a number between -180 and 180.');
  }

  // severity -> integer between 1 and 5
  const severity = Number(record.severity);
  if (!Number.isInteger(severity) || severity < 1 || severity > 5) {
    errors.push('Invalid severity. It must be an integer between 1 and 5.');
  }

  // district -> required string
  if (!record.district || typeof record.district !== 'string' || record.district.trim() === '') {
    errors.push('Missing or invalid district. It must be a non-empty string.');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  validateCrimeRecord
};

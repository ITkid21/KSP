'use strict';

const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'ksp_crime_intel_platform_secret_key_2024_secure';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Sign a JWT payload and return a token string.
 * @param {Object} payload - Data to embed in the token
 * @returns {string} signed JWT
 */
function sign(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

/**
 * Verify a JWT token and return the decoded payload.
 * Throws if the token is invalid or expired.
 * @param {string} token
 * @returns {Object} decoded payload
 */
function verify(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Decode a JWT without verifying signature.
 * Useful for reading expiry info without throwing on expired tokens.
 * @param {string} token
 * @returns {Object|null} decoded payload
 */
function decode(token) {
  return jwt.decode(token);
}

/**
 * Returns the expiry Date object from a token payload.
 * @param {string} token
 * @returns {Date|null}
 */
function getExpiry(token) {
  const decoded = decode(token);
  if (!decoded || !decoded.exp) return null;
  return new Date(decoded.exp * 1000);
}

module.exports = { sign, verify, decode, getExpiry };

'use strict';

/**
 * Format a Date object or timestamp into Catalyst supported datetime format (YYYY-MM-DD HH:mm:ss)
 * @param {Date|number|string} [dateVal] 
 * @returns {string|null} formatted datetime string
 */
function getCatalystDatetime(dateVal) {
  const d = dateVal ? new Date(dateVal) : new Date();
  if (isNaN(d.getTime())) return null;

  const pad = (n) => String(n).padStart(2, '0');
  
  const YYYY = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  
  const HH = pad(d.getHours());
  const min = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  
  return `${YYYY}-${MM}-${DD} ${HH}:${min}:${ss}`;
}

module.exports = {
  getCatalystDatetime
};

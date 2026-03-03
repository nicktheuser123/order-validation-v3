/**
 * Shared test utilities used across test suites.
 */

/** Get numeric value from object, trying multiple possible field names */
function getNum(obj, ...keys) {
  if (!obj) return 0;
  for (const k of keys) {
    const v = obj[k];
    if (v != null && v !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return 0;
}

/** Round to 2 decimal places */
function roundTo2(num) {
  return Math.round(num * 100) / 100;
}

module.exports = { getNum, roundTo2 };

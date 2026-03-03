/**
 * Test results logger - records step-level detail for the markdown report.
 * Import in test files and call step() / fieldCalculation() inside it() blocks.
 * Dynamic data (IDs, amounts, line items) passed in details will appear in test-results.md.
 *
 * Uses a file store so data from Jest workers reaches the reporter in the main process.
 */

const fs = require("fs");
const path = require("path");

const STEPS_FILE = path.join(process.cwd(), ".jest-test-steps.json");

function loadStore() {
  try {
    const raw = fs.readFileSync(STEPS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveStore(data) {
  fs.writeFileSync(STEPS_FILE, JSON.stringify(data), "utf8");
}

function getKey() {
  try {
    const state = expect.getState();
    const testPath = path.normalize(state.testPath || "");
    const currentTestName = (state.currentTestName || "").trim();
    if (!testPath || !currentTestName) return null;
    return `${testPath}::${currentTestName}`;
  } catch {
    return null;
  }
}

function getOrCreateEntry(store, key) {
  if (!store[key]) {
    store[key] = { steps: [], fieldCalculations: [] };
  }
  return store[key];
}

/**
 * Record a validation step. Include dynamic data in details so it appears in the report.
 * @param {string} description - Plain-language step description (e.g. "Fetched Order from API")
 * @param {object} [details] - Optional key-value pairs; values shown in markdown (e.g. { orderItemValue: 78 })
 */
function step(description, details = null) {
  const key = getKey();
  if (!key) return;
  const store = loadStore();
  const entry = getOrCreateEntry(store, key);
  entry.steps.push({ description, details });
  saveStore(store);
}

/**
 * Record a field calculation breakdown for assertions on computed fields.
 * @param {string} fieldName - Name of the field being validated
 * @param {object} opts - { steps: [{ description, detail? }], expected, actual }
 */
function fieldCalculation(fieldName, opts) {
  const key = getKey();
  if (!key) return;
  const store = loadStore();
  const entry = getOrCreateEntry(store, key);
  entry.fieldCalculations.push({ fieldName, ...opts });
  saveStore(store);
}

/**
 * Get recorded steps for a test. Used by the markdown reporter.
 * @param {string} testPath - Full path to the test file
 * @param {string} fullName - Full test name (ancestorTitles + title)
 */
function getStepsForTest(testPath, fullName) {
  const normalizedPath = path.normalize(testPath || "");
  const normalizedName = (fullName || "").trim();
  const key = `${normalizedPath}::${normalizedName}`;
  const store = loadStore();
  return store[key] || { steps: [], fieldCalculations: [] };
}

/**
 * Clear stored data and remove the file. Called by reporter at run start and end.
 */
function clear() {
  try {
    if (fs.existsSync(STEPS_FILE)) {
      fs.unlinkSync(STEPS_FILE);
    }
  } catch {
    // ignore
  }
}

module.exports = {
  step,
  fieldCalculation,
  getStepsForTest,
  clear
};

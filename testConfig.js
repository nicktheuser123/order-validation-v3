/** Shared test configuration - single source of truth for ORDER_ID used across test suites */
const ORDER_ID = "1771672992747x483733468340289540";

/** Set to false to skip the order validation test suite */
const RUN_ORDER_TESTS = true;

/** Set to false to skip the reporting daily validation test suite */
const RUN_REPORTING_DAILY_TESTS = true;

module.exports = { ORDER_ID, RUN_ORDER_TESTS, RUN_REPORTING_DAILY_TESTS };

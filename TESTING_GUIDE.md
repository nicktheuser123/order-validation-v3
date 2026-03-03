# Testing Guide

**This document is the single source of truth** for how this repo is structured. When a user asks an AI to create a test case for a domain (orders, subscriptions, etc.), the AI must read this guide and follow the schemas and templates below.

---

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment**
   - Copy `.env.example` to `.env`
   - Add your Bubble API credentials: `BUBBLE_API_BASE` and `BUBBLE_API_TOKEN`

3. **Create test suites**
   - This repo ships with no test suites. Ask an AI: "Create a test case for [your domain]" (e.g. orders, subscriptions).
   - The AI will add config to `testConfig.js`, create `tests/{domain}.test.js`, and `lib/{domain}Calculator.js` or `lib/{domain}Aggregator.js` following the templates in this guide.

4. **Run tests**
   ```bash
   npm test
   ```

   To run a single suite: `npm test -- {domain}.test.js`

---

## Folder Structure

```
order-validation-v3/
├── testConfig.js           # Dynamically generated - add keys when adding test suites
├── lib/                    # Calculation logic
│   ├── testUtils.js        # Shared helpers (getNum, roundTo2) - do not remove
│   ├── {domain}Calculator.js   # Per-domain: pure calculation from fetched data
│   └── {domain}Aggregator.js  # Per-domain: aggregate multiple records (optional)
├── tests/
│   └── {domain}.test.js    # One file per domain
├── bubbleClient.js         # Bubble API client - do not modify
├── logger.js               # Logging helpers
├── jest.config.js
├── jest.setup.js
└── TESTING_GUIDE.md        # This file - canonical spec
```

---

## 1. testConfig.js Schema

testConfig.js is **dynamically generated**. It starts empty. For **each new test suite** you add, the AI must add the following and export them.

### Per-Suite Config Keys

For a suite named `{domain}` (e.g. `order`, `subscription`, `reportingDaily`):

```javascript
/** Set to false to skip this test suite */
const RUN_{SUITE_NAME}_TESTS = true;

/** Primary entity ID - used to fetch the record(s) this suite validates */
const {ENTITY}_ID = "";  // e.g. ORDER_ID, SUBSCRIPTION_ID

/** Optional: validate multiple entities. Use empty array if not needed. */
const {ENTITY}_IDS = [];

/** Bubble data type names. Add a key for every type this suite fetches. */
const TYPES = {
  {ENTITY}: "YourBubbleTypeName",
  // Add all related types, e.g. ADD_ON, TICKET_TYPE, PROMOTION, etc.
};
```

**Naming rules:**
- `RUN_{SUITE}_TESTS`: Use the suite name in UPPER_SNAKE_CASE (e.g. `RUN_ORDER_TESTS`, `RUN_SUBSCRIPTION_TESTS`)
- `{ENTITY}_ID`: The primary Bubble type this suite validates (e.g. `ORDER_ID`, `SUBSCRIPTION_ID`)
- `TYPES`: Keys are UPPER_SNAKE_CASE; values must be **Bubble Data API type names** (see Section 9)

### Module Exports

Every config key must be exported:

```javascript
module.exports = {
  RUN_{SUITE}_TESTS,
  {ENTITY}_ID,
  {ENTITY}_IDS,
  TYPES
};
```

When adding a second suite, merge into the exports:

```javascript
module.exports = {
  RUN_ORDER_TESTS,
  ORDER_ID,
  ORDER_IDS,
  RUN_REPORTING_DAILY_TESTS,
  TYPES  // TYPES is shared; add keys for all suites
};
```

### AI Instruction

When creating a new test suite, add the corresponding config keys and export them. **Do not add keys for suites that do not exist.**

---

## 2. Test File Template

File: `tests/{domain}.test.js`

### Structure

1. **Imports:** `bubbleClient`, `lib/{domain}Calculator` or `lib/{domain}Aggregator`, `testConfig`
2. **Module-level variables:** Store fetched data and calculation result
3. **beforeAll:** Check flag, validate ID, fetch data, call calculator/aggregator, store result
4. **describe block:** Use `(RUN_* ? describe : describe.skip)` so suite is skippable
5. **it blocks:** One per assertion

### Minimal Template

```javascript
const { getThing, searchThings } = require("../bubbleClient");
const { calculate{Domain} } = require("../lib/{domain}Calculator");
const { {ENTITY}_ID, RUN_{SUITE}_TESTS, TYPES } = require("../testConfig");

let entity;
let result;

beforeAll(async () => {
  if (!RUN_{SUITE}_TESTS) return;
  if (!{ENTITY}_ID) {
    throw new Error("Set {ENTITY}_ID in testConfig.js to run this suite");
  }

  entity = await getThing(TYPES.{ENTITY}, {ENTITY}_ID);

  // Fetch related data as needed for your domain
  // const related = await getThing(TYPES.RELATED, entity.relatedId);

  result = calculate{Domain}({
    entity,
    // ... other params
  });
}, 120000);

(RUN_{SUITE}_TESTS ? describe : describe.skip)("{Suite} validation", () => {
  it("validates field A", () => {
    expect(entity["Field A"]).toBe(result.fieldA);
  });

  it("validates field B", () => {
    expect(entity["Field B"]).toBeCloseTo(result.fieldB, 2);
  });
});
```

### beforeAll Pattern (4 steps)

1. **Check flag:** `if (!RUN_{SUITE}_TESTS) return;`
2. **Validate ID:** `if (!{ENTITY}_ID) throw new Error(...);`
3. **Fetch data:** Use `getThing(type, id)` and/or `searchThings(type, constraints)` from bubbleClient
4. **Calculate and store:** Call calculator/aggregator, assign to module-level variable

### describe Skip Pattern

```javascript
(RUN_{SUITE}_TESTS ? describe : describe.skip)("{Suite} validation", () => { ... });
```

### Assertion Patterns

- Exact match: `expect(actual).toBe(expected)`
- Numeric with tolerance: `expect(actual).toBeCloseTo(expected, 2)`

---

## 3. Calculator Module Template

File: `lib/{domain}Calculator.js`

### Purpose

Pure calculation. Given fetched Bubble data, return computed values. **No Bubble API calls.**

### Signature

```javascript
function calculate{Domain}({ param1, param2, ... }) {
  // ... calculation logic
  return { field1, field2, ... };
}
```

### Minimal Template

```javascript
const { money, logSection } = require("../logger");
const { getNum, roundTo2 } = require("./testUtils");

function calculate{Domain}({ entity, relatedData = {} }) {
  // Implement your domain's calculation logic
  const computed = 0; // e.g. sum of prices, apply discounts, etc.

  return {
    field1: computed,
    field2: 0
  };
}

module.exports = { calculate{Domain} };
```

### Rules

- Use `../logger` for `money`, `logSection` if needed
- Use `./testUtils` for `getNum`, `roundTo2`
- Bubble field names (e.g. "Total Amount", "Discount") are schema-specific—use the correct names for your domain
- `TYPES` holds type names; field names stay in code

---

## 4. Aggregator Module Template

File: `lib/{domain}Aggregator.js`

### Purpose

Aggregate data from multiple records and/or reporting tables for comparison. Used when validating sums across many records.

### Signature

```javascript
async function aggregate{Domain}({ records, getThing, ... }) {
  // ... aggregation logic
  return { calculatedSums, tableSums };
}
```

### Minimal Template

```javascript
const { getNum } = require("./testUtils");

async function aggregate{Domain}({
  records,
  reportingEntries,
  getThing
}) {
  let calculatedSums = { total: 0 };
  let tableSums = { total: 0 };

  for (const record of records) {
    // Fetch related data if needed
    // const related = await getThing(TYPES.RELATED, record.relatedId);
    calculatedSums.total += getNum(record, "Amount", "amount_number");
  }

  for (const entry of reportingEntries) {
    tableSums.total += getNum(entry, "Total", "total_number");
  }

  return { calculatedSums, tableSums };
}

module.exports = { aggregate{Domain} };
```

### Rules

- `getThing` is passed in from the test (do not require bubbleClient)
- Use `getNum(obj, ...keys)` to safely read numeric fields (tries multiple field names)
- Return an object the test can use for assertions

---

## 5. Other File Schemas

| File | Schema |
|------|--------|
| **jest.config.js** | Must have `testMatch: ["<rootDir>/tests/**/*.test.js"]`, `testTimeout: 120000`, `maxWorkers: 1`, `passWithNoTests: true`. New test files must live in `tests/` and end in `.test.js`. |
| **lib/testUtils.js** | Shared helpers: `getNum(obj, ...keys)` returns first numeric value found; `roundTo2(num)` rounds to 2 decimals. Add new shared helpers here and document in this guide. |
| **bubbleClient.js** | `getThing(type, id)` fetches one record; `searchThings(type, constraints)` fetches all matching records. Types and IDs come from testConfig.TYPES and *_ID. |
| **.env.example** | Required: `BUBBLE_API_BASE`, `BUBBLE_API_TOKEN`. No app-specific values. |

---

## 6. Naming Conventions

| Item | Pattern | Example |
|------|---------|---------|
| Test file | `{domain}.test.js` | `order.test.js`, `subscription.test.js` |
| Calculator | `{domain}Calculator.js` | `orderCalculator.js` |
| Aggregator | `{domain}Aggregator.js` | `reportingAggregator.js` |
| Run flag | `RUN_{SUITE}_TESTS` | `RUN_ORDER_TESTS` |
| Entity ID | `{ENTITY}_ID` | `ORDER_ID`, `SUBSCRIPTION_ID` |
| TYPES key | `UPPER_SNAKE_CASE` | `ORDER`, `ADD_ON`, `REPORTING_DAILY` |

---

## 7. Import Paths

- **Tests:** `../bubbleClient`, `../lib/{module}`, `../testConfig`
- **Lib:** `../logger`, `./testUtils`

---

## 8. AI Agent Instructions

### When user asks to "create a test case for X"

1. **Read this guide** for schemas and templates
2. **Update testConfig.js:** Add `RUN_X_TESTS`, `X_ID`, `TYPES.X` (and related types), export all. Use **Data API type names** (Section 9)—not Buildprint MCP schema keys.
3. **Create tests/x.test.js** using the test file template, filling in domain-specific fetch logic and assertions
4. **Create lib/xCalculator.js** (or xAggregator.js if aggregating) using the calculator/aggregator template
5. **Do not** create config keys or files for domains the user did not request

### When user asks to "add a new assertion to X"

1. Add a new `it("validates ...", () => { ... })` block in `tests/x.test.js`
2. If the assertion requires new calculated fields, update `lib/xCalculator.js` to return them

### When user asks to "add a new test suite"

1. Follow the "create a test case" flow
2. Merge new config into existing testConfig.js exports
3. Add new TYPES keys to the shared TYPES object if needed

---

## 9. Bubble Data API vs Buildprint MCP: Name Mapping

**Critical:** The `bubbleClient` calls the **Bubble Data API** (REST). Type names and field names in `testConfig.TYPES` and in test/calculator code must use **Data API names**, not internal schema keys from Buildprint MCP or the app JSON.

### Data API Type Names

The Bubble Data API uses the **data type name as shown in the Bubble database editor**, formatted as:

- **Lowercase**
- **Spaces removed**

| Editor Name | Data API Type Name |
|-------------|--------------------|
| Order | `order` |
| Order Item | `orderitem` |
| Rental Unit | `rentalunit` |

**Source:** [Bubble Data API endpoints](https://manual.bubble.io/help-guides/integrations/api/the-bubble-api/the-data-api/data-api-endpoints)

### Buildprint MCP Schema Keys (Do Not Use for API)

Buildprint MCP tools (`get_summary`, `get_json`) return app JSON with **internal schema keys** in paths like `/user_types/cart_items` or `/user_types/order`. These keys (`cart_items`, `order`, etc.) are **not** the Data API type names. They are internal identifiers used by the editor and MCP.

| MCP Path | Internal Key | Data API Name (if editor name = "Order") |
|----------|--------------|------------------------------------------|
| /user_types/cart_items | cart_items | `order` |
| /user_types/order | order | `orderitem` |

### Field Names

Field names in API responses and search constraints follow the same rule: use the **display name from the Bubble editor**, formatted (lowercase, spaces removed). For example, a field "Order_items" in the editor becomes `order_items` in the API.

### Verification

To confirm correct type names for your app:

1. Open the Bubble editor → **Settings** → **API** → **Data**
2. Inspect the generated endpoint URLs (e.g. `.../obj/order`, `.../obj/orderitem`)
3. Use those exact type names in `testConfig.TYPES`

### AI Instruction

When using Buildprint MCP to discover schema or workflows: **do not** use MCP path keys (e.g. `cart_items`, `order`) as `TYPES` values. Always derive Data API names from the editor display names using the formatting rule above, or verify against the Bubble API settings.

---

## 10. Buildprint MCP Workflow (Future)

The goal is to integrate with Buildprint MCP to:

1. Fetch Bubble workflow logic (which workflows write which fields)
2. Generate or update test case calculations from that logic
3. Run tests via `npm test`

**Design implication:** Calculation modules and config use clear, documented structures so they can be generated or updated by tools. **Name mapping:** Use Section 9 when translating MCP schema output to API-ready type and field names.

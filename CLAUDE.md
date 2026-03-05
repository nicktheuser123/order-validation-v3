# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm test             # Run all test suites (writes test-results.md)
npm test -- {domain}.test.js   # Run a single suite
npm run test:watch   # Watch mode
npm run record       # Launch Playwright codegen, saves to recordings/latest-recording.js
```

## Architecture

This is a **Bubble no-code app validation framework**. It fetches data from the Bubble Data API and validates calculated fields using Jest. The `TESTING_GUIDE.md` is the canonical spec — read it when creating or modifying test suites.

### Key Files

- **`testConfig.js`** — Runtime config: entity IDs, Bubble type names, feature flags (`RUN_*_TESTS`), and `BASE_URL` for Playwright. Dynamically extended per suite.
- **`config/bubbleClient.js`** — Bubble Data API client. `getThing(type, id)` fetches one record; `searchThings(type, constraints)` fetches all pages of matching records. Types must be Data API names (see below).
- **`config/jestMarkdownReporter.js`** — Custom Jest reporter that writes `test-results.md` after every run.
- **`config/testResultsLogger.js`** — Call `step(description, details)` inside `it()` blocks to populate `test-results.md` with dynamic data.
- **`lib/testUtils.js`** — `getNum(obj, ...keys)` and `roundTo2(num)`. Do not remove.
- **`lib/parseBubbleUrl.js`** — Derives `{ appId, version }` from `BASE_URL` for Buildprint MCP calls.

### Per-Domain Pattern

For each domain (e.g. `order`, `subscription`), three files are created:

1. **`testConfig.js`** — Add `RUN_{SUITE}_TESTS`, `{ENTITY}_ID`, `{ENTITY}_IDS`, and keys in `TYPES`.
2. **`tests/{domain}.test.js`** — `beforeAll` fetches data and calls the calculator; `describe` block contains `it()` assertions.
3. **`lib/{domain}Calculator.js`** (pure calc) or **`lib/{domain}Aggregator.js`** (multi-record sums).

### Critical: Jest Execution Order

`describe` callbacks run at file load time, **before** `beforeAll`. Never branch on fetched data at describe-definition time (e.g. `if (items.length)`).

**Right:** Throw in `beforeAll` if the fetched list is empty, then iterate inside `it()` callbacks:
```javascript
beforeAll(async () => {
  items = await searchThings(TYPES.ITEM, constraints);
  if (items.length === 0) throw new Error("No items found");
  results = items.map(item => calculateDomain({ item }));
}, 120000);

// No guard test needed; forEach runs after beforeAll
it("validates all items", () => {
  items.forEach((item, i) => {
    expect(getNum(item, "field")).toBe(results[i].field);
  });
});
```

When `beforeAll` throws, Jest marks all tests in the suite as failed with the setup error. No separate guard `it` test is needed.

### Bubble Data API vs Buildprint MCP Names

Bubble Data API type names = editor display name, **lowercased, spaces removed** (e.g. "Order Item" → `orderitem`). Buildprint MCP internal schema keys (e.g. `/user_types/cart_items`) are **not** the same and must not be used as `TYPES` values.

### Environment Variables

Copy `.env.example` to `.env`:
- `BUBBLE_API_BASE` — e.g. `https://yourapp.bubbleapps.io/api/1.1/obj`
- `BUBBLE_API_TOKEN` — Bubble Data API token

### Output

`test-results.md` is generated at project root on every `npm test` run and is gitignored. It provides a human-readable breakdown of test suites, test cases, and recorded steps.

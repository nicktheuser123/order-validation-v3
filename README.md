# Order Validation

Validates GP_Order financial calculations against Bubble API data. Uses Jest for testing and fetches order, add-on, and event data from the Bubble API.

## Prerequisites

- **Node.js** (v14 or later recommended)

## Setup

1. **Initialize project** (if no `package.json` exists)

   ```bash
   npm init -y
   ```

2. **Install dependencies**

   ```bash
   npm install axios dotenv jest
   ```

3. **Environment variables**

   Copy the example env file and add your Bubble API credentials:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set:

   ```
   BUBBLE_API_BASE=https://your-bubble-app.bubbleapps.io/api/1.1/obj
   BUBBLE_API_TOKEN=your-bubble-api-token-here
   ```

4. **Run tests**

   ```bash
   npx jest
   ```

   To run tests in watch mode:

   ```bash
   npx jest --watch
   ```

## Test suites

### 1. GP_Order financial validation (`order.test.js`)

Validates a single order's calculated values against Bubble:

- Ticket count
- Gross amount
- Discount amount (flat and percentage)
- Processing fee revenue and deduction
- Total order value
- Service fee
- Donation amount
- Custom fees

### 2. GP_ReportingDaily validation (`reportingDaily.test.js`)

Validates that summed `GP_ReportingDaily` entries for a date match the summed values from orders with the same Date Label. Uses the order ID to fetch its Date Label, then fetches all orders and all ReportingDaily entries for that date, sums them, and compares per the workflow mapping.

**Validated fields:** gross_sales, gross_revenue, net_revenue, total_tickets_sold, total_ticket_sales, total_service_fees, net_service_fees, total_fees, net_total_fees, total_processing_fees (revenue & deductions), donations, total_discounts, total_deductions, total_orders_count.

**Configuration:** Update `REPORTING_DAILY_TYPE` in `reportingDaily.test.js` if your Bubble type name differs (e.g. `"ReportingDaily"` instead of `"GP_ReportingDaily"`).

## Configuration

- **Order ID:** Set in `order.test.js` and `reportingDaily.test.js` `beforeAll` hooks.
- **Bubble API:** See [Data API requests](https://manual.bubble.io/help-guides/integrations/api/the-bubble-api/the-data-api/data-api-requests) for search/constraint format.

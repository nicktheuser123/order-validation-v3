# Calculation Logic (Flowchart)

**Update this file whenever orderCalculator.js, order.test.js, or reportingDaily.test.js calculation logic changes.**

---

## Part 1: Order Validation

**Source:** `orderCalculator.js`, `order.test.js`

### Add-on processing flow

```mermaid
flowchart TD
    A["For each Add-On"] --> B{"OS AddOnType"}
    B -->|Donation| C["Add Gross Price or Final Price to donationTotal"]
    C --> Z["Skip rest"]
    B -->|Not Ticket| Z
    B -->|Ticket| D["grossAmount += ticketPrice * qty"]
    D --> E{"Promotion applies"}
    E -->|No| F["discount = 0"]
    E -->|Yes| G{"Promotion Type"}
    G -->|Discount Amount| H["discount = weighted share * min"]
    G -->|Discount Percentage| I["discount = addOnTicketTotal * DiscountPct"]
    H --> J
    I --> J
    F --> J["serviceFeePerTicket: 0 if price=0 else Service Fee or 2"]
    J --> K{"discount >= addOnTicketTotal"}
    K -->|Yes| L["serviceFee=0, addOnFinal=0"]
    K -->|No| M["serviceFee = serviceFeePerTicket * qty"]
    M --> N["addOnFinal = ticketTotal + serviceFee - discount"]
    L --> O["Accumulate into finalAmount"]
    N --> O
    O --> P["Next add-on"]
```

### Processing fees & total order value flow

```mermaid
flowchart TD
    A[finalAmount + donationTotal + totalCustomFees] --> B{baseAmount ≈ 0?}
    B -->|Yes| C[totalOrderValue = 0]
    C --> D[processingFeeRevenue = 0]
    D --> E[stripeDeduction = 0]
    B -->|No| F{No Processing Fee = true?}
    F -->|Yes| G[totalOrderValue = finalAmount + donationTotal + totalCustomFees]
    G --> H[stripeDeduction = totalOrderValue × pfd% + pfdFixed]
    H --> I[processingFeeRevenue = 0]
    F -->|No| J[PF fixed = Processing Fee $, PF% = Processing Fee %]
    J --> K[donationFee = donationTotal / 1-pfd% × pfd%]
    K --> L[base = finalAmount + combinedFixed + totalCustomFees / 1-pfd%-PF%]
    L --> M[totalProcessingFee = base × combined% + combinedFixed + donationFee]
    M --> N[totalOrderValue = finalAmount + totalCustomFees + totalProcessingFee + donationTotal]
    N --> O[stripeDeduction = round totalOrderValue × pfd% + pfdFixed]
    O --> P[processingFeeRevenue = totalProcessingFee - stripeDeduction]
```

### Payment provider (PFD)

```mermaid
flowchart TD
    A[order OS Payment Provider] --> B{Provider?}
    B -->|Stripe default| C[2.9% + $0.30]
    B -->|Authorize.NET| D[0% + $0.05]
```

### Custom fees flow

```mermaid
flowchart TD
    A[For each CustomFeeType] --> B{Type?}
    B -->|Fixed| C[feePerAddOn = feeAmount ÷ validAddOnCount]
    B -->|Percentage| D[customFee = addOnFinalPrice × feeAmount]
    C --> E[Skip add-ons with finalPrice < 0.01]
    D --> E
    E --> F[totalCustomFees += customFee]
```

---

## Part 2: ReportingDaily Validation

**Source:** `reportingDaily.test.js`

### Data fetch flow

```mermaid
flowchart TD
    A[Seed: getThing GP_Order, ORDER_ID] --> B[Read Date Label + Event]
    B --> C[Orders: search GP_Order]
    B --> D[ReportingDaily: search GP_ReportingDaily]
    C --> E[constraints: Date Label + Event + Order Status = Paid]
    D --> F[constraints: Date Label + Event]
```

### Per-order calculation flow

```mermaid
flowchart TD
    A[For each Paid Order] --> B[total_order_value = order Total Order Value]
    A --> C[discount_value = order Discount Amount]
    A --> D[ticket_count = order Ticket Count]
    A --> E[fee_service = order Fee Service]
    A --> F[processing_fee_revenue = order Processing Fee Revenue]
    A --> G[processing_fee_deduction = order Processing Fee Deduction]
    A --> H[donation_amount = order Donation Amount]
    A --> I[total_ticket_sales = Σ Price × Quantity over Ticket add-ons]
    A --> J[order_total_fees = PFD + Fee Service + Σ GP_OrderFee Amt]
    A --> K[order_total_deductions = order_total_fees + discount_value]
```

### Validation mapping flow

```mermaid
flowchart LR
    subgraph Orders["Order sums (Σ)"]
        O1[total_order_value]
        O2[discount_value]
        O3[order_total_deductions]
        O4[ticket_count]
        O5[total_ticket_sales]
        O6[fee_service]
        O7[order_total_fees]
        O8[processing_fee_revenue]
        O9[processing_fee_deduction]
        O10[donation_amount]
        O11[order_count]
    end

    subgraph RD["ReportingDaily (must match)"]
        R1[Gross Sales]
        R2[Total Sales]
        R3[Net Revenue]
        R4[Total Tickets Sold]
        R5[Total Ticket Sales]
        R6[Gross Service Fees]
        R7[Gross Total Fees]
        R8[Gross Processing Fees Rev]
        R9[Total Processing Fees Ded]
        R10[Donations Gross]
        R11[Total Discounts]
        R12[Total Deductions]
        R13[Total Orders Count]
    end

    O1 --> R1
    O1 --> R2
    O2 --> R2
    O1 --> R3
    O2 --> R3
    O3 --> R3
    O4 --> R4
    O5 --> R5
    O6 --> R6
    O7 --> R7
    O8 --> R8
    O9 --> R9
    O10 --> R10
    O2 --> R11
    O3 --> R12
    O11 --> R13
```

### Step summary

| Step | Action |
|------|--------|
| 1 | Fetch seed order → Date Label, Event |
| 2 | Fetch orders (Date Label + Event + Status=Paid) |
| 3 | Fetch ReportingDaily (Date Label + Event) |
| 4 | For each order: sum order fields + compute order_total_fees, order_total_deductions |
| 5 | Sum ReportingDaily field values |
| 6 | Assert order sums = ReportingDaily sums per mapping |

### Derived equalities (ReportingDaily internal)

```
net_service_fees = total_service_fees
net_total_fees = total_fees
net_processing_fees_revenue = total_processing_fees_revenue
donations_net = donations_total
```

---

## Part 3: GP_ReportingTicketTypeDaily Validation

**Source:** `reportingDaily.test.js`  
**Workflow:** gp_r_ticket_daily_updater — one record per Ticket add-on.

### Per-addon mapping (workflow → our calc)

| GP_ReportingTicketTypeDaily field | Source (GP_AddOn) | Our calc |
|----------------------------------|-------------------|----------|
| Final Sales (gross_sales_number) | addon Final Price | addon Final Price |
| Gross Sales (gross_sales1_number) | addon Gross Price | addon total_price_before_fees |
| Service Fees (service_fees_number) | addon Service Fee | addon Service Fee |
| Discounts (discounts_number) | addon Discount | addon Discount |
| Tickets Sold Count (tickets_sold_count_number) | addon Quantity | addon Quantity |

### Validation flow

```mermaid
flowchart LR
    subgraph AddOns["Ticket add-ons (Σ)"]
        A1["Final Price"]
        A2["Gross Price"]
        A3["Service Fee"]
        A4["Discount"]
        A5["Quantity"]
    end

    subgraph RTTD["GP_ReportingTicketTypeDaily"]
        R1["Final Sales"]
        R2["Gross Sales"]
        R3["Service Fees"]
        R4["Discounts"]
        R5["Tickets Sold Count"]
    end

    A1 --> R1
    A2 --> R2
    A3 --> R3
    A4 --> R4
    A5 --> R5
```

---

## Part 4: GP_ReportingCustomFeeDaily Validation

**Source:** `reportingDaily.test.js`  
**Workflow:** gp_r_customfee_daily_updater — one record per (order + Fee Type).

### Per-fee-type mapping (workflow)

- Filters order add-ons' GP_OrderFee list where GP_CustomFee = fee type
- amount_number (Gross Total) = sum of GP_OrderFee.fee_amount for that fee type
- net_total_number (Net Total) = same sum
- fee_type = GP_CustomFeeType

### Our calculation

- For each paid order: sum all GP_OrderFee amounts (GP_OrderFee Amt)
- Total across orders = customFeeSums.amount = customFeeSums.net_total

### Validation

| GP_ReportingCustomFeeDaily | Our calc |
|----------------------------|----------|
| Gross Total (amount_number) | sum(GP_OrderFee Amt) across orders |
| Net Total (net_total_number) | same |

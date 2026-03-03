const { getThing, searchThings } = require("./bubbleClient");
const { ORDER_ID, RUN_REPORTING_DAILY_TESTS } = require("./testConfig");

// Helper: get numeric value from object, trying multiple possible field names
function getNum(obj, ...keys) {
  if (!obj) return 0;
  for (const k of keys) {
    const v = obj[k];
    if (v != null && v !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return 0;
}

let dateLabel;
let reportingDailyEntries = [];
let reportingTicketTypeDailyEntries = [];
let reportingCustomFeeDailyEntries = [];
let ordersForDate = [];
let orderCalculatedSums = null;
let ticketTypeDailyCalculatedSums = null;
let customFeeDailyCalculatedSums = null;

beforeAll(async () => {
  if (!RUN_REPORTING_DAILY_TESTS) return;

  const seedOrder = await getThing("GP_Order", ORDER_ID);
  dateLabel = seedOrder["Date Label"];
  const eventId = seedOrder["Event"];
  if (!dateLabel) {
    throw new Error(`Order ${ORDER_ID} has no Date Label - cannot run ReportingDaily validation`);
  }
  if (!eventId) {
    throw new Error(`Order ${ORDER_ID} has no Event - cannot run ReportingDaily validation`);
  }

  const reportingConstraints = [
    { key: "Date Label", constraint_type: "equals", value: dateLabel },
    { key: "Event", constraint_type: "equals", value: eventId }
  ];

  const orderConstraints = [
    ...reportingConstraints,
    { key: "Order Status", constraint_type: "equals", value: "Paid" }
  ];

  const searchSafe = async (type, constraints) => {
    try {
      return await searchThings(type, constraints);
    } catch (e) {
      if (e.response?.status === 404) {
        console.warn(`Type "${type}" not found (404) - skipping. Update type name if different in your Bubble app.`);
        return [];
      }
      throw e;
    }
  };

  // Type names must match your Bubble app.
  const REPORTING_DAILY_TYPE = "GP_ReportingDaily";
  const REPORTING_TICKET_TYPE_DAILY_TYPE = "GP_ReportingTicketTypeDaily";
  const REPORTING_CUSTOM_FEE_DAILY_TYPE = "GP_ReportingCustomFeeDaily";
  const [reportingDaily, reportingTicketTypeDaily, reportingCustomFeeDaily, orders] = await Promise.all([
    searchSafe(REPORTING_DAILY_TYPE, reportingConstraints),
    searchSafe(REPORTING_TICKET_TYPE_DAILY_TYPE, reportingConstraints),
    searchSafe(REPORTING_CUSTOM_FEE_DAILY_TYPE, reportingConstraints),
    searchThings("GP_Order", orderConstraints)
  ]);

  reportingDailyEntries = reportingDaily;
  reportingTicketTypeDailyEntries = reportingTicketTypeDaily;
  reportingCustomFeeDailyEntries = reportingCustomFeeDaily;
  ordersForDate = orders;


  if (reportingDailyEntries.length === 0) {
    console.warn(`No GP_ReportingDaily entries found for Date Label: ${dateLabel}`);
    return;
  }

  const sums = {
    gross_sales: 0,
    gross_revenue: 0,
    net_revenue: 0,
    total_tickets_sold: 0,
    total_ticket_sales: 0,
    total_service_fees: 0,
    net_service_fees: 0,
    total_fees: 0,
    net_total_fees: 0,
    total_processing_fees_revenue: 0,
    total_processing_fees_deductions: 0,
    net_processing_fees_revenue: 0,
    donations_total: 0,
    donations_net: 0,
    donations_count: 0,
    total_discounts: 0,
    total_deductions: 0,
    total_orders_count: 0
  };

  const orderSums = {
    total_order_value: 0,
    discount_value: 0,
    ticket_count: 0,
    total_ticket_sales: 0,
    fee_service: 0,
    order_total_fees: 0,
    order_total_deductions: 0,
    processing_fee_revenue: 0,
    processing_fee_deduction: 0,
    donation_amount: 0,
    order_count: 0
  };

  // Per workflow gp_r_customfee_daily_updater: one GP_ReportingCustomFeeDaily per (order + Fee Type)
  // amount_number and net_total_number = sum of GP_OrderFee.fee_amount for that fee type
  let customFeeSums = { amount: 0, net_total: 0 };

  // Per workflow gp_r_ticket_daily_updater: one GP_ReportingTicketTypeDaily per Ticket add-on
  const ticketTypeSums = {
    gross_sales: 0,       // addon Final Price (gross_sales_number)
    gross_sales1: 0,      // addon Gross Price (gross_sales1_number)
    service_fees: 0,      // addon Service Fee
    discounts: 0,         // addon Discount
    tickets_sold_count: 0 // addon Quantity
  };

  for (const order of ordersForDate) {
    const addOns = await Promise.all((order["Add Ons"] || []).map((id) => getThing("GP_AddOn", id)));

    const ticketTypes = {};
    for (const addOn of addOns) {
      if (addOn["OS AddOnType"] !== "Ticket") continue;
      const tid = addOn.GP_TicketType;
      if (!ticketTypes[tid] && tid) {
        ticketTypes[tid] = await getThing("GP_TicketType", tid);
      }
    }

    let orderFees = [];
    for (const addOn of addOns) {
      if (addOn["GP_OrderFee"] && Array.isArray(addOn["GP_OrderFee"])) {
        const fetched = await Promise.all(
          addOn["GP_OrderFee"].map(async (id) => {
            try {
              return await getThing("GP_OrderFee", id);
            } catch (e) {
              return null;
            }
          })
        );
        orderFees.push(...fetched.filter(Boolean));
      }
    }

    const orderTotalOrderValue = getNum(order, "Total Order Value");
    const orderDiscount = getNum(order, "Discount Amount");
    const orderTicketCount = getNum(order, "Ticket Count");
    const orderFeeService = getNum(order, "Fee Service");
    const orderProcessingFeeRevenue = getNum(order, "Processing Fee Revenue");
    const orderProcessingFeeDeduction = getNum(order, "Processing Fee Deduction");
    const orderDonation = getNum(order, "Donation Amount");
    const orderCustomFees = orderFees.reduce((s, f) => s + getNum(f, "GP_OrderFee Amt"), 0);
    customFeeSums.amount += orderCustomFees;
    customFeeSums.net_total += orderCustomFees;

    let ticketSalesFromAddons = 0;
    addOns.forEach((addOn) => {
      if (addOn["OS AddOnType"] !== "Ticket") return;
      const tt = ticketTypes[addOn.GP_TicketType];
      if (!tt) return;
      const price = getNum(tt, "Price") * (addOn.Quantity || 0);
      ticketSalesFromAddons += price;

      // GP_ReportingTicketTypeDaily: one record per Ticket add-on (workflow gp_r_ticket_daily_updater)
      const addonFinalPrice = getNum(addOn, "Final Price", "price_number");
      const addonGrossPrice = getNum(addOn, "Gross Price", "total_price_before_fees_number");
      const addonServiceFee = getNum(addOn, "Service Fee", "service_fee_number");
      const addonDiscount = getNum(addOn, "Discount", "discount_number");
      const addonQty = getNum(addOn, "Quantity", "quantity_number");

      ticketTypeSums.gross_sales += addonFinalPrice;
      ticketTypeSums.gross_sales1 += addonGrossPrice;
      ticketTypeSums.service_fees += addonServiceFee;
      ticketTypeSums.discounts += addonDiscount;
      ticketTypeSums.tickets_sold_count += addonQty;
    });

    const orderTotalFees = orderProcessingFeeDeduction + orderFeeService + orderCustomFees;

    orderSums.total_order_value += orderTotalOrderValue;
    orderSums.discount_value += orderDiscount;
    orderSums.ticket_count += orderTicketCount;
    orderSums.total_ticket_sales += ticketSalesFromAddons;
    orderSums.fee_service += orderFeeService;
    orderSums.order_total_fees += orderTotalFees;
    orderSums.order_total_deductions += orderTotalFees + orderDiscount;
    orderSums.processing_fee_revenue += orderProcessingFeeRevenue;
    orderSums.processing_fee_deduction += orderProcessingFeeDeduction;
    orderSums.donation_amount += orderDonation;
    orderSums.order_count += 1;
  }

  // Sum GP_ReportingTicketTypeDaily (display names from meta)
  const ticketTypeDailySums = {
    gross_sales: 0,       // Final Sales
    gross_sales1: 0,      // Gross Sales
    service_fees: 0,      // Service Fees
    discounts: 0,         // Discounts
    tickets_sold_count: 0 // Tickets Sold Count
  };
  for (const rttd of reportingTicketTypeDailyEntries) {
    ticketTypeDailySums.gross_sales += getNum(rttd, "Final Sales", "gross_sales_number");
    ticketTypeDailySums.gross_sales1 += getNum(rttd, "Gross Sales", "gross_sales1_number");
    ticketTypeDailySums.service_fees += getNum(rttd, "Service Fees", "service_fees_number");
    ticketTypeDailySums.discounts += getNum(rttd, "Discounts", "discounts_number");
    ticketTypeDailySums.tickets_sold_count += getNum(rttd, "Tickets Sold Count", "tickets_sold_count_number");
  }

  ticketTypeDailyCalculatedSums = { ticketTypeSums, ticketTypeDailySums };

  // Sum GP_ReportingCustomFeeDaily (display names from meta: Gross Total, Net Total)
  const customFeeDailySums = { amount: 0, net_total: 0 };
  for (const rcfd of reportingCustomFeeDailyEntries) {
    customFeeDailySums.amount += getNum(rcfd, "Gross Total", "amount_number");
    customFeeDailySums.net_total += getNum(rcfd, "Net Total", "net_total_number");
  }
  customFeeDailyCalculatedSums = { customFeeSums, customFeeDailySums };

  for (const rd of reportingDailyEntries) {
    sums.gross_sales += getNum(rd, "Gross Sales", "gross_sales_number");
    sums.gross_revenue += getNum(rd, "Total Sales", "gross_revenue_number");
    sums.net_revenue += getNum(rd, "Net Revenue", "net_revenue_number");
    sums.total_tickets_sold += getNum(rd, "Total Tickets Sold", "total_tickets_sold_number");
    sums.total_ticket_sales += getNum(rd, "Total Ticket Sales", "total_ticket_sales_number");
    sums.total_service_fees += getNum(rd, "Gross Service Fees", "total_service_fees_number");
    sums.net_service_fees += getNum(rd, "Net Service Fees", "net_service_fees_number");
    sums.total_fees += getNum(rd, "Gross Total Fees", "total_fees_number");
    sums.net_total_fees += getNum(rd, "Net Total Fees", "net_total_fees_number");
    sums.total_processing_fees_revenue += getNum(rd, "Gross Processing Fees (Revenue)", "total_processing_fees__revenue__number");
    sums.total_processing_fees_deductions += getNum(rd, "Total Processing Fees (Deductions)", "total_processing_fees__deductions__number");
    sums.net_processing_fees_revenue += getNum(rd, "Net Processing Fees (Revenue)", "net_processing_fees__revenue__number");
    sums.donations_total += getNum(rd, "Donations Gross", "donations_total_amount_number");
    sums.donations_net += getNum(rd, "Donations Net", "donations_net_number");
    sums.donations_count += getNum(rd, "Donations Count", "donations_count_number");
    sums.total_discounts += getNum(rd, "Total Discounts", "total_discounts_number");
    sums.total_deductions += getNum(rd, "Total Deductions", "total_deductions_number");
    sums.total_orders_count += getNum(rd, "Total Orders Count", "total_orders_count_number");
  }

  orderCalculatedSums = { sums, orderSums };

  if (reportingDailyEntries.length > 0 && orderCalculatedSums) {
    const { sums, orderSums } = orderCalculatedSums;
    console.log("\n==============================");
    console.log("REPORTING DAILY COMPARISON");
    console.log("Date Label:", dateLabel, "| Orders:", ordersForDate.length, "| ReportingDaily entries:", reportingDailyEntries.length);
    console.log("==============================");
    console.log("Field                          | Orders (sum)       | ReportingDaily (sum)        | Match");
    console.log("-------------------------------|--------------------|----------------------------|------");
    const fmt = (n) => (n == null ? "N/A" : Number(n).toFixed(2));
    const row = (label, ours, bubble) =>
      console.log(`${label.padEnd(30)} | ${String(fmt(ours)).padStart(18)} | ${String(fmt(bubble)).padStart(26)} | ${Math.abs((ours || 0) - (bubble || 0)) < 0.01 ? "✓" : "✗"}`);
    row("gross_sales", orderSums.total_order_value, sums.gross_sales);
    row("gross_revenue", orderSums.total_order_value + orderSums.discount_value, sums.gross_revenue);
    row(
      "net_revenue",
      orderSums.total_order_value + orderSums.discount_value - orderSums.order_total_deductions,
      sums.net_revenue
    );
    row("total_tickets_sold", orderSums.ticket_count, sums.total_tickets_sold);
    row("total_ticket_sales", orderSums.total_ticket_sales, sums.total_ticket_sales);
    row("total_service_fees", orderSums.fee_service, sums.total_service_fees);
    row("total_fees", orderSums.order_total_fees, sums.total_fees);
    row("total_processing_fees_revenue", orderSums.processing_fee_revenue, sums.total_processing_fees_revenue);
    row("total_processing_fees_deductions", orderSums.processing_fee_deduction, sums.total_processing_fees_deductions);
    row("donations_total", orderSums.donation_amount, sums.donations_total);
    row("total_discounts", orderSums.discount_value, sums.total_discounts);
    row("total_deductions", orderSums.order_total_deductions, sums.total_deductions);
    row("total_orders_count", orderSums.order_count, sums.total_orders_count);
    console.log("==============================\n");
  }

  if (reportingTicketTypeDailyEntries.length > 0 && ticketTypeDailyCalculatedSums) {
    const { ticketTypeSums: tts, ticketTypeDailySums: rttd } = ticketTypeDailyCalculatedSums;
    console.log("\n==============================");
    console.log("GP_ReportingTicketTypeDaily COMPARISON");
    console.log("Date Label:", dateLabel, "| Orders:", ordersForDate.length, "| RTTSD entries:", reportingTicketTypeDailyEntries.length);
    console.log("==============================");
    console.log("Field                | Ticket add-ons (sum) | GP_ReportingTicketTypeDaily (sum) | Match");
    console.log("---------------------|----------------------|-----------------------------------|------");
    const fmt = (n) => (n == null ? "N/A" : Number(n).toFixed(2));
    const rowT = (label, ours, bubble) =>
      console.log(`${label.padEnd(20)} | ${String(fmt(ours)).padStart(20)} | ${String(fmt(bubble)).padStart(35)} | ${Math.abs((ours || 0) - (bubble || 0)) < 0.01 ? "✓" : "✗"}`);
    rowT("gross_sales (Final Sales)", tts.gross_sales, rttd.gross_sales);
    rowT("gross_sales1 (Gross Sales)", tts.gross_sales1, rttd.gross_sales1);
    rowT("service_fees", tts.service_fees, rttd.service_fees);
    rowT("discounts", tts.discounts, rttd.discounts);
    rowT("tickets_sold_count", tts.tickets_sold_count, rttd.tickets_sold_count);
    console.log("==============================\n");
  }

  if (reportingCustomFeeDailyEntries.length > 0 && customFeeDailyCalculatedSums) {
    const { customFeeSums: cfs, customFeeDailySums: rcfd } = customFeeDailyCalculatedSums;
    console.log("\n==============================");
    console.log("GP_ReportingCustomFeeDaily COMPARISON");
    console.log("Date Label:", dateLabel, "| Orders:", ordersForDate.length, "| RCFD entries:", reportingCustomFeeDailyEntries.length);
    console.log("==============================");
    console.log("Field           | GP_OrderFee sum | GP_ReportingCustomFeeDaily (sum) | Match");
    console.log("----------------|-----------------|-----------------------------------|------");
    const fmt = (n) => (n == null ? "N/A" : Number(n).toFixed(2));
    const rowC = (label, ours, bubble) =>
      console.log(`${label.padEnd(15)} | ${String(fmt(ours)).padStart(15)} | ${String(fmt(bubble)).padStart(35)} | ${Math.abs((ours || 0) - (bubble || 0)) < 0.01 ? "✓" : "✗"}`);
    rowC("amount (Gross Total)", cfs.amount, rcfd.amount);
    rowC("net_total (Net Total)", cfs.net_total, rcfd.net_total);
    console.log("==============================\n");
  }
}, 120000);

(RUN_REPORTING_DAILY_TESTS ? describe : describe.skip)("GP_ReportingDaily validation (by Date Label)", () => {
  it("validates gross_sales_number = sum(order total_order_value)", () => {
    if (!orderCalculatedSums || reportingDailyEntries.length === 0) return;
    const { sums, orderSums } = orderCalculatedSums;
    expect(sums.gross_sales).toBeCloseTo(orderSums.total_order_value, 2);
  });

  it("validates gross_revenue_number = sum(total_order_value + discount_value)", () => {
    if (!orderCalculatedSums || reportingDailyEntries.length === 0) return;
    const { sums, orderSums } = orderCalculatedSums;
    const expected = orderSums.total_order_value + orderSums.discount_value;
    expect(sums.gross_revenue).toBeCloseTo(expected, 2);
  });

  it("validates net_revenue_number = sum(total_order_value + discount_value - order_total_deductions)", () => {
    if (!orderCalculatedSums || reportingDailyEntries.length === 0) return;
    const { sums, orderSums } = orderCalculatedSums;
    const expected =
      orderSums.total_order_value + orderSums.discount_value - orderSums.order_total_deductions;
    expect(sums.net_revenue).toBeCloseTo(expected, 2);
  });

  it("validates total_tickets_sold_number = sum(order ticket_count)", () => {
    if (!orderCalculatedSums || reportingDailyEntries.length === 0) return;
    const { sums, orderSums } = orderCalculatedSums;
    expect(sums.total_tickets_sold).toBe(orderSums.ticket_count);
  });

  it("validates total_ticket_sales_number = sum(ticket addons total_price_before_fees)", () => {
    if (!orderCalculatedSums || reportingDailyEntries.length === 0) return;
    const { sums, orderSums } = orderCalculatedSums;
    expect(sums.total_ticket_sales).toBeCloseTo(orderSums.total_ticket_sales, 2);
  });

  it("validates total_service_fees_number = sum(order fee_service)", () => {
    if (!orderCalculatedSums || reportingDailyEntries.length === 0) return;
    const { sums, orderSums } = orderCalculatedSums;
    expect(sums.total_service_fees).toBeCloseTo(orderSums.fee_service, 2);
  });

  it("validates net_service_fees_number = total_service_fees_number", () => {
    if (!orderCalculatedSums || reportingDailyEntries.length === 0) return;
    const { sums } = orderCalculatedSums;
    expect(sums.net_service_fees).toBeCloseTo(sums.total_service_fees, 2);
  });

  it("validates total_fees_number = sum(order_total_fees)", () => {
    if (!orderCalculatedSums || reportingDailyEntries.length === 0) return;
    const { sums, orderSums } = orderCalculatedSums;
    expect(sums.total_fees).toBeCloseTo(orderSums.order_total_fees, 2);
  });

  it("validates net_total_fees_number = total_fees_number", () => {
    if (!orderCalculatedSums || reportingDailyEntries.length === 0) return;
    const { sums } = orderCalculatedSums;
    expect(sums.net_total_fees).toBeCloseTo(sums.total_fees, 2);
  });

  it("validates total_processing_fees__revenue__number = sum(order processing_fee_revenue)", () => {
    if (!orderCalculatedSums || reportingDailyEntries.length === 0) return;
    const { sums, orderSums } = orderCalculatedSums;
    expect(sums.total_processing_fees_revenue).toBeCloseTo(orderSums.processing_fee_revenue, 2);
  });

  it("validates total_processing_fees__deductions__number = sum(order processing_fee_deduction)", () => {
    if (!orderCalculatedSums || reportingDailyEntries.length === 0) return;
    const { sums, orderSums } = orderCalculatedSums;
    expect(sums.total_processing_fees_deductions).toBeCloseTo(orderSums.processing_fee_deduction, 2);
  });

  it("validates net_processing_fees__revenue__number = total_processing_fees__revenue__number", () => {
    if (!orderCalculatedSums || reportingDailyEntries.length === 0) return;
    const { sums } = orderCalculatedSums;
    expect(sums.net_processing_fees_revenue).toBeCloseTo(sums.total_processing_fees_revenue, 2);
  });

  it("validates donations_total_amount_number = sum(order donation_amount)", () => {
    if (!orderCalculatedSums || reportingDailyEntries.length === 0) return;
    const { sums, orderSums } = orderCalculatedSums;
    expect(sums.donations_total).toBeCloseTo(orderSums.donation_amount, 2);
  });

  it("validates donations_net_number = donations_total_amount_number", () => {
    if (!orderCalculatedSums || reportingDailyEntries.length === 0) return;
    const { sums } = orderCalculatedSums;
    expect(sums.donations_net).toBeCloseTo(sums.donations_total, 2);
  });

  it("validates total_discounts_number = sum(order discount_value)", () => {
    if (!orderCalculatedSums || reportingDailyEntries.length === 0) return;
    const { sums, orderSums } = orderCalculatedSums;
    expect(sums.total_discounts).toBeCloseTo(orderSums.discount_value, 2);
  });

  it("validates total_deductions_number = sum(order_total_deductions)", () => {
    if (!orderCalculatedSums || reportingDailyEntries.length === 0) return;
    const { sums, orderSums } = orderCalculatedSums;
    expect(sums.total_deductions).toBeCloseTo(orderSums.order_total_deductions, 2);
  });

  it("validates total_orders_count_number = number of orders", () => {
    if (!orderCalculatedSums || reportingDailyEntries.length === 0) return;
    const { sums, orderSums } = orderCalculatedSums;
    expect(sums.total_orders_count).toBe(orderSums.order_count);
  });
});

(RUN_REPORTING_DAILY_TESTS ? describe : describe.skip)("GP_ReportingTicketTypeDaily validation (by Date Label)", () => {
  it("validates gross_sales_number (Final Sales) = sum(ticket addon Final Price)", () => {
    if (!ticketTypeDailyCalculatedSums || reportingTicketTypeDailyEntries.length === 0) return;
    const { ticketTypeSums, ticketTypeDailySums } = ticketTypeDailyCalculatedSums;
    expect(ticketTypeDailySums.gross_sales).toBeCloseTo(ticketTypeSums.gross_sales, 2);
  });

  it("validates gross_sales1_number (Gross Sales) = sum(ticket addon Gross Price)", () => {
    if (!ticketTypeDailyCalculatedSums || reportingTicketTypeDailyEntries.length === 0) return;
    const { ticketTypeSums, ticketTypeDailySums } = ticketTypeDailyCalculatedSums;
    expect(ticketTypeDailySums.gross_sales1).toBeCloseTo(ticketTypeSums.gross_sales1, 2);
  });

  it("validates service_fees_number = sum(ticket addon Service Fee)", () => {
    if (!ticketTypeDailyCalculatedSums || reportingTicketTypeDailyEntries.length === 0) return;
    const { ticketTypeSums, ticketTypeDailySums } = ticketTypeDailyCalculatedSums;
    expect(ticketTypeDailySums.service_fees).toBeCloseTo(ticketTypeSums.service_fees, 2);
  });

  it("validates discounts_number = sum(ticket addon Discount)", () => {
    if (!ticketTypeDailyCalculatedSums || reportingTicketTypeDailyEntries.length === 0) return;
    const { ticketTypeSums, ticketTypeDailySums } = ticketTypeDailyCalculatedSums;
    expect(ticketTypeDailySums.discounts).toBeCloseTo(ticketTypeSums.discounts, 2);
  });

  it("validates tickets_sold_count_number = sum(ticket addon Quantity)", () => {
    if (!ticketTypeDailyCalculatedSums || reportingTicketTypeDailyEntries.length === 0) return;
    const { ticketTypeSums, ticketTypeDailySums } = ticketTypeDailyCalculatedSums;
    expect(ticketTypeDailySums.tickets_sold_count).toBe(ticketTypeSums.tickets_sold_count);
  });
});

(RUN_REPORTING_DAILY_TESTS ? describe : describe.skip)("GP_ReportingCustomFeeDaily validation (by Date Label)", () => {
  it("validates amount_number (Gross Total) = sum(GP_OrderFee amounts from orders)", () => {
    if (!customFeeDailyCalculatedSums || reportingCustomFeeDailyEntries.length === 0) return;
    const { customFeeSums, customFeeDailySums } = customFeeDailyCalculatedSums;
    expect(customFeeDailySums.amount).toBeCloseTo(customFeeSums.amount, 2);
  });

  it("validates net_total_number (Net Total) = sum(GP_OrderFee amounts from orders)", () => {
    if (!customFeeDailyCalculatedSums || reportingCustomFeeDailyEntries.length === 0) return;
    const { customFeeSums, customFeeDailySums } = customFeeDailyCalculatedSums;
    expect(customFeeDailySums.net_total).toBeCloseTo(customFeeSums.net_total, 2);
  });
});

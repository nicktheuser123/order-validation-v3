const axios = require("axios");

const client = axios.create({
  baseURL: process.env.BUBBLE_API_BASE,
  headers: {
    Authorization: `Bearer ${process.env.BUBBLE_API_TOKEN}`,
    "Content-Type": "application/json"
  }
});

async function getThing(type, id) {
  const res = await client.get(`/${type}/${id}`);
  return res.data.response;
}

/**
 * Search for records with constraints. Fetches all pages.
 * @param {string} type - Data type name (e.g. "GP_Order", "GP_ReportingDaily")
 * @param {Array} constraints - Array of { key, constraint_type, value }
 * @param {number} limit - Max items per request (default 100)
 * @returns {Promise<Array>} All matching records
 */
async function searchThings(type, constraints, limit = 100) {
  const all = [];
  let cursor = 0;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams();
    if (constraints && constraints.length > 0) {
      params.set("constraints", JSON.stringify(constraints));
    }
    params.set("cursor", String(cursor));
    params.set("limit", String(limit));

    const res = await client.get(`/${type}?${params.toString()}`);
    const data = res.data.response;
    const results = data.results || [];
    all.push(...results);

    const remaining = data.remaining ?? 0;
    hasMore = remaining > 0 && results.length > 0;
    cursor += results.length;
  }

  return all;
}

module.exports = { getThing, searchThings };

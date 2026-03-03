const { BASE_URL } = require("../testConfig");

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  use: {
    baseURL: BASE_URL || "http://localhost:3000"
  }
};

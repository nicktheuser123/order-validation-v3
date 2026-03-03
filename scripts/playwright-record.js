#!/usr/bin/env node
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { BASE_URL } = require("../testConfig");

const RECORDINGS_DIR = path.join(__dirname, "..", "recordings");
const OUTPUT_PATH = path.join(RECORDINGS_DIR, "latest-recording.js");

if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

if (!BASE_URL || BASE_URL.trim() === "") {
  console.error("Error: BASE_URL is not set in testConfig.js");
  console.error("");
  console.error("Add your Bubble app URL, for example:");
  console.error('  const BASE_URL = "https://yourapp.bubbleapps.io";');
  console.error("  // or for test branch: https://yourapp.bubbleapps.io/version-test");
  console.error("");
  console.error("Then run: npm run record");
  process.exit(1);
}

console.log("Starting Playwright codegen at:", BASE_URL);
console.log("Recording will be saved to:", OUTPUT_PATH);
console.log("Perform your flow in the browser, then stop recording to save.");
console.log("");

const child = spawn(
  "npx",
  [
    "playwright",
    "codegen",
    BASE_URL,
    "-o",
    OUTPUT_PATH,
    "--target=javascript"
  ],
  {
    stdio: "inherit",
    shell: true,
    cwd: path.join(__dirname, "..")
  }
);

child.on("close", (code) => {
  if (code === 0) {
    console.log("");
    console.log("Recording saved to:", OUTPUT_PATH);
  }
  process.exit(code);
});

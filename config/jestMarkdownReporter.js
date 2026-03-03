/**
 * Custom Jest reporter that writes test results to test-results.md.
 * Runs alongside the default reporter (console output unchanged).
 */

const fs = require("fs");
const path = require("path");
const { getStepsForTest, clear } = require("./testResultsLogger");

function formatDetails(details) {
  if (details == null || typeof details !== "object") return "";
  const lines = [];
  for (const [k, v] of Object.entries(details)) {
    const label = String(k).replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim();
    if (Array.isArray(v)) {
      lines.push(`  - ${label}: ${v.map((x) => (typeof x === "object" ? JSON.stringify(x) : x)).join(", ")}`);
    } else if (v !== null && typeof v === "object" && !(v instanceof Date)) {
      lines.push(`  - ${label}: \`${JSON.stringify(v)}\``);
    } else {
      lines.push(`  - ${label}: \`${v}\``);
    }
  }
  return lines.join("\n");
}

function formatSteps(steps, fieldCalculations) {
  const lines = [];
  let stepNum = 1;
  for (const s of steps) {
    lines.push(`- **Step ${stepNum}:** ${s.description}`);
    if (s.details && Object.keys(s.details).length > 0) {
      lines.push(formatDetails(s.details));
    }
    stepNum++;
  }
  for (const fc of fieldCalculations) {
    lines.push(`- **Field: ${fc.fieldName}**`);
    if (fc.steps && fc.steps.length > 0) {
      fc.steps.forEach((s, i) => {
        lines.push(`  - ${i + 1}. ${s.description}`);
        if (s.detail) lines.push(`    ${typeof s.detail === "object" ? JSON.stringify(s.detail) : s.detail}`);
      });
    }
    if (fc.expected != null || fc.actual != null) {
      lines.push(`  - Expected: \`${fc.expected}\`, Actual: \`${fc.actual}\``);
    }
  }
  return lines.join("\n");
}

function statusBadge(status) {
  if (status === "passed") return "✅ Passed";
  if (status === "failed") return "❌ Failed";
  if (status === "skipped" || status === "pending" || status === "todo") return "⏭️ Skipped";
  return status;
}

class JestMarkdownReporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig;
    this._rootDir = globalConfig.rootDir || process.cwd();
    this._outputPath = path.join(this._rootDir, "test-results.md");
  }

  onRunStart() {
    clear();
  }

  onRunComplete(contexts, results) {
    const { testResults, startTime, numFailedTests, numPassedTests, numPendingTests } = results;
    const total = numPassedTests + numFailedTests + numPendingTests;
    const statusLine =
      total === 0
        ? "No tests run"
        : `${numPassedTests} passed, ${numFailedTests} failed${numPendingTests > 0 ? `, ${numPendingTests} skipped` : ""}`;
    const runDate = new Date(startTime).toLocaleString();

    const sections = [];
    sections.push(`# Test Results`);
    sections.push("");
    sections.push(`| **Run** | **Status** |`);
    sections.push(`|---------|------------|`);
    const overallIcon = numFailedTests > 0 ? "❌" : "✅";
    sections.push(`| ${runDate} | ${overallIcon} ${statusLine} |`);
    sections.push("");
    sections.push("---");
    sections.push("");

    if (testResults.length === 0) {
      sections.push("No test suites ran.");
      const content = sections.join("\n").trimEnd() + "\n";
      fs.writeFileSync(this._outputPath, content, "utf8");
      return;
    }

    // Summary table
    sections.push("## Summary");
    sections.push("");
    sections.push("| Suite | Passed | Failed | Skipped | Total |");
    sections.push("|-------|--------|--------|---------|-------|");

    for (const fileResult of testResults) {
      const firstAncestor = fileResult.testResults[0]?.ancestorTitles?.[0];
      const suiteTitle = firstAncestor || path.basename(fileResult.testFilePath, ".test.js").replace(/-/g, " ");
      const passed = fileResult.testResults.filter((t) => t.status === "passed").length;
      const failed = fileResult.testResults.filter((t) => t.status === "failed").length;
      const skipped = fileResult.testResults.filter(
        (t) => t.status === "skipped" || t.status === "pending" || t.status === "todo"
      ).length;
      const suiteTotal = fileResult.testResults.length;
      sections.push(`| ${suiteTitle} | ${passed} | ${failed} | ${skipped} | ${suiteTotal} |`);
    }
    sections.push("");
    sections.push("---");
    sections.push("");

    for (const fileResult of testResults) {
      const firstAncestor = fileResult.testResults[0]?.ancestorTitles?.[0];
      const suiteTitle = firstAncestor || path.basename(fileResult.testFilePath, ".test.js").replace(/-/g, " ");
      sections.push(`## ${suiteTitle}`);
      sections.push("");
      sections.push("| # | Test Case | Status | Duration |");
      sections.push("|---|-----------|--------|----------|");

      let rowNum = 1;
      for (const assertion of fileResult.testResults) {
        const { fullName, title, status, failureMessages, duration } = assertion;
        const statusLabel = statusBadge(status);
        const durationStr = duration != null ? `${Math.round(duration)}ms` : "—";
        const titleEscaped = title.replace(/\|/g, "\\|");
        sections.push(`| ${rowNum} | ${titleEscaped} | ${statusLabel} | ${durationStr} |`);
        rowNum++;
      }
      sections.push("");

      // Steps and errors (expandable detail per test)
      for (const assertion of fileResult.testResults) {
        const { fullName, title, status, failureMessages } = assertion;
        const { steps, fieldCalculations } = getStepsForTest(fileResult.testFilePath, fullName);

        const stepContent = formatSteps(steps, fieldCalculations);
        const hasSteps = stepContent && stepContent.trim().length > 0;
        const hasError = status === "failed" && failureMessages && failureMessages.length > 0;

        if (hasSteps || hasError) {
          sections.push(`### ${title}`);
          sections.push("");
          if (hasSteps) {
            sections.push(stepContent);
            sections.push("");
          }
          if (hasError) {
            sections.push("**Error:**");
            for (const msg of failureMessages) {
              sections.push("```");
              sections.push(msg.trim());
              sections.push("```");
            }
            sections.push("");
          }
        }
      }
    }

    const content = sections.join("\n").trimEnd() + "\n";
    fs.writeFileSync(this._outputPath, content, "utf8");

    clear();
  }
}

module.exports = JestMarkdownReporter;

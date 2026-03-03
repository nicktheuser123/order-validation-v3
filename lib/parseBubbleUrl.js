/**
 * Parse a Bubble app URL to extract appId and version for Buildprint MCP.
 * Used when calling get_summary, get_json, search_json, get_tree, etc.
 *
 * Bubble URL structure:
 * - https://[appId].bubbleapps.io → live
 * - https://[appId].bubbleapps.io/version-test → test (Main branch)
 * - https://[appId].bubbleapps.io/version-<id> → custom branch (version = branch ID)
 *
 * For custom domains (e.g. https://myapp.com), use BUBBLE_API_BASE as fallback
 * — it typically has the form https://[appId].bubbleapps.io/api/1.1/obj
 *
 * @param {string} urlString - Bubble app URL or API base URL
 * @returns {{ appId: string|null, version: string }}
 */
function parseBubbleUrl(urlString) {
  if (!urlString || typeof urlString !== "string") {
    return { appId: null, version: "live" };
  }

  const url = new URL(urlString);
  const hostname = url.hostname;
  const pathname = url.pathname;
  let appId = null;
  let version = "live";

  if (hostname.endsWith(".bubbleapps.io")) {
    appId = hostname.replace(".bubbleapps.io", "");
  }

  const versionMatch = pathname.match(/\/version-(test|[^/]+)/);
  if (versionMatch) {
    version = versionMatch[1];
  }

  return { appId, version };
}

module.exports = { parseBubbleUrl };

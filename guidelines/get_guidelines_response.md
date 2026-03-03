# guidelines for buildprint mcp

Always call `get_guidelines` at the start of a session if you have not already fetched it.
After a guideline path has been fetched in the current session, do not fetch it again unless you need a reminder or the user asks for it.
Provide `paths` as an array (it can contain a single path).
In most sessions, also pull `exploring/app` early. It contains the default playbook for using `get_summary`, `get_tree`, `get_json`, and `search_json` effectively.
For front-end edits, fetch both `editing/apps` and `editing/frontend` before writing.
For front-end edits, prefer focused element paths (`schema/elements/types/<type>`, for example `schema/elements/types/group`, `schema/elements/types/input`) instead of pulling all element schemas at once.
When you use tools, do not narrate the tool calls (e.g. "searching JSON"). Only share results and conclusions unless the user asks how you found them.
If the user request is underspecified, ask for clarifying detail before exploring further (for example page name or feature area), but keep questions minimal.
Before responding, think through how you will present results and ensure friendly names are used in all user-facing output.
NEVER USE INTERNAL IDS IN FRONT OF THE USER. ALWAYS USE FRIENDLY NAMES.
If you have already seen a friendly name for an ID in this session, always use the friendly name and never fall back to the ID.
Bubble apps are represented as JSON in .bubble files.
App JSON is logic and never includes live data. If the user wants database or log data, you must use the data search/fetch tools.
Use JSON Pointer paths to target specific subtrees.
Treat IDs as opaque strings; do not infer meaning from them.

## What Buildprint can do

If the user asks what Buildprint is capable of, suggest concrete tasks they can try:

- Compare two app versions (code review-style): use `diff_versions` with `view: "merge"` to get a high-level summary, then follow `recommended_diff_json_calls` (or drill into `/api`, `/user_types`, `/option_sets`, or a specific page via `target`). Direction reminder: `fromVersion` is the incoming branch (being merged) and `toVersion` is the base branch (receiving the merge); in raw ops for `incoming -> base`, incoming-only items appear as `op: "remove"`.
- Explain parts of an app: use `get_summary` to find the right object, then `get_json` (scoped + depth-pruned), `get_tree` for page/reusable element structure, and `search_json` to locate workflows/actions/expressions by text or jq.
- Debug real issues: correlate Bubble server logs (`get_simple_logs`) and advanced logs (`get_advanced_logs`) with the relevant workflows/pages in the app JSON (via `search_json` + `get_json`).
- Explore live data (Bubble internal DB): use `search_data`, `fetch_data`, and `aggregate_data` to inspect records and run aggregates (requires Bubble editor access via the platform cookie).
- Monitor and alert on problems: use `create_monitor` / `update_monitor` / `list_monitors` / `delete_monitor` to set thresholds, match-event alerts, or anomaly detection for workflows or error rates.
- Share agent feedback about Buildprint: use `submit_feedback` with `app_id`, `title`, and `content` to report friction or bugs (for example, "I was doing X and it would've been easier if Y" or "I had trouble with tool P because of Q").
- Plan new features: identify the current patterns in pages/reusables/workflows, propose an incremental implementation plan, and point to the exact places in app JSON that would need to change.

## Introduction

Bubble is an AI-powered visual programming platform. Behind the scenes, Bubble is a JSON-based app programming language. You can read and edit this app JSON to build reliable apps that scale. These guidelines are intended to make it easy to understand Bubble and common patterns.

## App JSON primitives

App JSON is organised into several primitives.

### pages

`pages` are pages in Bubble. Pages contain various configuration values, as well as elements, and workflows.

### element_definitions

`element_definitions` are reusable elements. These are reusable components that can contain elements and workflows. They are similar to pages in other respects. Reusable elements can be nested (though not circularly).

### elements

`elements` only exist inside pages and reusable elements. They can be nested infinitely. If we have a reusable element we want to use on a page, then it is added as a child element, with an ID that points to the reusable element we want to use. Elements have various properties that allow you to configure their style and logic.

### expressions

Expressions in Bubble are also structured as JSON. Expressions must be structured correctly and avoid type issues.

### workflows

`workflows` are pieces of event driven logic in Bubble. All workflows have a trigger event. Workflows can live on pages, reusable elements, or on the `api` top level path. These refer to backend workflows. A backend workflow is essentially an API endpoint. When not exposed publicly, it can only be called using the Schedule API workflow action.
When locating app logic, always search both backend workflows (API events/custom events) and front-end workflows on pages/reusable elements.

### actions

`actions` are individual steps in workflows.

### user_types

`user_types` are data types set up by the user. These are essentially data tables with columns. Additionally, they can (and generally should) have privacy rules (`privacy_role`). These are a form of row-based + role-based access control which controls who can see data. These are the only mechanism to restrict data read in Bubble. To restrict data writes, we use appropriate conditions in workflows, as Things (individual objects in a data table) can only be modified through the context of a workflow if autobinding and the public Data API are disabled.

### option_sets

`option_sets` are enums. They can hold values and attributes, useful for static pieces of data like navigation variables, user roles, days of the week etc.

### styles

`styles` are reusable styles. A style is for a specific element type. Only one style can be applied to an element, but you can manually override styles too for full customisation.

## ID vs display

Bubble uses internal IDs for pages, elements, and workflows. These are stable references in the JSON, but they are not user-friendly.
When communicating with users, never show IDs. Always use friendly/readable names (e.g., page name, element name, workflow name).
Always prioritize friendly/readable names, even if internal IDs are present in the JSON.
If you must inspect or search by IDs internally, do so silently; strip IDs from all user-facing explanations.
The user has no reason to know the IDs and explicitly wants you to not include them in your response.

## Field naming

Never use raw field keys (e.g., `invited_users_list_user`) or shortened variants in user-facing explanations.
Always use the field display name (e.g., "Invited Users") when available.
Do not include raw keys or IDs in parentheses or inline notes; if a display name is unavailable, describe the concept without the key.

## Traversal tips

- Start at the root (`/`) to discover top-level collections. Common top-level keys include `pages`, `element_definitions`, `api`, `option_sets`, `styles`, `user_types`, and `_index`.
- Use `_index` to map names and IDs to paths. `page_name_to_id` and `page_name_to_path` are the quickest way to locate pages by name.
- Once you have an ID, you can fetch it by pointer (e.g. `/pages/AAX`) or by ID directly (e.g. `AAX`) using `get_json`.
- `id_to_path` is the most general mapping for elements/workflows; if a direct lookup fails, fall back to known top-level collections.
- Prefer `depth: 3` for ordinary traversal. Increase to `depth: 4+` only when inspecting larger workflow/action/expression subtrees.
- `get_json` adds `<key>_friendly` siblings (and `<key>_friendly` arrays) when it can resolve IDs/keys to display names. It may also add derived `order_friendly` on elements to show Bubble-computed sibling order. These are injected at runtime and are not present in raw Bubble JSON; keep raw fields for editing.

## Search tips

Use `search_json` to query with jq. The tool supports `mode: jq` for structural filters, plus `mode: text` or `mode: regex` for simple matching.
Search responses include `truncated`, `hasMore`, and `nextOffset`. Reuse `nextOffset` as `offset` with the same query params to fetch additional pages.

## Summary tool

Use `get_summary` to retrieve friendly lists of data types, option sets, page names, and reusable element names.

## Versions and syncing

Tools that accept a `version` expect the Bubble version ID, not the version name/label.
Version IDs are typically short (often 1-5 random letters/numbers).
If a version ID is all digits, pass it as a string (e.g. "123"). Tools expect `version` to be a string and will reject non-strings like numbers/null.
Before calling `sync_app`, use `list_project_versions` to find the correct version ID (unless the user already provided a link containing `/version-<id>/`).
Use `sync_app` with that version ID to sync an app version so JSON tools use the latest export if it's out of date.
If `sync_app` returns `status: in_progress`, immediately poll `get_sync_status` with the returned `versionId` every few seconds until it returns `status: completed` or `status: failed`.

## Tree tool

Use `get_tree` to retrieve a readable outline of the elements for a page, reusable element, or element subtree by ID, name, dot path (for example `pages.home.elements.hero`), or JSON Pointer. Pass `targets` (array, one or more entries) to fetch one or multiple trees in one call. The output includes element type and friendly type labels (set `include_text: true` to include text content; `include_types: false` to omit types; `include_ids: true` to show IDs; `include_paths: true` to show dot-notation edit paths; `include_layout: true` to include layout properties; `include_design: true` to include design properties; `include_properties: true` to include raw `properties` objects with exact values; `include_workflows: true` to include per-element workflow cross-references with workflow IDs and event types).

Examples:

- Find text values containing a string: `search_json { appId: "example-app", mode: "text", query: "404" }`
- Regex match keys and values: `search_json { appId: "example-app", mode: "regex", where: "both", query: "^page_" }`
- Structural jq filter: `search_json { appId: "example-app", mode: "jq", query: ".. | objects | select(.type? == \"workflow\")" }`
- Paginate search results: `search_json { appId: "example-app", mode: "text", query: "404", limit: 100, offset: 100 }`

## Edit capability

You are not able to edit applications directly, but have full read-only access.

## Authentication status

Authenticated as Abhishek Joseph.
Workspace: mx7ay5h5akj57kvyty3hkvdpd581xa56.
Accessible projects (1):

- FinArk (appId: finark, slug: finark)
Versions (most recent first):
  - live (last synced 2026-02-26T15:13:57.538Z)
  - test (last synced 2026-02-26T15:13:37.030Z)


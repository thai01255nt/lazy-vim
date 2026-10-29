// Ticket providers (tickets mirror, design v4): everything that differs between Linear, Jira and GitHub Issues.
// Pure data + tiny pure helpers; tickets.mjs owns the provider-neutral plan / record / diff / status logic.
// A provider's config lives in config[<name>] (same shape as LINEAR_DEFAULTS plus its own extras) and its map in
// .hitl/<name>.map.json; config.tickets.provider picks the active one (default "linear").

/** Shared defaults of every provider section (config[<provider>]). Linear's must deep-equal config.mjs DEFAULTS.linear. */
const BASE_DEFAULTS = {
  enabled: false,
  server: null, // MCP server name: the <server> in mcp__<server>__<tool> (one OAuth per workspace / site / account)
  team: null, // Linear team key · Jira project key · GitHub "owner/repo"
  project: null, // Linear: pinned existing project {id,name} · Jira: pinned epic {id,name} (name = the epic key) · GitHub: pinned milestone {id,name}
  changeAs: null, // provider-specific container kind for a change, or "none"; null = the provider default
  pushTodoAs: "unstarted",
  pushQuick: true,
  titlePrefix: false,
  labels: { risk: true, impl: true, phase: false },
  stateNames: {},
  autoPush: { onTasksApproved: false, onApprove: false, onReview: false },
  reviewComment: true,
  maxCreatePerPush: 50,
};

/**
 * Container kinds per provider: `kind` is the map/plan kind ("project" → ensureProject, "parent-issue" → ensureParent),
 * `container` is what the skill creates in the tracker. A change pinned to one existing container uses `project`.
 */
export const PROVIDERS = Object.freeze({
  linear: {
    name: "linear", label: "Linear", code: "LINEAR",
    defaults: BASE_DEFAULTS,
    changeAs: { project: { kind: "project", container: "project" }, "parent-issue": { kind: "parent-issue", container: "parent-issue" } },
    defaultChangeAs: "project",
    mcp: { url: "https://mcp.linear.app/mcp", server: "linear-server", match: /linear/i },
    workspace: { what: "workspace", fromUrl: (u) => /^https?:\/\/linear\.app\/([^/?#]+)/i.exec(u)?.[1]?.toLowerCase() || null },
    team: "team",
    priorityNames: { 1: "Urgent", 2: "High", 3: "Medium", 4: "Low" },
    labelsById: true, // label ids from init; Jira/GitHub labels are plain names
  },
  jira: {
    name: "jira", label: "Jira", code: "JIRA",
    defaults: { ...BASE_DEFAULTS, issueType: "Task", epicType: "Epic", priorityNames: null },
    changeAs: { epic: { kind: "parent-issue", container: "epic" }, "parent-issue": { kind: "parent-issue", container: "parent-issue" } },
    defaultChangeAs: "epic",
    mcp: { url: "https://mcp.atlassian.com/v1/mcp", server: "atlassian", match: /atlassian|jira/i },
    workspace: { what: "site", fromUrl: (u) => /^https?:\/\/([a-z0-9-]+\.atlassian\.net)/i.exec(u)?.[1]?.toLowerCase() || null },
    team: "project",
    priorityNames: { 1: "Highest", 2: "High", 3: "Medium", 4: "Low" },
    labelsById: false,
  },
  github: {
    name: "github", label: "GitHub", code: "GITHUB",
    defaults: { ...BASE_DEFAULTS, priorityField: "Priority", priorityLabels: false },
    changeAs: { milestone: { kind: "project", container: "milestone" }, "parent-issue": { kind: "parent-issue", container: "parent-issue" } },
    defaultChangeAs: "milestone",
    mcp: { url: "https://api.githubcopilot.com/mcp/", server: "github", match: /github/i },
    workspace: { what: "owner", fromUrl: (u) => /^https?:\/\/github\.com\/([^/?#]+)/i.exec(u)?.[1]?.toLowerCase() || null },
    team: "repository",
    priorityNames: { 1: "urgent", 2: "high", 3: "medium", 4: "low" },
    labelsById: false,
  },
});

export const PROVIDER_NAMES = Object.keys(PROVIDERS);

/** Active provider descriptor: config.tickets.provider, else "linear". An unknown name throws (exit 2 via the CLI). */
export function providerOf(config) {
  const name = String(config?.tickets?.provider || "linear").toLowerCase();
  const p = PROVIDERS[name];
  if (!p) throw Object.assign(new Error(`unknown tickets.provider "${name}" (one of ${PROVIDER_NAMES.join(", ")})`), { usage: true });
  return p;
}

/** Map kind + tracker container for the configured changeAs ("none" → null). Unknown values fall back to the default. */
export function containerOf(P, changeAs) {
  if (changeAs === "none") return null;
  return P.changeAs[changeAs] || P.changeAs[P.defaultChangeAs];
}

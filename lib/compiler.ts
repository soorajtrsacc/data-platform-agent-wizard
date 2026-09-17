import {
  generateClaudeMd,
  generateSettingsJson,
  generateLegacyMigrationRules,
  generateEngineRules,
  generateShellStandardsRules,
  generateOrchestrationRules,
  generatePreBashValidator,
  generatePostWriteLinter,
  generateMappingContract,
  generateArchitectureSpec,
  generateMcpConfig,
  generateCicdTemplate,
  generateRepoPolicyRules,
  generateDocReferencesRules,
  generateCursorRules,
  generateCopilotInstructions,
  generateWindsurfRules,
  generateCodexAgents,
  generateAiderConventions,
  generateClineRules,
  generateContinueConfig,
} from "./templates";
import { buildContextGraph, generateContextGraphUsage } from "./context-graph";

// ─── Core types ───────────────────────────────────────────────────────────────

export interface Environment {
  id: string;
  name: string;   // dev | staging | prod | uat | etc.
  notes: string;
}

export interface PlatformConfig {
  id: string;
  platform: string;   // bigquery | snowflake | databricks | palantir | ...
  cloud: string;      // gcp | aws | azure | onprem | any
  region: string;
  role: string;       // primary | secondary | source | archive
  notes: string;
}

export interface DataLayer {
  id: string;
  name: string;          // Raw | Bronze | Silver | Gold | Landing | Staging | Mart | ...
  description: string;
  platformId: string;    // references PlatformConfig.id
  pathTemplate: string;  // e.g. "project.silver_{env}" or "s3://bucket/{env}/silver/"
}

export interface SourceSystem {
  id: string;
  name: string;
  platform: string;      // teradata | oracle | sqlserver | postgres | s3 | api | ...
  isLegacy: boolean;
  legacyType: string;    // bteq | plsql | shell | none
  connectionNotes: string;
}

export interface MappingRow {
  [key: string]: string | undefined;
}

export interface AttachedDoc {
  name: string;
  mimeType: string;
  base64: string;
}

export interface McpServer {
  id: string;
  name: string;
  transport: "stdio" | "sse" | "http";
  command?: string;       // for stdio: e.g. "uvx mcp-server-bigquery"
  args?: string[];        // for stdio
  url?: string;           // for sse/http
  envVars: { key: string; value: string }[];
  description: string;
}

export interface RepoConfig {
  id: string;
  provider: "github" | "gitlab" | "azuredevops" | "bitbucket" | "other";
  url: string;
  branch: string;   // default branch, e.g. "main" or "master"
  name: string;     // optional human-readable alias
}

export interface WizardConfig {
  // Step 1 – Project
  projectName: string;
  architectureNotes: string;
  environments: Environment[];

  // Step 2 – Platforms
  platforms: PlatformConfig[];
  platformNotes: string;

  // Step 3 – Data Layers
  layers: DataLayer[];
  layerNotes: string;

  // Step 4 – Sources
  sources: SourceSystem[];
  sourceNotes: string;

  // Step 5 – Mappings
  mappingRows: MappingRow[];
  mappingFileNames: string[];

  // Step 6 – MCP Servers
  mcpServers: McpServer[];
  mcpNotes: string;

  // Step 7 – Deployment
  scheduler: string;
  cicd: string;          // jenkins | azure-pipelines | bamboo | github-actions | gitlab-ci | bitbucket-pipelines | ""
  repos: RepoConfig[];
  deploymentNotes: string;
  designNotes: string;
  codeStandardsNotes: string;

  // Global attached documents (Step 1)
  documents: AttachedDoc[];

  // Per-section attached documents — keys: "platforms" | "layers" | "sources" | "mappings" | "mcp" | "deployment"
  sectionDocs: Record<string, AttachedDoc[]>;

  // Step 1 – Agent selection (multi-select)
  agents: string[];  // ["claude-code", "cursor", "copilot", "windsurf", "codex", "aider", "cline", "continue"]
}

// ─── Workspace compiler ───────────────────────────────────────────────────────

export function compileWorkspace(c: WizardConfig): Record<string, string> {
  const files: Record<string, string> = {};
  const agents = c.agents ?? [];
  const isClaudeCode = agents.length === 0 || agents.includes("claude-code");

  // ── Claude Code specific files ──────────────────────────────────────────────
  if (isClaudeCode) {
    files["CLAUDE.md"] = generateClaudeMd(c);
    files[".claude/settings.json"] = generateSettingsJson(c);
    files[".claude/hooks/pre_bash_validator.py"] = generatePreBashValidator();
    files[".claude/hooks/post_write_linter.py"] = generatePostWriteLinter();
    files[".claude/rules/shell-standards.md"] = generateShellStandardsRules();

    // Per-platform rule files
    const seenEngines = new Set<string>();
    for (const p of c.platforms) {
      if (!seenEngines.has(p.platform)) {
        const rules = generateEngineRules(p.platform, c);
        if (rules) files[`.claude/rules/engine-${p.platform}.md`] = rules;
        seenEngines.add(p.platform);
      }
    }

    // Legacy migration rules
    const hasLegacy = c.sources.some((s) => s.isLegacy);
    if (hasLegacy) {
      files[".claude/rules/legacy-migration.md"] = generateLegacyMigrationRules(c);
    }

    // Orchestration rules
    if (c.scheduler) {
      files[`.claude/rules/orchestration-${c.scheduler}.md`] = generateOrchestrationRules(c);
    }

    // Repository policy rule file (always enforced by Claude Code)
    const repoPolicy = generateRepoPolicyRules(c);
    if (repoPolicy) {
      files[".claude/rules/repo-policy.md"] = repoPolicy;
    }

    // MCP server config
    if (c.mcpServers.length > 0) {
      files[".claude/mcp_config.json"] = generateMcpConfig(c);
    }

    // Context graph usage rules (Claude Code only)
    files[".claude/rules/context-graph-usage.md"] = generateContextGraphUsage(c);

    // Official documentation references
    files[".claude/rules/doc-references.md"] = generateDocReferencesRules(c);
  }

  // ── CI/CD pipeline template (generated if cicd is set, regardless of agent) ─
  if (c.cicd) {
    const cicdFile = generateCicdTemplate(c);
    if (cicdFile) {
      const [path, content] = cicdFile;
      files[path] = content;
    }
  }

  // ── Docs — always generated regardless of agent ─────────────────────────────

  // Context graph — serialised for use by MCP tools or external scripts
  const graph = buildContextGraph(c);
  const graphExport: Record<string, unknown> = {};
  graph.nodes.forEach((node, id) => {
    graphExport[id] = { kind: node.kind, label: node.label, body: node.body, edges: node.edges };
  });
  files["docs/context_graph.json"] = JSON.stringify(graphExport, null, 2);

  files["docs/mapping_contract.json"] = generateMappingContract(c);
  files["docs/architecture_spec.md"] = generateArchitectureSpec(c);

  // ── Per-agent instruction files ─────────────────────────────────────────────
  for (const agent of agents) {
    switch (agent) {
      case "cursor":
        files[".cursor/rules/project-context.mdc"] = generateCursorRules(c);
        break;
      case "copilot":
        files[".github/copilot-instructions.md"] = generateCopilotInstructions(c);
        break;
      case "windsurf":
        files[".windsurfrules"] = generateWindsurfRules(c);
        break;
      case "codex":
        files["AGENTS.md"] = generateCodexAgents(c);
        break;
      case "aider": {
        const [conventions, aiderConf] = generateAiderConventions(c);
        files["CONVENTIONS.md"] = conventions;
        files[".aider.conf.yml"] = aiderConf;
        break;
      }
      case "cline":
        files[".clinerules"] = generateClineRules(c);
        break;
      case "continue":
        files[".continue/config.json"] = generateContinueConfig(c);
        break;
    }
  }

  // ── Per-section documents (bundled into docs/sections/<section>/) ───────────
  for (const [section, docs] of Object.entries(c.sectionDocs ?? {})) {
    for (const doc of docs) {
      files[`docs/sections/${section}/${doc.name}`] = `__base64__${doc.base64}`;
    }
  }

  // ── Placeholder model stubs (layer-based) ───────────────────────────────────
  for (const layer of c.layers) {
    files[`models/${layer.name.toLowerCase().replace(/\s+/g, "_")}/.gitkeep`] = "";
  }
  if (c.layers.length === 0) {
    files["models/.gitkeep"] = "";
  }
  files["tests/singular/.gitkeep"] = "";

  // ── README — always generated ────────────────────────────────────────────────
  const primaryPlatform = c.platforms[0]?.platform ?? "bigquery";
  const agentNames = agents.length > 0 ? agents : ["claude-code"];
  const launchCmd = isClaudeCode ? "claude" : agents[0] === "cursor" ? "cursor ." : agents[0] === "copilot" ? "code ." : agents[0] ?? "claude";
  const AGENT_LABEL_MAP: Record<string, string> = {
    "claude-code": "Claude Code",
    cursor:        "Cursor",
    copilot:       "GitHub Copilot",
    windsurf:      "Windsurf",
    codex:         "Codex CLI",
    aider:         "Aider",
    cline:         "Cline",
    continue:      "Continue.dev",
  };
  files["README.md"] = `# ${c.projectName || "My Pipeline"} — AI Coding Agent Workspace

Generated by the Pipeline Coding Agent Intake Wizard.

## Agents Configured
${agentNames.map((a) => `- ${AGENT_LABEL_MAP[a] ?? a}`).join("\n")}

## Environments
${c.environments.map((e) => `- \`${e.name}\``).join("\n")}

## Quick Start
\`\`\`bash
# Open in your AI coding agent
${launchCmd}

# Issue workflow commands
MIGRATE legacy/scripts/daily_load.bteq TO ${primaryPlatform}
VALIDATE daily_load
BUILD gold_mart
\`\`\`

${isClaudeCode ? "See `CLAUDE.md` for full command reference and platform-specific rules." : "See the agent-specific instruction file for setup details."}
`;

  return files;
}

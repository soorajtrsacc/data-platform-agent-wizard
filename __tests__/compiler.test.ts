import { compileWorkspace } from "../lib/compiler";
import type { WizardConfig } from "../lib/compiler";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 8);

function baseConfig(overrides: Partial<WizardConfig> = {}): WizardConfig {
  return {
    projectName: "test-pipeline",
    architectureNotes: "Medallion on BigQuery",
    environments: [
      { id: "e1", name: "dev", notes: "" },
      { id: "e2", name: "prod", notes: "" },
    ],
    platforms: [
      { id: "p1", platform: "bigquery", cloud: "gcp", region: "europe-west2", role: "primary", notes: "" },
    ],
    platformNotes: "",
    layers: [
      { id: "l1", name: "Bronze", description: "Raw ingestion", platformId: "p1", pathTemplate: "project.bronze_{env}" },
      { id: "l2", name: "Silver", description: "Cleaned", platformId: "p1", pathTemplate: "project.silver_{env}" },
      { id: "l3", name: "Gold", description: "Aggregated", platformId: "p1", pathTemplate: "project.gold_{env}" },
    ],
    layerNotes: "",
    sources: [],
    sourceNotes: "",
    mappingRows: [],
    mappingFileNames: [],
    mcpServers: [],
    mcpNotes: "",
    scheduler: "airflow",
    cicd: "github-actions",
    repos: [{ id: "r1", provider: "github", url: "https://github.com/org/repo", branch: "main", name: "repo" }],
    deploymentNotes: "Deploy via CI",
    designNotes: "",
    codeStandardsNotes: "",
    documents: [],
    sectionDocs: {},
    ...overrides,
  };
}

// ─── compileWorkspace ─────────────────────────────────────────────────────────

describe("compileWorkspace — core files", () => {
  it("emits CLAUDE.md", () => {
    const files = compileWorkspace(baseConfig());
    expect(files["CLAUDE.md"]).toBeDefined();
    expect(files["CLAUDE.md"]).toContain("test-pipeline");
  });

  it("emits .claude/settings.json as valid JSON", () => {
    const files = compileWorkspace(baseConfig());
    expect(() => JSON.parse(files[".claude/settings.json"])).not.toThrow();
  });

  it("emits pre_bash_validator.py hook", () => {
    const files = compileWorkspace(baseConfig());
    expect(files[".claude/hooks/pre_bash_validator.py"]).toContain("DROP TABLE");
  });

  it("emits post_write_linter.py hook", () => {
    const files = compileWorkspace(baseConfig());
    expect(files[".claude/hooks/post_write_linter.py"]).toContain("sqlfluff");
  });

  it("emits shell-standards.md", () => {
    const files = compileWorkspace(baseConfig());
    expect(files[".claude/rules/shell-standards.md"]).toContain("set -euo pipefail");
  });

  it("emits docs/mapping_contract.json as valid JSON", () => {
    const files = compileWorkspace(baseConfig());
    expect(() => JSON.parse(files["docs/mapping_contract.json"])).not.toThrow();
  });

  it("emits docs/architecture_spec.md", () => {
    const files = compileWorkspace(baseConfig());
    expect(files["docs/architecture_spec.md"]).toContain("test-pipeline");
  });

  it("emits README.md", () => {
    const files = compileWorkspace(baseConfig());
    expect(files["README.md"]).toContain("Claude Code");
  });
});

// ─── Platform rule files ──────────────────────────────────────────────────────

describe("compileWorkspace — platform rules", () => {
  it("emits BigQuery engine rules", () => {
    const files = compileWorkspace(baseConfig());
    expect(files[".claude/rules/engine-bigquery.md"]).toContain("GoogleSQL");
    expect(files[".claude/rules/engine-bigquery.md"]).toContain("SAFE_CAST");
  });

  it("emits Snowflake engine rules", () => {
    const files = compileWorkspace(
      baseConfig({
        platforms: [{ id: "p1", platform: "snowflake", cloud: "aws", region: "us-east-1", role: "primary", notes: "" }],
        layers: [{ id: "l1", name: "Bronze", description: "", platformId: "p1", pathTemplate: "db.bronze_{env}" }],
      })
    );
    expect(files[".claude/rules/engine-snowflake.md"]).toContain("QUALIFY");
  });

  it("emits Databricks engine rules with Unity Catalog", () => {
    const files = compileWorkspace(
      baseConfig({
        platforms: [{ id: "p1", platform: "databricks", cloud: "azure", region: "eastus", role: "primary", notes: "" }],
        layers: [{ id: "l1", name: "Bronze", description: "", platformId: "p1", pathTemplate: "catalog.bronze_{env}" }],
      })
    );
    expect(files[".claude/rules/engine-databricks.md"]).toContain("Unity Catalog");
    expect(files[".claude/rules/engine-databricks.md"]).toContain("OPTIMIZE");
  });

  it("emits Palantir engine rules with Polars", () => {
    const files = compileWorkspace(
      baseConfig({
        platforms: [{ id: "p1", platform: "palantir", cloud: "onprem", region: "", role: "primary", notes: "" }],
        layers: [{ id: "l1", name: "Bronze", description: "", platformId: "p1", pathTemplate: "/project/bronze" }],
      })
    );
    const rules = files[".claude/rules/engine-palantir.md"];
    expect(rules).toContain("@transform");
    expect(rules).toContain("@incremental");
    expect(rules).toContain("polars");
    expect(rules).toContain("pl.from_arrow");
    expect(rules).toContain("LazyFrame");
  });

  it("does NOT emit duplicate engine rules for same platform used twice", () => {
    const files = compileWorkspace(
      baseConfig({
        platforms: [
          { id: "p1", platform: "bigquery", cloud: "gcp", region: "us-central1", role: "primary", notes: "" },
          { id: "p2", platform: "bigquery", cloud: "gcp", region: "europe-west2", role: "secondary", notes: "" },
        ],
      })
    );
    // Only one bigquery rules file should be created (key check)
    expect(files[".claude/rules/engine-bigquery.md"]).toBeDefined();
    // No second entry
    expect(Object.keys(files).filter((k) => k === ".claude/rules/engine-bigquery.md")).toHaveLength(1);
  });

  it("emits orchestration rules when scheduler is set", () => {
    const files = compileWorkspace(baseConfig({ scheduler: "airflow" }));
    expect(files[".claude/rules/orchestration-airflow.md"]).toContain("Airflow");
  });

  it("does NOT emit orchestration rules when scheduler is empty", () => {
    const files = compileWorkspace(baseConfig({ scheduler: "" }));
    expect(files[".claude/rules/orchestration-.md"]).toBeUndefined();
  });
});

// ─── Layer scaffold ───────────────────────────────────────────────────────────

describe("compileWorkspace — layer scaffolding", () => {
  it("creates model directories for each layer", () => {
    const files = compileWorkspace(baseConfig());
    expect(files["models/bronze/.gitkeep"]).toBeDefined();
    expect(files["models/silver/.gitkeep"]).toBeDefined();
    expect(files["models/gold/.gitkeep"]).toBeDefined();
  });

  it("uses fallback models/.gitkeep when no layers", () => {
    const files = compileWorkspace(baseConfig({ layers: [] }));
    expect(files["models/.gitkeep"]).toBeDefined();
  });

  it("normalises layer names to snake_case directory names", () => {
    const files = compileWorkspace(
      baseConfig({
        layers: [{ id: "l1", name: "Raw Bronze", description: "", platformId: "p1", pathTemplate: "" }],
      })
    );
    expect(files["models/raw_bronze/.gitkeep"]).toBeDefined();
  });
});

// ─── Legacy migration ─────────────────────────────────────────────────────────

describe("compileWorkspace — legacy migration rules", () => {
  it("emits legacy-migration.md when a source is marked legacy", () => {
    const files = compileWorkspace(
      baseConfig({
        sources: [{ id: "s1", name: "Teradata DWH", platform: "teradata", isLegacy: true, legacyType: "bteq", connectionNotes: "" }],
      })
    );
    expect(files[".claude/rules/legacy-migration.md"]).toContain("BTEQ");
    expect(files[".claude/rules/legacy-migration.md"]).toContain("Teradata");
  });

  it("emits Oracle translation table when legacyType is plsql", () => {
    const files = compileWorkspace(
      baseConfig({
        sources: [{ id: "s1", name: "Oracle ERP", platform: "oracle", isLegacy: true, legacyType: "plsql", connectionNotes: "" }],
      })
    );
    expect(files[".claude/rules/legacy-migration.md"]).toContain("NVL");
    expect(files[".claude/rules/legacy-migration.md"]).toContain("DECODE");
  });

  it("does NOT emit legacy-migration.md when no sources are legacy", () => {
    const files = compileWorkspace(
      baseConfig({
        sources: [{ id: "s1", name: "Kafka", platform: "kafka", isLegacy: false, legacyType: "none", connectionNotes: "" }],
      })
    );
    expect(files[".claude/rules/legacy-migration.md"]).toBeUndefined();
  });
});

// ─── MCP server config ────────────────────────────────────────────────────────

describe("compileWorkspace — MCP config", () => {
  it("emits .claude/mcp_config.json when MCP servers are configured", () => {
    const files = compileWorkspace(
      baseConfig({
        mcpServers: [
          { id: "m1", name: "bigquery", transport: "stdio", command: "uvx", args: ["mcp-server-bigquery"], envVars: [], description: "" },
        ],
      })
    );
    const parsed = JSON.parse(files[".claude/mcp_config.json"]);
    expect(parsed.mcpServers.bigquery).toBeDefined();
    expect(parsed.mcpServers.bigquery.type).toBe("stdio");
    expect(parsed.mcpServers.bigquery.command).toBe("uvx");
  });

  it("emits HTTP transport for SSE/HTTP MCP servers", () => {
    const files = compileWorkspace(
      baseConfig({
        mcpServers: [
          { id: "m1", name: "palantir", transport: "http", url: "https://foundry.example.com/api/mcp/v1", envVars: [], description: "" },
        ],
      })
    );
    const parsed = JSON.parse(files[".claude/mcp_config.json"]);
    expect(parsed.mcpServers.palantir.type).toBe("http");
    expect(parsed.mcpServers.palantir.url).toBe("https://foundry.example.com/api/mcp/v1");
  });

  it("includes env vars in MCP config", () => {
    const files = compileWorkspace(
      baseConfig({
        mcpServers: [
          {
            id: "m1", name: "airflow", transport: "stdio", command: "uvx",
            args: ["mcp-server-airflow"],
            envVars: [{ key: "AIRFLOW_BASE_URL", value: "https://airflow.example.com" }],
            description: "",
          },
        ],
      })
    );
    const parsed = JSON.parse(files[".claude/mcp_config.json"]);
    expect(parsed.mcpServers.airflow.env.AIRFLOW_BASE_URL).toBe("https://airflow.example.com");
  });

  it("does NOT emit .claude/mcp_config.json when no MCP servers", () => {
    const files = compileWorkspace(baseConfig({ mcpServers: [] }));
    expect(files[".claude/mcp_config.json"]).toBeUndefined();
  });
});

// ─── Mapping contract ─────────────────────────────────────────────────────────

describe("compileWorkspace — mapping contract", () => {
  it("embeds mapping rows in mapping_contract.json", () => {
    const files = compileWorkspace(
      baseConfig({
        mappingRows: [{ source_table: "DIM_CUSTOMER", target_table: "silver_customers" }],
        mappingFileNames: ["mapping.csv"],
      })
    );
    const parsed = JSON.parse(files["docs/mapping_contract.json"]);
    expect(parsed.mappings).toHaveLength(1);
    expect(parsed.mappings[0].source_table).toBe("DIM_CUSTOMER");
  });

  it("records source file names in mapping metadata", () => {
    const files = compileWorkspace(
      baseConfig({ mappingRows: [], mappingFileNames: ["sheet.xlsx"] })
    );
    const parsed = JSON.parse(files["docs/mapping_contract.json"]);
    expect(parsed.metadata.sourceFiles).toContain("sheet.xlsx");
  });
});

// ─── CLAUDE.md content ────────────────────────────────────────────────────────

describe("generateClaudeMd — content checks", () => {
  it("lists all environments in CLAUDE.md", () => {
    const files = compileWorkspace(baseConfig());
    const md = files["CLAUDE.md"];
    expect(md).toContain("dev");
    expect(md).toContain("prod");
  });

  it("includes layer order in orchestration section", () => {
    const files = compileWorkspace(baseConfig());
    const md = files["CLAUDE.md"];
    expect(md).toContain("Bronze");
    expect(md).toContain("Silver");
    expect(md).toContain("Gold");
  });

  it("contains {env} path template notation", () => {
    const files = compileWorkspace(baseConfig());
    expect(files["CLAUDE.md"]).toContain("{env}");
  });

  it("includes sqlfluff dialect bigquery for BigQuery primary platform", () => {
    const files = compileWorkspace(baseConfig());
    expect(files["CLAUDE.md"]).toContain("bigquery");
  });

  it("shows project name in header", () => {
    const files = compileWorkspace(baseConfig({ projectName: "my-special-project" }));
    expect(files["CLAUDE.md"]).toContain("my-special-project");
  });
});

// ─── settings.json dialect ────────────────────────────────────────────────────

describe("generateSettingsJson — dialect routing", () => {
  it("uses bigquery dialect for BigQuery platform", () => {
    const files = compileWorkspace(baseConfig());
    const settings = JSON.parse(files[".claude/settings.json"]);
    const postHook = settings.hooks.PostToolUse[0].hooks[0].command as string;
    expect(postHook).toContain("--dialect bigquery");
  });

  it("uses sparksql dialect for PySpark platform", () => {
    const files = compileWorkspace(
      baseConfig({
        platforms: [{ id: "p1", platform: "pyspark", cloud: "aws", region: "us-east-1", role: "primary", notes: "" }],
      })
    );
    const settings = JSON.parse(files[".claude/settings.json"]);
    const postHook = settings.hooks.PostToolUse[0].hooks[0].command as string;
    expect(postHook).toContain("--dialect sparksql");
  });

  it("uses tsql dialect for Synapse platform", () => {
    const files = compileWorkspace(
      baseConfig({
        platforms: [{ id: "p1", platform: "synapse", cloud: "azure", region: "eastus", role: "primary", notes: "" }],
      })
    );
    const settings = JSON.parse(files[".claude/settings.json"]);
    const postHook = settings.hooks.PostToolUse[0].hooks[0].command as string;
    expect(postHook).toContain("--dialect tsql");
  });
});

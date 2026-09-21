/**
 * Runbook integration test — mirrors TESTING_RUNBOOK.md.
 * Validates the full Medallion dbt config produces the correct workspace.
 */
import { compileWorkspace, WizardConfig } from "../lib/compiler";

const runbookConfig: WizardConfig = {
  projectName: "dbt-gcp-medallion-pipeline",
  architectureNotes:
    "Medallion Architecture on GCP BigQuery + dbt. Bronze/Silver/Gold/Ops layers. " +
    "Project: acn-uki-ds-data-ai-project, region europe-west2. " +
    "26 Bronze source tables, 26 Silver models, 6 Gold canonical entities, Ops DQ/reconciliation.",
  agents: ["claude-code"],

  environments: [
    { id: "e1", name: "dev", notes: "" },
    { id: "e2", name: "staging", notes: "" },
    { id: "e3", name: "prod", notes: "" },
  ],

  platforms: [
    {
      id: "p1",
      platform: "bigquery",
      cloud: "gcp",
      region: "europe-west2",
      role: "primary",
      notes: "Project: acn-uki-ds-data-ai-project. dbt datasets: credit_card_synt (Bronze), silver, gold, ops.",
    },
  ],
  platformNotes: "",

  layers: [
    { id: "l1", name: "Bronze", description: "26 raw synthetic credit-card source tables", platformId: "p1", pathTemplate: "acn-uki-ds-data-ai-project.credit_card_synt" },
    { id: "l2", name: "Silver", description: "26 silver_* dbt models with SAFE_CAST + DQ columns", platformId: "p1", pathTemplate: "acn-uki-ds-data-ai-project.silver" },
    { id: "l3", name: "Gold", description: "6 canonical entities", platformId: "p1", pathTemplate: "acn-uki-ds-data-ai-project.gold" },
    { id: "l4", name: "Ops", description: "DQ reports and reconciliation", platformId: "p1", pathTemplate: "acn-uki-ds-data-ai-project.ops" },
  ],
  layerNotes: "Bronze: raw → Silver: SAFE_CAST+DQ → Gold: canonical joins → Ops: DQ reports. All layers europe-west2.",

  sources: [
    {
      id: "s1",
      name: "Credit Card Synthetic Data (BigQuery)",
      platform: "bigquery",
      isLegacy: false,
      legacyType: "none",
      connectionNotes: "Dataset: acn-uki-ds-data-ai-project.credit_card_synt (europe-west2). Accessed via dbt source() macros.",
    },
  ],
  sourceNotes: "",

  mappingRows: [
    { source_layer: "bronze", source_object: "customers", target_layer: "silver", target_object: "silver_customers", primary_key: "customer_id", dbt_model: "silver_customers", output_dataset: "silver" },
    { source_layer: "bronze", source_object: "accounts", target_layer: "silver", target_object: "silver_accounts", primary_key: "account_id", dbt_model: "silver_accounts", output_dataset: "silver" },
    { source_layer: "bronze", source_object: "transactions", target_layer: "silver", target_object: "silver_transactions", primary_key: "transaction_id", dbt_model: "silver_transactions", output_dataset: "silver" },
    { source_layer: "bronze", source_object: "credit_cards", target_layer: "silver", target_object: "silver_credit_cards", primary_key: "card_id", dbt_model: "silver_credit_cards", output_dataset: "silver" },
    { source_layer: "silver", source_object: "silver_customers+silver_accounts+silver_credit_cards", target_layer: "gold", target_object: "gold_customer_360", primary_key: "customer_id", dbt_model: "gold_customer_360", output_dataset: "gold" },
    { source_layer: "silver", source_object: "silver_transactions+silver_merchants", target_layer: "gold", target_object: "gold_transaction_360", primary_key: "transaction_id", dbt_model: "gold_transaction_360", output_dataset: "gold" },
  ],
  mappingFileNames: ["03_Mapping_Document.xlsx"],

  mcpServers: [
    {
      id: "mcp1",
      name: "bigquery",
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-bigquery", "--project", "acn-uki-ds-data-ai-project", "--location", "europe-west2"],
      envVars: [],
      description: "BigQuery MCP server for live SQL queries",
    },
  ],
  mcpNotes: "",

  scheduler: "dbt-cloud",
  cicd: "github-actions",
  repos: [
    {
      id: "r1",
      provider: "github",
      url: "https://github.com/soorajtrsacc/dbt_gcp.git",
      branch: "master",
      name: "dbt_gcp",
    },
  ],
  deploymentNotes: "",
  designNotes: "",
  codeStandardsNotes: "",
  documents: [],
  sectionDocs: {},
};

describe("Runbook — Medallion dbt Workspace", () => {
  let files: Record<string, string>;

  beforeAll(() => {
    files = compileWorkspace(runbookConfig);
  });

  // ── File presence ────────────────────────────────────────────────────────────

  const EXPECTED_FILES = [
    "CLAUDE.md",
    ".claude/settings.json",
    ".claude/hooks/pre_bash_validator.py",
    ".claude/hooks/post_write_linter.py",
    ".claude/rules/shell-standards.md",
    ".claude/rules/engine-bigquery.md",
    ".claude/rules/repo-policy.md",
    ".claude/rules/doc-references.md",
    ".claude/mcp_config.json",
    ".github/workflows/ci.yml",
    "docs/mapping_contract.json",
    "docs/architecture_spec.md",
    "docs/context_graph.json",
    "models/bronze/.gitkeep",
    "models/silver/.gitkeep",
    "models/gold/.gitkeep",
    "models/ops/.gitkeep",
    "README.md",
  ];

  test.each(EXPECTED_FILES)("emits file: %s", (f) => {
    expect(f in files).toBe(true);
  });

  // ── CLAUDE.md content ────────────────────────────────────────────────────────

  describe("CLAUDE.md", () => {
    test("contains project name", () => expect(files["CLAUDE.md"]).toContain("dbt-gcp-medallion-pipeline"));
    test("contains BQ project ID", () => expect(files["CLAUDE.md"]).toContain("acn-uki-ds-data-ai-project"));
    test("contains region", () => expect(files["CLAUDE.md"]).toContain("europe-west2"));
    test("contains repo URL", () => expect(files["CLAUDE.md"]).toContain("https://github.com/soorajtrsacc/dbt_gcp.git"));
    test("contains Bronze layer", () => expect(files["CLAUDE.md"]).toContain("Bronze"));
    test("contains Gold layer", () => expect(files["CLAUDE.md"]).toContain("Gold"));
  });

  // ── Repo policy ──────────────────────────────────────────────────────────────

  describe("repo-policy.md", () => {
    test("contains clone step", () => expect(files[".claude/rules/repo-policy.md"]).toContain("git clone"));
    test("contains push step", () => expect(files[".claude/rules/repo-policy.md"]).toContain("git push"));
    test("contains force-push prohibition", () => expect(files[".claude/rules/repo-policy.md"]).toMatch(/force.push|no-force|force push/i));
  });

  // ── BigQuery engine rules ────────────────────────────────────────────────────

  describe("engine-bigquery.md", () => {
    test("contains SAFE_CAST", () => expect(files[".claude/rules/engine-bigquery.md"]).toContain("SAFE_CAST"));
    test("no SELECT *", () => expect(files[".claude/rules/engine-bigquery.md"]).toMatch(/SELECT \*/));
  });

  // ── MCP config ───────────────────────────────────────────────────────────────

  describe(".claude/mcp_config.json", () => {
    test("contains MCP server name", () => expect(files[".claude/mcp_config.json"]).toContain("mcp-server-bigquery"));
    test("contains project ID", () => expect(files[".claude/mcp_config.json"]).toContain("acn-uki-ds-data-ai-project"));
    test("is valid JSON", () => expect(() => JSON.parse(files[".claude/mcp_config.json"])).not.toThrow());
  });

  // ── CI/CD ────────────────────────────────────────────────────────────────────

  describe(".github/workflows/ci.yml", () => {
    test("contains dbt build", () => expect(files[".github/workflows/ci.yml"]).toContain("dbt build"));
    test("triggers on pull_request to master", () => {
      const yml = files[".github/workflows/ci.yml"];
      expect(yml).toMatch(/pull_request|push/);
      expect(yml).toContain("master");
    });
  });

  // ── Mapping contract ─────────────────────────────────────────────────────────

  describe("docs/mapping_contract.json", () => {
    test("is valid JSON", () => expect(() => JSON.parse(files["docs/mapping_contract.json"])).not.toThrow());
    test("contains silver_customers", () => expect(files["docs/mapping_contract.json"]).toContain("silver_customers"));
    test("contains gold_customer_360", () => expect(files["docs/mapping_contract.json"]).toContain("gold_customer_360"));
  });

  // ── Doc references ───────────────────────────────────────────────────────────

  describe(".claude/rules/doc-references.md", () => {
    test("contains BigQuery docs URL", () => expect(files[".claude/rules/doc-references.md"]).toContain("cloud.google.com/bigquery"));
    test("contains dbt docs URL", () => expect(files[".claude/rules/doc-references.md"]).toContain("docs.getdbt.com"));
    test("contains GitHub Actions URL", () => expect(files[".claude/rules/doc-references.md"]).toContain("docs.github.com"));
  });

  // ── Architecture spec ────────────────────────────────────────────────────────

  describe("docs/architecture_spec.md", () => {
    test("contains all 4 layers", () => {
      const spec = files["docs/architecture_spec.md"];
      expect(spec).toContain("Bronze");
      expect(spec).toContain("Silver");
      expect(spec).toContain("Gold");
      expect(spec).toContain("Ops");
    });
  });
});

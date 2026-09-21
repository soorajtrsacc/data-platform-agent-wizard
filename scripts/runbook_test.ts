/**
 * Programmatic runbook test — mirrors TESTING_RUNBOOK.md.
 * Run: npx tsx scripts/runbook_test.ts
 */
import { compileWorkspace, WizardConfig } from "../lib/compiler";
import JSZip from "jszip";
import * as fs from "fs";
import * as path from "path";

// ─── Config matching the testing runbook ─────────────────────────────────────

const config: WizardConfig = {
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
    { id: "l3", name: "Gold", description: "6 canonical entities: customer_360, transaction_360, merchant_performance, account_financial_summary, fraud_case_360, rewards_engagement", platformId: "p1", pathTemplate: "acn-uki-ds-data-ai-project.gold" },
    { id: "l4", name: "Ops", description: "Mapping seeds, gold_data_quality_report, medallion_reconciliation_report", platformId: "p1", pathTemplate: "acn-uki-ds-data-ai-project.ops" },
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
    { source_layer: "bronze", source_object: "customers",     target_layer: "silver", target_object: "silver_customers",    primary_key: "customer_id",    dbt_model: "silver_customers",    output_dataset: "silver" },
    { source_layer: "bronze", source_object: "accounts",      target_layer: "silver", target_object: "silver_accounts",     primary_key: "account_id",     dbt_model: "silver_accounts",     output_dataset: "silver" },
    { source_layer: "bronze", source_object: "transactions",  target_layer: "silver", target_object: "silver_transactions", primary_key: "transaction_id", dbt_model: "silver_transactions", output_dataset: "silver" },
    { source_layer: "bronze", source_object: "credit_cards",  target_layer: "silver", target_object: "silver_credit_cards", primary_key: "card_id",        dbt_model: "silver_credit_cards", output_dataset: "silver" },
    { source_layer: "silver", source_object: "silver_customers+silver_accounts+silver_credit_cards", target_layer: "gold", target_object: "gold_customer_360",    primary_key: "customer_id",    dbt_model: "gold_customer_360",    output_dataset: "gold" },
    { source_layer: "silver", source_object: "silver_transactions+silver_merchants",                 target_layer: "gold", target_object: "gold_transaction_360", primary_key: "transaction_id", dbt_model: "gold_transaction_360", output_dataset: "gold" },
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

// ─── Run compiler ─────────────────────────────────────────────────────────────

console.log("\n=== Pipeline Coding Agent — Runbook Test ===\n");
console.log(`Project : ${config.projectName}`);
console.log(`Agents  : ${config.agents.join(", ")}`);
console.log(`Layers  : ${config.layers.map(l => l.name).join(", ")}`);
console.log(`MCP     : ${config.mcpServers.map(m => m.name).join(", ")}`);
console.log(`Repo    : ${config.repos[0].url}`);
console.log(`CI/CD   : ${config.cicd}`);
console.log("");

const files = compileWorkspace(config);

// ─── Verify expected files ────────────────────────────────────────────────────

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

const CONTENT_CHECKS: [string, string, string][] = [
  ["CLAUDE.md", "dbt-gcp-medallion-pipeline", "project name"],
  ["CLAUDE.md", "acn-uki-ds-data-ai-project", "BQ project ID"],
  ["CLAUDE.md", "europe-west2", "region"],
  ["CLAUDE.md", "https://github.com/soorajtrsacc/dbt_gcp.git", "repo URL"],
  [".claude/rules/repo-policy.md", "git clone", "clone step"],
  [".claude/rules/repo-policy.md", "git push", "push step"],
  [".claude/rules/engine-bigquery.md", "SAFE_CAST", "SAFE_CAST rule"],
  [".claude/mcp_config.json", "mcp-server-bigquery", "MCP server"],
  [".claude/mcp_config.json", "acn-uki-ds-data-ai-project", "MCP project"],
  [".github/workflows/ci.yml", "dbt build", "dbt build step"],
  ["docs/mapping_contract.json", "silver_customers", "mapping row"],
  ["docs/architecture_spec.md", "Bronze", "Bronze layer"],
  ["docs/architecture_spec.md", "Gold", "Gold layer"],
  [".claude/rules/doc-references.md", "cloud.google.com/bigquery", "BigQuery docs URL"],
  [".claude/rules/doc-references.md", "docs.getdbt.com", "dbt docs URL"],
];

let passed = 0;
let failed = 0;

console.log("── File presence checks ──────────────────────────────────────────");
for (const f of EXPECTED_FILES) {
  const ok = f in files;
  console.log(`  ${ok ? "✓" : "✗"} ${f}`);
  ok ? passed++ : failed++;
}

console.log("\n── Content checks ────────────────────────────────────────────────");
for (const [file, needle, label] of CONTENT_CHECKS) {
  const content = files[file] ?? "";
  const ok = content.includes(needle);
  console.log(`  ${ok ? "✓" : "✗"} ${file} contains [${label}]`);
  ok ? passed++ : failed++;
}

// ─── Generate ZIP ─────────────────────────────────────────────────────────────

console.log("\n── Generating ZIP ────────────────────────────────────────────────");
const zip = new JSZip();
for (const [filePath, content] of Object.entries(files)) {
  zip.file(filePath, content);
}

zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }).then((zipBuffer) => {
  const zipName = `${config.projectName}-workspace.zip`;
  const zipPath = path.join(process.cwd(), zipName);
  fs.writeFileSync(zipPath, zipBuffer);
  console.log(`  ✓ ZIP saved: ${zipPath}`);
  console.log(`  ✓ ZIP size: ${(zipBuffer.length / 1024).toFixed(1)} KB`);
  console.log(`  ✓ Files in ZIP: ${Object.keys(files).length}`);

  // ─── Summary ────────────────────────────────────────────────────────────────

  console.log("\n── Test Summary ──────────────────────────────────────────────────");
  console.log(`  Passed : ${passed}`);
  console.log(`  Failed : ${failed}`);
  console.log(`  Total  : ${passed + failed}`);
  console.log("");

  if (failed === 0) {
    console.log("  ✅  ALL CHECKS PASSED — workspace is valid\n");
    process.exit(0);
  } else {
    console.log("  ❌  SOME CHECKS FAILED — review output above\n");
    process.exit(1);
  }
});

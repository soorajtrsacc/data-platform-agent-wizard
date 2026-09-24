"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import Papa from "papaparse";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MappingRow {
  [key: string]: string | undefined;
}

type ChangeType = "new" | "modify" | "both";

interface FeatureConfig {
  projectName: string;
  repoUrl: string;
  repoProvider: "github" | "gitlab" | "azuredevops" | "bitbucket" | "other";
  baseBranch: string;
  featureBranch: string;
  platform: string;
  targetLayers: string[];   // multi-select
  changeType: ChangeType;   // new tables | modify existing | both
  featureDescription: string;
  mappingRows: MappingRow[];
  mappingFileNames: string[];
  agents: string[];
  mcpAvailable: boolean;
  additionalNotes: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_OPTIONS = [
  { value: "bigquery",   label: "BigQuery (GoogleSQL)" },
  { value: "snowflake",  label: "Snowflake (Snowpark / SQL)" },
  { value: "databricks", label: "Databricks (Delta Lake / Unity Catalog)" },
  { value: "palantir",   label: "Palantir Foundry (Python Transforms)" },
  { value: "redshift",   label: "Amazon Redshift" },
  { value: "synapse",    label: "Azure Synapse Analytics" },
  { value: "fabric",     label: "Microsoft Fabric (Lakehouse)" },
  { value: "dbt",        label: "dbt Core / dbt Cloud" },
];

const LAYER_OPTIONS = [
  { value: "bronze",   label: "Bronze / Raw" },
  { value: "silver",   label: "Silver / Curated" },
  { value: "gold",     label: "Gold / Mart" },
  { value: "landing",  label: "Landing / Staging" },
  { value: "platinum", label: "Platinum / Analytics" },
  { value: "other",    label: "Other / Custom" },
];

const REPO_PROVIDER_OPTIONS = [
  { value: "github",      label: "GitHub" },
  { value: "gitlab",      label: "GitLab" },
  { value: "azuredevops", label: "Azure DevOps" },
  { value: "bitbucket",   label: "Bitbucket" },
  { value: "other",       label: "Other Git" },
];

const AGENT_OPTIONS = [
  { value: "claude-code", label: "Claude Code",   note: "Anthropic" },
  { value: "cursor",      label: "Cursor",         note: "Anysphere" },
  { value: "copilot",     label: "GitHub Copilot", note: "Microsoft" },
  { value: "windsurf",    label: "Windsurf",        note: "Codeium" },
];

const TOTAL = 4;

// ─── CLAUDE.md generator ──────────────────────────────────────────────────────

function generateFeatureClaudeMd(c: FeatureConfig): string {
  const repoDir = c.repoUrl.split("/").pop()?.replace(/\.git$/, "") ?? "repo";
  const platformLabel = PLATFORM_OPTIONS.find((p) => p.value === c.platform)?.label ?? c.platform;
  const layerLabels = c.targetLayers.map(
    (l) => LAYER_OPTIONS.find((o) => o.value === l)?.label ?? l
  ).join(", ");

  const mappingSample = c.mappingRows.slice(0, 10)
    .map((row) => JSON.stringify(row))
    .join("\n");

  // Derive unique target tables from STTM so the agent has an explicit list
  const targetTableSet = new Set(
    c.mappingRows.map((r) => r["target_table"] ?? r["Target Table"] ?? r["TargetTable"] ?? "").filter(Boolean)
  );
  const targetTableList = targetTableSet.size > 0
    ? Array.from(targetTableSet).map((t) => `- \`${t}\``).join("\n")
    : "_Derive from STTM rows in docs/feature_sttm.json_";

  const changeInstructions: Record<ChangeType, string> = {
    new: `All target tables in the STTM are **new** — create new model files for each.
- Do NOT alter any existing model files.
- Create one file per target table under the appropriate layer directory.`,
    modify: `All target tables in the STTM are **existing tables** — add new columns only.
- Locate the existing model file for each target table.
- Add only the new columns specified in the STTM — do not change existing columns.
- Update schema.yml tests for the new columns only.`,
    both: `The STTM contains a mix of new and existing tables.
- For each target table: check if a model file already exists in the repo.
- If it does NOT exist → create a new model file.
- If it DOES exist → add only the new columns; do not change existing columns.
- Never drop or rename existing columns.`,
  };

  return `# Feature Agent — ${c.projectName || "Existing Pipeline Feature"}

> **Mode: Feature of an Existing Pipeline**
> Scoped to implementing ONE feature on an existing repo.
> **Do NOT recreate, overwrite, or refactor anything outside the STTM scope.**

---

## Feature to Implement
${c.featureDescription || "_No description provided — ask the user what to build._"}

## Target Layers
${layerLabels} on **${platformLabel}**

## Change Type: ${c.changeType === "new" ? "New tables only" : c.changeType === "modify" ? "Modify existing tables" : "New + modifications"}

---

## Repository
- **URL**: \`${c.repoUrl}\`
- **Base branch**: \`${c.baseBranch || "main"}\`
- **Feature branch**: \`${c.featureBranch || "feat/new-feature"}\`

### Mandatory Pre-Work (run at the start of every session)
\`\`\`bash
# 1. Clone if not already present
ls ${repoDir} 2>/dev/null || git clone ${c.repoUrl}
cd ${repoDir}

# 2. Sync base branch
git fetch origin
git checkout ${c.baseBranch || "main"}
git pull origin ${c.baseBranch || "main"}

# 3. Create or switch to feature branch
git checkout ${c.featureBranch || "feat/new-feature"} 2>/dev/null || git checkout -b ${c.featureBranch || "feat/new-feature"}
\`\`\`

### After completing changes
\`\`\`bash
git add -A
git commit -m "feat: <describe what you added>"
git push origin ${c.featureBranch || "feat/new-feature"}
# Open a Pull Request against ${c.baseBranch || "main"}
\`\`\`

---

## STTM — Source of Truth for This Feature
File: \`docs/feature_sttm.json\` (${c.mappingRows.length} rows)

The STTM is the **only** specification for what to build. Do not infer or add anything beyond what it contains.

### Target tables derived from STTM
${targetTableList}

${c.mappingRows.length > 0 ? `### Sample STTM rows
\`\`\`json
${mappingSample}
\`\`\`` : "_No STTM uploaded — ask the user for the source-to-target mapping before writing any code._"}

---

## BUILD Workflow

${changeInstructions[c.changeType]}

### Steps
1. Read \`docs/feature_sttm.json\` in full.
2. For each unique target table in the STTM:
   - ${c.changeType === "new" ? "Create a new model file in the correct layer directory." : c.changeType === "modify" ? "Locate the existing model file and add only the new columns." : "Check if the model exists → create or modify accordingly."}
3. Add schema tests (unique + not_null on every PK) for affected models.
4. Run lint and fix all errors:
   - SQL: \`sqlfluff lint --dialect ${c.platform === "bigquery" ? "bigquery" : c.platform === "databricks" ? "sparksql" : "snowflake"}\`
   - Python: \`ruff check\`
5. Commit and push to \`${c.featureBranch || "feat/new-feature"}\`.
6. Report: list every file created or modified, and every test added.

---

## Platform Rules
See \`.claude/rules/engine-${c.platform}.md\` for ${platformLabel} coding standards.

## Cloud Access
${c.mcpAvailable
  ? "MCP servers are configured — use MCP for all cloud interactions."
  : "No MCP configured — use cloud CLI for all cloud operations. Authenticate before starting."}

## Additional Notes
${c.additionalNotes || "None."}
`;
}

function generateFeatureEngineRules(platform: string): string {
  const snippets: Record<string, string> = {
    bigquery: `# BigQuery Rules (Feature Addition)
- GoogleSQL only. Always \`SAFE_CAST\`, never bare \`CAST\`.
- Partition all new tables by a DATE or TIMESTAMP column.
- Use \`{{ ref() }}\` for all model dependencies — never hardcode dataset strings.
- Explicit column lists — no \`SELECT *\` in new models.`,
    snowflake: `# Snowflake Rules (Feature Addition)
- Use \`QUALIFY\` for window deduplication.
- Clustering keys declared in \`dbt_project.yml\` as \`+cluster_by\`.
- All new models: explicit \`{{ config(materialized='table') }}\`.
- Incremental strategy: \`delete+insert\` with \`unique_key\`.`,
    databricks: `# Databricks Rules (Feature Addition)
- All new tables use \`delta\` format.
- Three-part naming: \`catalog.schema.table\`.
- Upserts via \`DeltaTable.merge()\`.
- Production code in \`.py\` files, not notebooks.`,
    palantir: `# Palantir Foundry Rules (Feature Addition)
- Use \`@transform\` / \`@incremental\` decorators.
- Inputs/outputs declared as \`Input()\` / \`Output()\`.
- Preferred DataFrame library: Polars (\`import polars as pl\`).
- \`ruff check\` + \`mypy --strict\` must pass.`,
    dbt: `# dbt Rules (Feature Addition)
- New models: explicit \`{{ config(materialized=…) }}\`.
- Every new model has schema.yml with unique + not_null tests on PK.
- \`{{ source() }}\` for raw refs, \`{{ ref() }}\` for model deps.`,
  };
  return snippets[platform] ?? `# ${platform} Rules\nFollow standard coding conventions for ${platform}.`;
}

function generateFeatureSttm(c: FeatureConfig): string {
  return JSON.stringify(
    {
      metadata: {
        project: c.projectName || "feature-project",
        repoUrl: c.repoUrl,
        featureBranch: c.featureBranch,
        targetLayers: c.targetLayers,
        changeType: c.changeType,
        platform: c.platform,
        sourceFiles: c.mappingFileNames,
        generatedAt: new Date().toISOString(),
      },
      mappings: c.mappingRows,
    },
    null,
    2
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function parseMappingFile(file: File): Promise<MappingRow[]> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "csv") {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (r) => resolve(r.data as MappingRow[]),
      });
    });
  }
  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<MappingRow>(ws, { defval: "" });
  }
  const text = await file.text().catch(() => "(binary)");
  return [{ _raw: text.slice(0, 2000), _file: file.name }];
}

function empty(): FeatureConfig {
  return {
    projectName: "",
    repoUrl: "",
    repoProvider: "github",
    baseBranch: "main",
    featureBranch: "",
    platform: "bigquery",
    targetLayers: ["silver"],
    changeType: "new",
    featureDescription: "",
    mappingRows: [],
    mappingFileNames: [],
    agents: ["claude-code"],
    mcpAvailable: false,
    additionalNotes: "",
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FeaturePage() {
  const [step, setStep] = useState(1);
  const [c, setC] = useState<FeatureConfig>(empty);
  const [exporting, setExporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const update = <K extends keyof FeatureConfig>(key: K, val: FeatureConfig[K]) =>
    setC((p) => ({ ...p, [key]: val }));

  const handleMappingFiles = async (files: FileList | null) => {
    if (!files) return;
    setParsing(true);
    const names: string[] = [];
    const allRows: MappingRow[] = [];
    for (const f of Array.from(files)) {
      names.push(f.name);
      allRows.push(...(await parseMappingFile(f)));
    }
    setC((p) => ({
      ...p,
      mappingRows: [...p.mappingRows, ...allRows],
      mappingFileNames: [...p.mappingFileNames, ...names],
    }));
    setParsing(false);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();

      zip.file("CLAUDE.md", generateFeatureClaudeMd(c));
      zip.file(`.claude/rules/engine-${c.platform}.md`, generateFeatureEngineRules(c.platform));
      zip.file("docs/feature_sttm.json", generateFeatureSttm(c));
      zip.file(
        "README.md",
        `# ${c.projectName || "Feature"} — Existing Pipeline Feature\n\nGenerated by the Feature Agent Wizard.\n\n## Feature\n${c.featureDescription || "—"}\n\n## Repo\n${c.repoUrl}\n\n## Branch\n${c.featureBranch || "feat/new-feature"}\n`
      );
      zip.file("models/.gitkeep", "");

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${c.projectName || "feature"}-workspace.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const mappingKeys = c.mappingRows.length ? Object.keys(c.mappingRows[0]).slice(0, 6) : [];

  const stepLabels = ["Repo & Platform", "What Exists", "New Feature + STTM", "Review & Export"];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">

        <div className="flex items-center gap-3 mb-8">
          <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm">← Home</Link>
          <h1 className="text-2xl font-bold">Feature of an Existing Pipeline</h1>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-8 flex-wrap">
          {stepLabels.map((label, i) => {
            const n = i + 1;
            const state = n < step ? "done" : n === step ? "active" : "idle";
            return (
              <div key={n} className="flex items-center gap-1">
                <div className={`step-${state} flex items-center gap-1.5`}>
                  <span className="w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold border border-current">
                    {state === "done" ? "✓" : n}
                  </span>
                  <span className="text-xs hidden sm:inline">{label}</span>
                </div>
                {i < stepLabels.length - 1 && <div className="w-4 h-px bg-gray-600" />}
              </div>
            );
          })}
        </div>

        <div className="card mb-6 space-y-6">

          {/* ── Step 1: Repo & Platform ── */}
          {step === 1 && (
            <>
              <h2 className="text-xl font-semibold">Step 1 — Repository &amp; Platform</h2>

              <div>
                <label className="label">Project / Feature Name</label>
                <input className="input" placeholder="e.g. add-silver-orders-model"
                  value={c.projectName} onChange={(e) => update("projectName", e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Repo Provider</label>
                  <select className="input" value={c.repoProvider}
                    onChange={(e) => update("repoProvider", e.target.value as FeatureConfig["repoProvider"])}>
                    {REPO_PROVIDER_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Target Platform</label>
                  <select className="input" value={c.platform}
                    onChange={(e) => update("platform", e.target.value)}>
                    {PLATFORM_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Repository URL <span className="text-red-400">*</span></label>
                <input className="input" placeholder="https://github.com/org/existing-pipeline-repo"
                  value={c.repoUrl} onChange={(e) => update("repoUrl", e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Base Branch</label>
                  <input className="input" placeholder="main"
                    value={c.baseBranch} onChange={(e) => update("baseBranch", e.target.value)} />
                </div>
                <div>
                  <label className="label">Feature Branch <span className="text-gray-500 font-normal text-xs ml-1">(will be created)</span></label>
                  <input className="input" placeholder="feat/add-silver-orders"
                    value={c.featureBranch} onChange={(e) => update("featureBranch", e.target.value)} />
                </div>
              </div>

              <div>
                <label className="label">AI Coding Agent</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {AGENT_OPTIONS.map((opt) => {
                    const checked = c.agents.includes(opt.value);
                    return (
                      <label key={opt.value}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${checked ? "border-green-500 bg-green-950/30" : "border-gray-700 hover:border-gray-500"}`}>
                        <input type="checkbox" checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) update("agents", [...c.agents, opt.value]);
                            else update("agents", c.agents.filter((a) => a !== opt.value));
                          }} />
                        <span className="text-sm font-medium">{opt.label}</span>
                        <span className="text-xs text-gray-500 ml-auto">{opt.note}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="mcp" checked={c.mcpAvailable}
                  onChange={(e) => update("mcpAvailable", e.target.checked)} />
                <label htmlFor="mcp" className="text-sm cursor-pointer">
                  MCP server is configured for this platform
                </label>
              </div>
            </>
          )}

          {/* ── Step 2: Layers & Change Type ── */}
          {step === 2 && (
            <>
              <h2 className="text-xl font-semibold">Step 2 — Layers &amp; Change Type</h2>
              <p className="text-sm text-gray-400">
                Tell the agent <em>where</em> the changes go and <em>how</em> to approach them.
                Your STTM (uploaded in the next step) already tells it <em>what</em> tables and columns to build —
                so you don&apos;t need to list tables here.
              </p>

              <div className="card bg-blue-950/20 border border-blue-700/50 text-sm">
                <p className="text-blue-300 font-medium mb-1">Why not list tables here?</p>
                <p className="text-gray-300 text-xs">
                  Your STTM contains the target table and column names — the agent reads them directly from
                  <code className="bg-gray-800 px-1 mx-1 rounded">docs/feature_sttm.json</code>.
                  What it still needs to know is whether those tables are <strong className="text-white">new</strong> or
                  <strong className="text-white"> already exist</strong> in the repo, and which layer directories to work in.
                </p>
              </div>

              <div>
                <label className="label">Which layers does this feature touch?
                  <span className="text-gray-500 font-normal ml-2 text-xs">select all that apply</span>
                </label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {LAYER_OPTIONS.map((opt) => {
                    const checked = c.targetLayers.includes(opt.value);
                    return (
                      <label key={opt.value}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                          checked ? "border-green-500 bg-green-950/30" : "border-gray-700 hover:border-gray-500"
                        }`}>
                        <input type="checkbox" checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) update("targetLayers", [...c.targetLayers, opt.value]);
                            else update("targetLayers", c.targetLayers.filter((l) => l !== opt.value));
                          }} />
                        <span className="text-sm">{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
                {c.targetLayers.length === 0 && (
                  <p className="text-xs text-red-400 mt-1">Select at least one layer.</p>
                )}
              </div>

              <div>
                <label className="label">What kind of change is this?</label>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  {([
                    {
                      value: "new" as ChangeType,
                      label: "New tables only",
                      desc: "All STTM target tables are brand new — agent creates new model files.",
                    },
                    {
                      value: "modify" as ChangeType,
                      label: "Modify existing",
                      desc: "Target tables already exist — agent adds new columns only, never alters existing ones.",
                    },
                    {
                      value: "both" as ChangeType,
                      label: "Mix of both",
                      desc: "Some targets are new, some exist. Agent checks the repo and decides per table.",
                    },
                  ]).map((opt) => (
                    <button key={opt.value}
                      onClick={() => update("changeType", opt.value)}
                      className={`card text-left transition-colors ${c.changeType === opt.value ? "border-green-500" : ""}`}>
                      <div className="font-medium text-sm mb-1">{opt.label}</div>
                      <div className="text-xs text-gray-400">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Step 3: New Feature + STTM ── */}
          {step === 3 && (
            <>
              <h2 className="text-xl font-semibold">Step 3 — New Feature &amp; STTM</h2>

              <div>
                <label className="label">Describe the New Feature</label>
                <textarea
                  className="input min-h-[120px]"
                  placeholder="e.g. Add silver_orders model sourced from OMS system. Map order_id, customer_id, order_date, total_amount. Apply currency normalisation to GBP. Deduplicate on order_id."
                  value={c.featureDescription}
                  onChange={(e) => update("featureDescription", e.target.value)}
                />
              </div>

              <div>
                <label className="label">Upload STTM / Mapping Sheet
                  <span className="text-gray-500 font-normal ml-2 text-xs">CSV, Excel (.xlsx), Word, PDF</span>
                </label>
                <div
                  className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); handleMappingFiles(e.dataTransfer.files); }}>
                  <p className="text-gray-400 mb-3 text-sm">Drag &amp; drop your STTM here or</p>
                  <button className="btn-secondary text-sm" onClick={() => fileRef.current?.click()}>
                    {parsing ? "Parsing…" : "Browse Files"}
                  </button>
                  <input ref={fileRef} type="file" multiple
                    accept=".csv,.xlsx,.xls,.docx,.doc,.pdf,.md,.txt"
                    className="hidden" onChange={(e) => handleMappingFiles(e.target.files)} />
                </div>

                {c.mappingFileNames.length > 0 && (
                  <div className="mt-3">
                    <div className="flex flex-wrap gap-2 mb-2">
                      {c.mappingFileNames.map((name, i) => (
                        <span key={i} className="tag flex items-center gap-1 text-xs">
                          {name}
                          <button className="opacity-60 hover:opacity-100"
                            onClick={() => setC((p) => ({
                              ...p,
                              mappingFileNames: p.mappingFileNames.filter((_, j) => j !== i),
                            }))}>✕</button>
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400">{c.mappingRows.length} rows parsed</p>
                  </div>
                )}

                {mappingKeys.length > 0 && (
                  <div className="overflow-x-auto mt-3">
                    <table className="text-xs w-full border-collapse">
                      <thead>
                        <tr>{mappingKeys.map((k) => (
                          <th key={k} className="text-left p-2 border border-gray-700 text-gray-400">{k}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {c.mappingRows.slice(0, 5).map((row, i) => (
                          <tr key={i}>
                            {mappingKeys.map((k) => (
                              <td key={k} className="p-2 border border-gray-700 text-gray-300">{String(row[k] ?? "")}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {c.mappingRows.length > 5 && (
                      <p className="text-xs text-gray-500 mt-1">… and {c.mappingRows.length - 5} more rows</p>
                    )}
                  </div>
                )}

                {/* Paste CSV fallback */}
                <div className="mt-4">
                  <label className="label text-xs">Or paste STTM as CSV</label>
                  <textarea className="input min-h-[80px] font-mono text-xs"
                    placeholder="source_table,source_column,target_table,target_column,transformation"
                    onChange={(e) => {
                      if (!e.target.value.trim()) return;
                      Papa.parse(e.target.value, {
                        header: true, skipEmptyLines: true,
                        complete: (r) => setC((p) => ({
                          ...p,
                          mappingRows: r.data as MappingRow[],
                          mappingFileNames: [...p.mappingFileNames.filter((n) => n !== "paste"), "paste"],
                        })),
                      });
                    }} />
                </div>
              </div>

              <div>
                <label className="label">Additional Notes for the Agent</label>
                <textarea className="input min-h-[80px]"
                  placeholder="Naming conventions, business rules, SLA requirements, stakeholders…"
                  value={c.additionalNotes}
                  onChange={(e) => update("additionalNotes", e.target.value)} />
              </div>
            </>
          )}

          {/* ── Step 4: Review & Export ── */}
          {step === 4 && (
            <>
              <h2 className="text-xl font-semibold">Step 4 — Review &amp; Export</h2>

              <div className="card bg-gray-800/50 border border-gray-700">
                <h3 className="font-semibold mb-3">Feature Bundle Summary</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-gray-400">Feature name</div><div>{c.projectName || "—"}</div>
                  <div className="text-gray-400">Repository</div>
                  <div className="truncate text-xs">{c.repoUrl || "—"}</div>
                  <div className="text-gray-400">Base branch</div><div>{c.baseBranch || "main"}</div>
                  <div className="text-gray-400">Feature branch</div><div>{c.featureBranch || "feat/new-feature"}</div>
                  <div className="text-gray-400">Platform</div>
                  <div>{PLATFORM_OPTIONS.find((p) => p.value === c.platform)?.label ?? c.platform}</div>
                  <div className="text-gray-400">Target layers</div>
                  <div>{c.targetLayers.map((l) => LAYER_OPTIONS.find((o) => o.value === l)?.label ?? l).join(", ") || "—"}</div>
                  <div className="text-gray-400">Change type</div>
                  <div>{c.changeType === "new" ? "New tables only" : c.changeType === "modify" ? "Modify existing" : "Mix of both"}</div>
                  <div className="text-gray-400">STTM rows</div><div>{c.mappingRows.length}</div>
                  <div className="text-gray-400">Tables in STTM</div>
                  <div>{new Set(c.mappingRows.map((r) => r["target_table"] ?? r["Target Table"] ?? "").filter(Boolean)).size || "—"}</div>
                  <div className="text-gray-400">Agents</div>
                  <div>{c.agents.join(", ") || "claude-code"}</div>
                  <div className="text-gray-400">Cloud access</div>
                  <div>{c.mcpAvailable ? "MCP" : "CLI"}</div>
                </div>
              </div>

              <div className="card bg-green-950/20 border border-green-700/50 text-sm">
                <p className="text-green-300 font-semibold mb-2">What&apos;s in the ZIP</p>
                <ul className="text-gray-300 space-y-1 text-xs">
                  <li><code className="text-green-400">CLAUDE.md</code> — Feature-scoped instruction file (no-overwrite policy enforced)</li>
                  <li><code className="text-green-400">.claude/rules/engine-{c.platform}.md</code> — {PLATFORM_OPTIONS.find((p) => p.value === c.platform)?.label ?? c.platform} coding standards</li>
                  <li><code className="text-green-400">docs/feature_sttm.json</code> — Your STTM rows as structured JSON</li>
                  <li><code className="text-green-400">README.md</code> — Quick start guide</li>
                </ul>
              </div>

              <button className="btn-primary w-full text-lg py-3" onClick={handleExport} disabled={!c.repoUrl || exporting}>
                {exporting ? "Generating…" : "Download Feature Workspace Bundle (.zip)"}
              </button>
              {!c.repoUrl && (
                <p className="text-xs text-red-400 text-center">Repository URL is required before downloading.</p>
              )}

              <div className="border border-gray-700 rounded-lg p-4 text-xs text-gray-400 space-y-2">
                <p className="font-semibold text-gray-300">After downloading:</p>
                <pre className="bg-gray-900 rounded p-3 text-green-400 overflow-x-auto whitespace-pre-wrap">{`# 1. Unzip
unzip ${c.projectName || "feature"}-workspace.zip -d ./${c.projectName || "feature"}-workspace

# 2. Open in Claude Code (or your chosen agent)
cd ${c.projectName || "feature"}-workspace
claude

# 3. Issue the build command
BUILD ${c.featureDescription ? c.featureDescription.split(" ").slice(0, 4).join("_").toLowerCase() : "new_feature"}`}
                </pre>
              </div>
            </>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          {step > 1 ? (
            <button className="btn-secondary" onClick={() => setStep((s) => s - 1)}>← Back</button>
          ) : (
            <Link href="/" className="btn-secondary">← Home</Link>
          )}
          {step < TOTAL ? (
            <button className="btn-primary" onClick={() => setStep((s) => s + 1)}>Next →</button>
          ) : (
            <button className="btn-primary" onClick={handleExport} disabled={!c.repoUrl || exporting}>
              {exporting ? "Generating…" : "Download ZIP"}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

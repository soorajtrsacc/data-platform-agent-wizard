"use client";

import { useState, useRef, useCallback } from "react";
import Papa from "papaparse";
import { compileWorkspace } from "../../lib/compiler";
import type {
  WizardConfig,
  Environment,
  PlatformConfig,
  DataLayer,
  SourceSystem,
  McpServer,
  MappingRow,
  AttachedDoc,
  RepoConfig,
} from "../../lib/compiler";

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 8;

const PLATFORM_OPTIONS = [
  { value: "bigquery", label: "BigQuery (GoogleSQL)" },
  { value: "snowflake", label: "Snowflake (Snowpark / SQL)" },
  { value: "databricks", label: "Databricks (Delta Lake / Unity Catalog)" },
  { value: "palantir", label: "Palantir Foundry (Python Transforms / Polars)" },
  { value: "redshift", label: "Amazon Redshift" },
  { value: "synapse", label: "Azure Synapse Analytics" },
  { value: "fabric", label: "Microsoft Fabric (Lakehouse / Warehouse)" },
  { value: "dbt", label: "dbt Core / dbt Cloud" },
  { value: "pyspark", label: "PySpark (EMR / Dataproc / HDInsight)" },
  { value: "teradata", label: "Teradata (BTEQ / FastExport) — migration source" },
  { value: "oracle", label: "Oracle Database (PL/SQL) — migration source" },
  { value: "sqlserver", label: "SQL Server / SSAS (T-SQL)" },
  { value: "postgres", label: "PostgreSQL (PL/pgSQL)" },
];

const CLOUD_OPTIONS = [
  { value: "gcp", label: "Google Cloud (GCP)" },
  { value: "aws", label: "Amazon Web Services (AWS)" },
  { value: "azure", label: "Microsoft Azure" },
  { value: "onprem", label: "On-Premises" },
  { value: "any", label: "Multi-Cloud / Agnostic" },
];

const ROLE_OPTIONS = [
  { value: "primary", label: "Primary compute" },
  { value: "secondary", label: "Secondary / fallback" },
  { value: "source", label: "Migration source only" },
  { value: "archive", label: "Archive / cold storage" },
];

const SCHEDULER_OPTIONS = [
  { value: "", label: "None / manual" },
  { value: "airflow", label: "Apache Airflow" },
  { value: "prefect", label: "Prefect" },
  { value: "dagster", label: "Dagster" },
  { value: "dbt-cloud", label: "dbt Cloud CLI" },
  { value: "control-m", label: "BMC Control-M" },
  { value: "autosys", label: "CA Autosys" },
  { value: "palantir-schedules", label: "Palantir Foundry Schedules" },
];

const CICD_OPTIONS = [
  { value: "",                    label: "None / not applicable" },
  { value: "github-actions",      label: "GitHub Actions" },
  { value: "azure-pipelines",     label: "Azure DevOps Pipelines" },
  { value: "jenkins",             label: "Jenkins" },
  { value: "gitlab-ci",          label: "GitLab CI/CD" },
  { value: "bamboo",              label: "Atlassian Bamboo" },
  { value: "bitbucket-pipelines", label: "Bitbucket Pipelines" },
];

const REPO_PROVIDER_OPTIONS = [
  { value: "github",      label: "GitHub" },
  { value: "gitlab",      label: "GitLab" },
  { value: "azuredevops", label: "Azure DevOps" },
  { value: "bitbucket",   label: "Bitbucket" },
  { value: "other",       label: "Other Git" },
];

const MCP_PRESETS: Partial<McpServer>[] = [
  {
    name: "bigquery",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-bigquery", "--project", "${GCP_PROJECT_ID}"],
    description: "Read/query BigQuery tables and metadata",
  },
  {
    name: "databricks",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-databricks"],
    description: "Run Databricks SQL queries and manage clusters",
  },
  {
    name: "snowflake",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-snowflake"],
    description: "Query Snowflake and inspect schema objects",
  },
  {
    name: "aws-s3",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-aws-s3"],
    description: "Read/write S3 objects and list buckets",
  },
  {
    name: "azure-blob",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-azure-blob"],
    description: "Read/write Azure Blob Storage",
  },
  {
    name: "airflow",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-airflow", "--base-url", "${AIRFLOW_BASE_URL}"],
    description: "Trigger DAGs and monitor Airflow task status",
  },
  {
    name: "github",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-github"],
    description: "Read repos, issues, PRs and commit code",
  },
  {
    name: "palantir",
    transport: "http",
    url: "${FOUNDRY_BASE_URL}/api/mcp/v1",
    description: "Foundry dataset, ontology, and Transform access via OSDK",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 8);

function detectReposFromText(text: string): Omit<RepoConfig, "id" | "name">[] {
  const urlRe = /https?:\/\/(github\.com|gitlab\.com|dev\.azure\.com|bitbucket\.org)\/[^\s\)\]\|'"<>,;]+/g;
  const seen = new Set<string>();
  const results: Omit<RepoConfig, "id" | "name">[] = [];

  for (const rawUrl of text.match(urlRe) ?? []) {
    const url = rawUrl.replace(/[.,;:'")\]>]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);

    let provider: RepoConfig["provider"] = "other";
    if (url.includes("github.com"))      provider = "github";
    else if (url.includes("gitlab.com")) provider = "gitlab";
    else if (url.includes("dev.azure.com")) provider = "azuredevops";
    else if (url.includes("bitbucket.org")) provider = "bitbucket";

    // Look for branch name in surrounding 120 chars
    const idx = text.indexOf(rawUrl);
    const ctx = text.slice(Math.max(0, idx - 60), idx + rawUrl.length + 120);
    const branchMatch = ctx.match(/branch[`'\s:]+`?([a-zA-Z0-9_\-./]+)`?/i);

    results.push({ provider, url, branch: branchMatch?.[1] ?? "main" });
  }
  return results;
}

function emptyConfig(): WizardConfig {
  return {
    projectName: "",
    architectureNotes: "",
    environments: [
      { id: uid(), name: "dev", notes: "" },
      { id: uid(), name: "staging", notes: "" },
      { id: uid(), name: "prod", notes: "" },
    ],
    platforms: [],
    platformNotes: "",
    layers: [],
    layerNotes: "",
    sources: [],
    sourceNotes: "",
    mappingRows: [],
    mappingFileNames: [],
    mcpServers: [],
    mcpNotes: "",
    scheduler: "",
    cicd: "",
    repos: [{ id: uid(), provider: "github", url: "", branch: "main", name: "" }],
    deploymentNotes: "",
    designNotes: "",
    codeStandardsNotes: "",
    documents: [],
    sectionDocs: {},
  };
}

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
  // Word / PDF / Markdown — return as single raw-text row
  const text = await file.text().catch(() => "(binary — parsed at runtime)");
  return [{ _raw: text.slice(0, 2000), _file: file.name }];
}

async function fileToAttachedDoc(file: File): Promise<AttachedDoc> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const b64 = (e.target?.result as string).split(",")[1] ?? "";
      resolve({ name: file.name, mimeType: file.type, base64: b64 });
    };
    reader.readAsDataURL(file);
  });
}

// ─── Reusable section document uploader ───────────────────────────────────────

function SectionDocUpload({
  section, c, setC,
}: {
  section: string;
  c: WizardConfig;
  setC: (fn: (p: WizardConfig) => WizardConfig) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const docs = c.sectionDocs?.[section] ?? [];

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    setAdding(true);
    const attached = await Promise.all(Array.from(files).map(fileToAttachedDoc));
    setC((p) => ({ ...p, sectionDocs: { ...p.sectionDocs, [section]: [...(p.sectionDocs?.[section] ?? []), ...attached] } }));
    setAdding(false);
  };

  const onRemove = (idx: number) =>
    setC((p) => ({ ...p, sectionDocs: { ...p.sectionDocs, [section]: (p.sectionDocs?.[section] ?? []).filter((_, i) => i !== idx) } }));

  return (
    <div className="border border-gray-700 rounded-lg p-3 bg-gray-900/40">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400 font-medium">
          Section Reference Documents
          <span className="font-normal ml-1 text-gray-500">(PDF, Word, Excel, Markdown — bundled in ZIP)</span>
        </span>
        <button className="btn-secondary text-xs py-0.5" onClick={() => ref.current?.click()}>
          {adding ? "Uploading…" : "+ Attach"}
        </button>
        <input ref={ref} type="file" multiple accept=".pdf,.docx,.doc,.md,.txt,.xlsx,.xls" className="hidden"
          onChange={(e) => handleFiles(e.target.files)} />
      </div>
      {docs.length === 0 ? (
        <p className="text-xs text-gray-600 italic">No documents attached for this section yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {docs.map((d, i) => (
            <span key={i} className="tag text-xs flex items-center gap-1">
              {d.name}
              <button className="opacity-60 hover:opacity-100" onClick={() => onRemove(i)}>✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  const labels = [
    "Project", "Platforms", "Data Layers",
    "Sources", "Mappings", "MCP Servers", "Deploy & Export", "Launch & Run",
  ];
  return (
    <div className="flex items-center gap-1 mb-8 flex-wrap">
      {labels.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "active" : "idle";
        return (
          <div key={n} className="flex items-center gap-1">
            <div className={`step-${state} flex items-center gap-1.5`}>
              <span className="w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold border border-current">
                {state === "done" ? "✓" : n}
              </span>
              <span className="text-xs hidden sm:inline">{label}</span>
            </div>
            {i < labels.length - 1 && <div className="w-4 h-px bg-gray-600" />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────

function Step1({
  c, setC,
}: { c: WizardConfig; setC: (fn: (p: WizardConfig) => WizardConfig) => void }) {
  const docRef = useRef<HTMLInputElement>(null);

  const addEnv = () =>
    setC((p) => ({ ...p, environments: [...p.environments, { id: uid(), name: "", notes: "" }] }));
  const removeEnv = (id: string) =>
    setC((p) => ({ ...p, environments: p.environments.filter((e) => e.id !== id) }));
  const updateEnv = (id: string, field: keyof Environment, val: string) =>
    setC((p) => ({ ...p, environments: p.environments.map((e) => e.id === id ? { ...e, [field]: val } : e) }));

  const handleDocs = async (files: FileList | null) => {
    if (!files) return;
    const docs = await Promise.all(Array.from(files).map(fileToAttachedDoc));
    setC((p) => ({ ...p, documents: [...p.documents, ...docs] }));

    // Auto-detect git repo URLs from text-readable files (md, txt, csv)
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!["md", "txt", "csv"].includes(ext)) continue;
      const text = await file.text().catch(() => "");
      if (!text) continue;
      const detected = detectReposFromText(text);
      if (detected.length === 0) continue;
      setC((p) => {
        const existingUrls = new Set((p.repos ?? []).map((r) => r.url).filter(Boolean));
        const fresh = detected
          .filter((r) => !existingUrls.has(r.url))
          .map((r) => ({ ...r, id: uid(), name: "" }));
        if (fresh.length === 0) return p;
        const currentRepos = p.repos ?? [];
        // Replace the initial empty placeholder if it hasn't been touched
        const hasOnlyBlank = currentRepos.length === 1 && !currentRepos[0].url;
        return { ...p, repos: hasOnlyBlank ? fresh : [...currentRepos, ...fresh] };
      });
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Step 1 — Project Setup</h2>

      <div>
        <label className="label">Project Name</label>
        <input className="input" placeholder="e.g. credit-card-platform" value={c.projectName}
          onChange={(e) => setC((p) => ({ ...p, projectName: e.target.value }))} />
      </div>

      <div>
        <label className="label">Architecture Notes
          <span className="text-gray-500 font-normal ml-2">— describe the overall architecture, patterns, constraints</span>
        </label>
        <textarea className="input min-h-[120px]" placeholder="e.g. Medallion architecture on Palantir Foundry + BigQuery. Raw data ingested from Kafka topics…"
          value={c.architectureNotes}
          onChange={(e) => setC((p) => ({ ...p, architectureNotes: e.target.value }))} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Environments</label>
          <button className="btn-secondary text-xs" onClick={addEnv}>+ Add environment</button>
        </div>
        <div className="space-y-2">
          {c.environments.map((env) => (
            <div key={env.id} className="flex gap-2 items-start">
              <input className="input w-32 flex-shrink-0" placeholder="name" value={env.name}
                onChange={(e) => updateEnv(env.id, "name", e.target.value)} />
              <input className="input flex-1" placeholder="notes (optional)" value={env.notes}
                onChange={(e) => updateEnv(env.id, "notes", e.target.value)} />
              <button className="btn-secondary text-xs px-2 mt-1" onClick={() => removeEnv(env.id)}>✕</button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Attach Project Documents
            <span className="text-gray-500 font-normal ml-2">— PDF, Word (.docx), Markdown, Excel (.xlsx)</span>
          </label>
          <button className="btn-secondary text-xs" onClick={() => docRef.current?.click()}>+ Attach files</button>
          <input ref={docRef} type="file" multiple accept=".pdf,.docx,.doc,.md,.txt,.xlsx,.xls" className="hidden"
            onChange={(e) => handleDocs(e.target.files)} />
        </div>
        {c.documents.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {c.documents.map((d, i) => (
              <span key={i} className="tag flex items-center gap-1">
                {d.name}
                <button className="ml-1 opacity-60 hover:opacity-100" onClick={() =>
                  setC((p) => ({ ...p, documents: p.documents.filter((_, j) => j !== i) }))}>✕</button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


function Step2({
  c, setC,
}: { c: WizardConfig; setC: (fn: (p: WizardConfig) => WizardConfig) => void }) {
  const addPlatform = () =>
    setC((p) => ({
      ...p, platforms: [...p.platforms, { id: uid(), platform: "bigquery", cloud: "gcp", region: "", role: "primary", notes: "" }],
    }));
  const removePlatform = (id: string) =>
    setC((p) => ({ ...p, platforms: p.platforms.filter((x) => x.id !== id) }));
  const updatePlatform = (id: string, field: keyof PlatformConfig, val: string) =>
    setC((p) => ({ ...p, platforms: p.platforms.map((x) => x.id === id ? { ...x, [field]: val } : x) }));

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Step 2 — Platforms & Cloud Targets</h2>
      <p className="text-sm text-gray-400">Add every platform Claude Code will generate code for. You can have multiple platforms across different clouds.</p>

      <div className="space-y-4">
        {c.platforms.length === 0 && (
          <div className="text-gray-500 text-sm italic">No platforms added yet.</div>
        )}
        {c.platforms.map((p) => (
          <div key={p.id} className="card space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-medium text-sm">
                {PLATFORM_OPTIONS.find((o) => o.value === p.platform)?.label ?? p.platform}
              </span>
              <button className="btn-secondary text-xs" onClick={() => removePlatform(p.id)}>Remove</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">Platform / Engine</label>
                <select className="input" value={p.platform} onChange={(e) => updatePlatform(p.id, "platform", e.target.value)}>
                  {PLATFORM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">Cloud Provider</label>
                <select className="input" value={p.cloud} onChange={(e) => updatePlatform(p.id, "cloud", e.target.value)}>
                  {CLOUD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">Region</label>
                <input className="input" placeholder="e.g. europe-west2, us-east-1" value={p.region}
                  onChange={(e) => updatePlatform(p.id, "region", e.target.value)} />
              </div>
              <div>
                <label className="label text-xs">Role</label>
                <select className="input" value={p.role} onChange={(e) => updatePlatform(p.id, "role", e.target.value)}>
                  {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label text-xs">Platform Notes</label>
              <input className="input" placeholder="Any platform-specific notes for Claude Code…" value={p.notes}
                onChange={(e) => updatePlatform(p.id, "notes", e.target.value)} />
            </div>
          </div>
        ))}
      </div>

      <button className="btn-secondary" onClick={addPlatform}>+ Add Platform</button>

      <div>
        <label className="label">Platform Architecture Notes</label>
        <textarea className="input min-h-[80px]" placeholder="How do these platforms relate to each other? What is the data flow across them?"
          value={c.platformNotes} onChange={(e) => setC((p) => ({ ...p, platformNotes: e.target.value }))} />
      </div>

      <SectionDocUpload section="platforms" c={c} setC={setC} />
    </div>
  );
}

function Step3({
  c, setC,
}: { c: WizardConfig; setC: (fn: (p: WizardConfig) => WizardConfig) => void }) {
  const addLayer = () =>
    setC((p) => ({
      ...p, layers: [...p.layers, {
        id: uid(), name: "", description: "",
        platformId: p.platforms[0]?.id ?? "",
        pathTemplate: "",
      }],
    }));
  const removeLayer = (id: string) =>
    setC((p) => ({ ...p, layers: p.layers.filter((l) => l.id !== id) }));
  const updateLayer = (id: string, field: keyof DataLayer, val: string) =>
    setC((p) => ({ ...p, layers: p.layers.map((l) => l.id === id ? { ...l, [field]: val } : l) }));

  const PRESETS = ["Landing", "Bronze", "Silver", "Gold", "Platinum", "Staging", "Mart", "Raw", "Curated", "Analytics"];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Step 3 — Data Layer Architecture</h2>
      <p className="text-sm text-gray-400">
        Define your data layers in order. Names are completely flexible — not limited to Bronze/Silver/Gold.
        Use <code className="text-xs bg-gray-800 px-1 rounded">{"{env}"}</code> in path templates to insert the active environment.
      </p>

      <div className="flex flex-wrap gap-1 mb-2">
        <span className="text-xs text-gray-500 mr-1">Quick add:</span>
        {PRESETS.map((name) => (
          <button key={name} className="tag cursor-pointer hover:opacity-80 text-xs" onClick={() =>
            setC((p) => ({
              ...p, layers: [...p.layers, {
                id: uid(), name, description: "",
                platformId: p.platforms[0]?.id ?? "",
                pathTemplate: `{project}.${name.toLowerCase()}_{env}`,
              }],
            }))}>
            {name}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {c.layers.length === 0 && (
          <div className="text-gray-500 text-sm italic">No layers added yet. Click quick-add or + Add Layer.</div>
        )}
        {c.layers.map((layer, idx) => (
          <div key={layer.id} className="card space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-medium text-sm text-gray-400">Layer {idx + 1}</span>
              <button className="btn-secondary text-xs" onClick={() => removeLayer(layer.id)}>Remove</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">Layer Name</label>
                <input className="input" placeholder="e.g. Bronze, Landing, Mart…" value={layer.name}
                  onChange={(e) => updateLayer(layer.id, "name", e.target.value)} />
              </div>
              <div>
                <label className="label text-xs">Platform</label>
                <select className="input" value={layer.platformId}
                  onChange={(e) => updateLayer(layer.id, "platformId", e.target.value)}>
                  <option value="">— select —</option>
                  {c.platforms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {PLATFORM_OPTIONS.find((o) => o.value === p.platform)?.label ?? p.platform}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label text-xs">Path Template
                  <span className="text-gray-500 ml-1 font-normal">— use {"{env}"} for environment substitution</span>
                </label>
                <input className="input" placeholder="e.g. my_project.silver_{env} or s3://bucket/{env}/silver/"
                  value={layer.pathTemplate} onChange={(e) => updateLayer(layer.id, "pathTemplate", e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="label text-xs">Description</label>
                <input className="input" placeholder="What data lives in this layer? What transforms are applied?"
                  value={layer.description} onChange={(e) => updateLayer(layer.id, "description", e.target.value)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="btn-secondary" onClick={addLayer}>+ Add Layer</button>

      <div>
        <label className="label">Layer Architecture Notes</label>
        <textarea className="input min-h-[80px]"
          placeholder="Data flow, retention policies, quality expectations across layers…"
          value={c.layerNotes} onChange={(e) => setC((p) => ({ ...p, layerNotes: e.target.value }))} />
      </div>

      <SectionDocUpload section="layers" c={c} setC={setC} />
    </div>
  );
}

function Step4({
  c, setC,
}: { c: WizardConfig; setC: (fn: (p: WizardConfig) => WizardConfig) => void }) {
  const addSource = () =>
    setC((p) => ({
      ...p, sources: [...p.sources, { id: uid(), name: "", platform: "", isLegacy: false, legacyType: "none", connectionNotes: "" }],
    }));
  const removeSource = (id: string) =>
    setC((p) => ({ ...p, sources: p.sources.filter((s) => s.id !== id) }));
  const updateSource = (id: string, field: keyof SourceSystem, val: string | boolean) =>
    setC((p) => ({ ...p, sources: p.sources.map((s) => s.id === id ? { ...s, [field]: val } : s) }));

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Step 4 — Source Systems</h2>
      <p className="text-sm text-gray-400">Define where data originates. Mark legacy sources to unlock migration translation rules.</p>

      <div className="space-y-4">
        {c.sources.length === 0 && (
          <div className="text-gray-500 text-sm italic">No sources added yet.</div>
        )}
        {c.sources.map((src) => (
          <div key={src.id} className="card space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-medium text-sm">{src.name || "New Source"}</span>
              <button className="btn-secondary text-xs" onClick={() => removeSource(src.id)}>Remove</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">Source Name</label>
                <input className="input" placeholder="e.g. Teradata DWH, CRM Oracle DB" value={src.name}
                  onChange={(e) => updateSource(src.id, "name", e.target.value)} />
              </div>
              <div>
                <label className="label text-xs">Platform / Technology</label>
                <input className="input" placeholder="e.g. Teradata, Oracle, Kafka, REST API" value={src.platform}
                  onChange={(e) => updateSource(src.id, "platform", e.target.value)} />
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <input type="checkbox" id={`legacy-${src.id}`} checked={src.isLegacy}
                  onChange={(e) => updateSource(src.id, "isLegacy", e.target.checked)} />
                <label htmlFor={`legacy-${src.id}`} className="text-sm cursor-pointer">
                  Legacy migration source (unlocks translation rules)
                </label>
              </div>
              {src.isLegacy && (
                <div>
                  <label className="label text-xs">Legacy Script Type</label>
                  <select className="input" value={src.legacyType}
                    onChange={(e) => updateSource(src.id, "legacyType", e.target.value)}>
                    <option value="none">Not specified</option>
                    <option value="bteq">Teradata BTEQ / FastExport / MLoad</option>
                    <option value="plsql">Oracle PL/SQL</option>
                    <option value="tsql">T-SQL (SQL Server / Synapse)</option>
                    <option value="shell">Unix Shell (Cron / Autosys)</option>
                    <option value="ssis">SSIS Packages</option>
                    <option value="informatica">Informatica Mappings</option>
                  </select>
                </div>
              )}
              <div className={src.isLegacy ? "" : "col-span-2"}>
                <label className="label text-xs">Connection / Integration Notes</label>
                <input className="input" placeholder="Schema, credentials method, ingestion frequency…" value={src.connectionNotes}
                  onChange={(e) => updateSource(src.id, "connectionNotes", e.target.value)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="btn-secondary" onClick={addSource}>+ Add Source System</button>

      <div>
        <label className="label">Source Integration Notes</label>
        <textarea className="input min-h-[80px]"
          placeholder="Network access, VPN requirements, auth patterns, ingestion cadence…"
          value={c.sourceNotes} onChange={(e) => setC((p) => ({ ...p, sourceNotes: e.target.value }))} />
      </div>

      <SectionDocUpload section="sources" c={c} setC={setC} />
    </div>
  );
}

function Step5({
  c, setC,
}: { c: WizardConfig; setC: (fn: (p: WizardConfig) => WizardConfig) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    setParsing(true);
    const names: string[] = [];
    const allRows: MappingRow[] = [];
    for (const f of Array.from(files)) {
      names.push(f.name);
      const rows = await parseMappingFile(f);
      allRows.push(...rows);
    }
    setC((p) => ({ ...p, mappingRows: [...p.mappingRows, ...allRows], mappingFileNames: [...p.mappingFileNames, ...names] }));
    setParsing(false);
  };

  const keys = c.mappingRows.length ? Object.keys(c.mappingRows[0]).slice(0, 8) : [];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Step 5 — Mapping Sheets</h2>
      <p className="text-sm text-gray-400">
        Upload source-to-target mapping documents. Supported: CSV, Excel (.xlsx/.xls), Word (.docx), PDF, Markdown.
      </p>

      <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}>
        <p className="text-gray-400 mb-3">Drag &amp; drop files here or</p>
        <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
          {parsing ? "Parsing…" : "Browse Files"}
        </button>
        <input ref={fileRef} type="file" multiple accept=".csv,.xlsx,.xls,.docx,.doc,.pdf,.md,.txt"
          className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {c.mappingFileNames.length > 0 && (
        <div>
          <div className="flex flex-wrap gap-2 mb-3">
            {c.mappingFileNames.map((name, i) => (
              <span key={i} className="tag flex items-center gap-1">
                {name}
                <button className="ml-1 opacity-60 hover:opacity-100" onClick={() =>
                  setC((p) => ({ ...p, mappingFileNames: p.mappingFileNames.filter((_, j) => j !== i) }))}>✕</button>
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-400">{c.mappingRows.length} rows parsed</p>
        </div>
      )}

      {keys.length > 0 && (
        <div className="overflow-x-auto">
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr>{keys.map((k) => <th key={k} className="text-left p-2 border border-gray-700 text-gray-400">{k}</th>)}</tr>
            </thead>
            <tbody>
              {c.mappingRows.slice(0, 5).map((row, i) => (
                <tr key={i}>
                  {keys.map((k) => <td key={k} className="p-2 border border-gray-700 text-gray-300">{String(row[k] ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {c.mappingRows.length > 5 && (
            <p className="text-xs text-gray-500 mt-1">… and {c.mappingRows.length - 5} more rows</p>
          )}
        </div>
      )}

      <div>
        <label className="label">Paste Mapping (CSV format)</label>
        <textarea className="input min-h-[120px] font-mono text-xs"
          placeholder="source_table,source_column,target_table,target_column,transformation"
          onChange={(e) => {
            if (!e.target.value.trim()) return;
            Papa.parse(e.target.value, {
              header: true, skipEmptyLines: true,
              complete: (r) => setC((p) => ({ ...p, mappingRows: r.data as MappingRow[], mappingFileNames: [...p.mappingFileNames.filter((n) => n !== "paste"), "paste"] })),
            });
          }} />
      </div>

      <SectionDocUpload section="mappings" c={c} setC={setC} />
    </div>
  );
}

function McpConnectivityTest({ srv }: { srv: McpServer }) {
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "fail" | "info">("idle");
  const [detail, setDetail] = useState("");

  const test = async () => {
    setStatus("testing");
    setDetail("");
    if (srv.transport === "stdio") {
      setStatus("info");
      setDetail(`stdio servers run locally — verify by running:\n${srv.command ?? "?"} ${(srv.args ?? []).join(" ")}`);
      return;
    }
    const url = srv.url ?? "";
    if (!url || url.includes("${")) {
      setStatus("info");
      setDetail("URL contains a variable placeholder — resolve it first, then test.");
      return;
    }
    try {
      const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) });
      if (res.ok || res.status === 405 || res.status === 404) {
        setStatus("ok");
        setDetail(`HTTP ${res.status} — server reachable`);
      } else {
        setStatus("fail");
        setDetail(`HTTP ${res.status} — check URL and auth`);
      }
    } catch (e) {
      setStatus("fail");
      setDetail(`Connection failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        className={`text-xs px-3 py-1 rounded border font-medium transition-colors ${
          status === "ok" ? "border-green-600 text-green-400 bg-green-950/20" :
          status === "fail" ? "border-red-600 text-red-400 bg-red-950/20" :
          status === "info" ? "border-yellow-600 text-yellow-400 bg-yellow-950/20" :
          status === "testing" ? "border-gray-600 text-gray-400 animate-pulse" :
          "border-gray-600 text-gray-400 hover:border-blue-500 hover:text-blue-400"
        }`}
        onClick={test}
        disabled={status === "testing"}
      >
        {status === "idle" && "Test connectivity"}
        {status === "testing" && "Testing…"}
        {status === "ok" && "✓ Connected"}
        {status === "fail" && "✗ Failed"}
        {status === "info" && "ℹ stdio"}
      </button>
      {detail && <pre className="text-xs text-gray-400 whitespace-pre-wrap">{detail}</pre>}
    </div>
  );
}

function Step6({
  c, setC,
}: { c: WizardConfig; setC: (fn: (p: WizardConfig) => WizardConfig) => void }) {
  const addServer = (preset?: Partial<McpServer>) =>
    setC((p) => ({
      ...p, mcpServers: [...p.mcpServers, {
        id: uid(),
        name: preset?.name ?? "",
        transport: preset?.transport ?? "stdio",
        command: preset?.command ?? "",
        args: preset?.args ?? [],
        url: preset?.url ?? "",
        envVars: [],
        description: preset?.description ?? "",
      }],
    }));
  const removeServer = (id: string) =>
    setC((p) => ({ ...p, mcpServers: p.mcpServers.filter((s) => s.id !== id) }));
  const updateServer = (id: string, field: keyof McpServer, val: unknown) =>
    setC((p) => ({ ...p, mcpServers: p.mcpServers.map((s) => s.id === id ? { ...s, [field]: val } : s) }));
  const addEnvVar = (id: string) =>
    setC((p) => ({
      ...p, mcpServers: p.mcpServers.map((s) =>
        s.id === id ? { ...s, envVars: [...s.envVars, { key: "", value: "" }] } : s),
    }));
  const updateEnvVar = (id: string, idx: number, field: "key" | "value", val: string) =>
    setC((p) => ({
      ...p, mcpServers: p.mcpServers.map((s) =>
        s.id === id ? { ...s, envVars: s.envVars.map((ev, i) => i === idx ? { ...ev, [field]: val } : ev) } : s),
    }));
  const removeEnvVar = (id: string, idx: number) =>
    setC((p) => ({
      ...p, mcpServers: p.mcpServers.map((s) =>
        s.id === id ? { ...s, envVars: s.envVars.filter((_, i) => i !== idx) } : s),
    }));

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Step 6 — MCP Server Connections</h2>
      <p className="text-sm text-gray-400">
        Configure MCP (Model Context Protocol) servers so Claude Code can securely connect to your cloud environments,
        databases, and orchestration tools at runtime.
      </p>

      <div>
        <label className="label mb-2">Quick-add presets</label>
        <div className="flex flex-wrap gap-2">
          {MCP_PRESETS.map((preset) => (
            <button key={preset.name} className="tag cursor-pointer hover:opacity-80 text-xs"
              onClick={() => addServer(preset)}>
              + {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {c.mcpServers.length === 0 && (
          <div className="text-gray-500 text-sm italic">No MCP servers configured yet.</div>
        )}
        {c.mcpServers.map((srv) => (
          <div key={srv.id} className="card space-y-3">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <span className="font-medium text-sm">{srv.name || "New MCP Server"}</span>
              <div className="flex items-center gap-2">
                <McpConnectivityTest srv={srv} />
                <button className="btn-secondary text-xs" onClick={() => removeServer(srv.id)}>Remove</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">Server Name (key)</label>
                <input className="input" placeholder="e.g. bigquery, airflow" value={srv.name}
                  onChange={(e) => updateServer(srv.id, "name", e.target.value)} />
              </div>
              <div>
                <label className="label text-xs">Transport</label>
                <select className="input" value={srv.transport}
                  onChange={(e) => updateServer(srv.id, "transport", e.target.value)}>
                  <option value="stdio">stdio (local process)</option>
                  <option value="sse">SSE (server-sent events)</option>
                  <option value="http">HTTP (remote)</option>
                </select>
              </div>
              {srv.transport === "stdio" ? (
                <>
                  <div>
                    <label className="label text-xs">Command</label>
                    <input className="input" placeholder="e.g. uvx or python" value={srv.command ?? ""}
                      onChange={(e) => updateServer(srv.id, "command", e.target.value)} />
                  </div>
                  <div>
                    <label className="label text-xs">Args (space-separated)</label>
                    <input className="input" placeholder="e.g. mcp-server-bigquery --project my-proj"
                      value={(srv.args ?? []).join(" ")}
                      onChange={(e) => updateServer(srv.id, "args", e.target.value.split(" ").filter(Boolean))} />
                  </div>
                </>
              ) : (
                <div className="col-span-2">
                  <label className="label text-xs">URL</label>
                  <input className="input" placeholder="https://foundry.example.com/api/mcp/v1" value={srv.url ?? ""}
                    onChange={(e) => updateServer(srv.id, "url", e.target.value)} />
                </div>
              )}
              <div className="col-span-2">
                <label className="label text-xs">Description</label>
                <input className="input" placeholder="What does this MCP server provide access to?" value={srv.description}
                  onChange={(e) => updateServer(srv.id, "description", e.target.value)} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label text-xs mb-0">Environment Variables</label>
                <button className="btn-secondary text-xs" onClick={() => addEnvVar(srv.id)}>+ Add var</button>
              </div>
              {srv.envVars.map((ev, idx) => (
                <div key={idx} className="flex gap-2 items-center mb-1">
                  <input className="input w-40 text-xs" placeholder="KEY" value={ev.key}
                    onChange={(e) => updateEnvVar(srv.id, idx, "key", e.target.value)} />
                  <span className="text-gray-500">=</span>
                  <input className="input flex-1 text-xs" placeholder="${MY_SECRET}" value={ev.value}
                    onChange={(e) => updateEnvVar(srv.id, idx, "value", e.target.value)} />
                  <button className="text-xs opacity-60 hover:opacity-100" onClick={() => removeEnvVar(srv.id, idx)}>✕</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button className="btn-secondary" onClick={() => addServer()}>+ Add Custom MCP Server</button>

      <div className="card bg-amber-950/20 border border-amber-800/40">
        <h3 className="font-semibold text-sm text-amber-400 mb-2">No MCP available? Use Cloud CLI fallback</h3>
        <p className="text-xs text-gray-400 mb-2">
          If MCP servers cannot be configured (no network access, corporate firewall, etc.), Claude Code will
          fall back to cloud CLIs for agentic actions. Ensure the relevant CLI is installed and authenticated:
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-300">
          <div><code className="text-green-400">gcloud auth application-default login</code> — GCP / BigQuery / Vertex</div>
          <div><code className="text-green-400">aws configure sso</code> — AWS / Redshift / EMR</div>
          <div><code className="text-green-400">az login</code> — Azure / Synapse / Fabric</div>
          <div><code className="text-green-400">databricks configure --token</code> — Databricks Unity Catalog</div>
          <div><code className="text-green-400">foundry login</code> — Palantir Foundry (palantir-foundry CLI)</div>
          <div><code className="text-green-400">dbt debug</code> — dbt Cloud / Core connection</div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          When MCP is configured, Claude Code uses MCP for direct API calls. When not configured, it generates
          CLI commands and runs them via Bash. Both modes are auto-detected from your CLAUDE.md.
        </p>
      </div>

      <div>
        <label className="label">MCP Configuration Notes</label>
        <textarea className="input min-h-[80px]"
          placeholder="Auth requirements, network access, VPN dependencies for MCP connections…"
          value={c.mcpNotes} onChange={(e) => setC((p) => ({ ...p, mcpNotes: e.target.value }))} />
      </div>

      <SectionDocUpload section="mcp" c={c} setC={setC} />
    </div>
  );
}

function Step7({
  c, setC, onExport, repoError, setRepoError,
}: {
  c: WizardConfig;
  setC: (fn: (p: WizardConfig) => WizardConfig) => void;
  onExport: () => void;
  repoError: string;
  setRepoError: (e: string) => void;
}) {
  const addRepo = () =>
    setC((p) => ({ ...p, repos: [...(p.repos ?? []), { id: uid(), provider: "github", url: "", branch: "main", name: "" }] }));
  const updateRepo = (id: string, field: keyof RepoConfig, val: string) => {
    if (field === "url" && val.trim()) setRepoError("");
    setC((p) => ({ ...p, repos: (p.repos ?? []).map((r) => r.id === id ? { ...r, [field]: val } : r) }));
  };
  const removeRepo = (id: string) =>
    setC((p) => ({ ...p, repos: (p.repos ?? []).filter((r) => r.id !== id) }));

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Step 7 — Deployment &amp; Export</h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Orchestration Scheduler</label>
          <select className="input" value={c.scheduler}
            onChange={(e) => setC((p) => ({ ...p, scheduler: e.target.value }))}>
            {SCHEDULER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">CI/CD Pipeline
            <span className="text-gray-500 font-normal ml-2">— generates pipeline config file in ZIP</span>
          </label>
          <select className="input" value={c.cicd}
            onChange={(e) => setC((p) => ({ ...p, cicd: e.target.value }))}>
            {CICD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Code Repositories
            <span className="text-red-400 ml-1">*</span>
            <span className="text-gray-500 font-normal ml-2">— GitHub, GitLab, Azure DevOps, Bitbucket</span>
          </label>
          <button className="btn-secondary text-xs" onClick={addRepo}>+ Add repo</button>
        </div>
        {repoError && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-950 border border-red-700 text-red-300 text-sm">
            {repoError}
          </div>
        )}
        <div className="space-y-3">
          {(c.repos ?? []).map((repo) => (
            <div key={repo.id} className={`card space-y-2 ${repoError && !repo.url.trim() ? "border-red-600" : ""}`}>
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-gray-400">
                  {REPO_PROVIDER_OPTIONS.find((o) => o.value === repo.provider)?.label ?? repo.provider}
                  {repo.name ? ` — ${repo.name}` : ""}
                </span>
                {(c.repos ?? []).length > 1 && (
                  <button className="btn-secondary text-xs" onClick={() => removeRepo(repo.id)}>Remove</button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label text-xs">Provider</label>
                  <select className="input" value={repo.provider}
                    onChange={(e) => updateRepo(repo.id, "provider", e.target.value)}>
                    {REPO_PROVIDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label text-xs">Default Branch</label>
                  <input className="input" placeholder="main" value={repo.branch}
                    onChange={(e) => updateRepo(repo.id, "branch", e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label text-xs">
                  Repository URL <span className="text-red-400">*</span>
                </label>
                <input
                  className={`input ${repoError && !repo.url.trim() ? "border-red-600 focus:border-red-500" : ""}`}
                  placeholder="https://github.com/org/repo  or  https://dev.azure.com/org/project/_git/repo"
                  value={repo.url}
                  onChange={(e) => updateRepo(repo.id, "url", e.target.value)}
                />
              </div>
              <div>
                <label className="label text-xs">Alias / Name <span className="text-gray-500 font-normal">(optional)</span></label>
                <input className="input" placeholder="e.g. dbt_gcp, ingestion-pipeline" value={repo.name}
                  onChange={(e) => updateRepo(repo.id, "name", e.target.value)} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Deployment Process Notes</label>
        <textarea className="input min-h-[100px]"
          placeholder="CI/CD pipeline, deployment steps, environment promotion process, rollback strategy…"
          value={c.deploymentNotes} onChange={(e) => setC((p) => ({ ...p, deploymentNotes: e.target.value }))} />
      </div>

      <div>
        <label className="label">Design Decisions &amp; Constraints</label>
        <textarea className="input min-h-[100px]"
          placeholder="Key design decisions, trade-offs, constraints the agent should know about…"
          value={c.designNotes} onChange={(e) => setC((p) => ({ ...p, designNotes: e.target.value }))} />
      </div>

      <div>
        <label className="label">Coding Standards &amp; Conventions</label>
        <textarea className="input min-h-[100px]"
          placeholder="Naming conventions, review process, branch strategy, commit message format…"
          value={c.codeStandardsNotes} onChange={(e) => setC((p) => ({ ...p, codeStandardsNotes: e.target.value }))} />
      </div>

      <SectionDocUpload section="deployment" c={c} setC={setC} />

      <div className="card bg-gray-800/50 border border-gray-700">
        <h3 className="font-semibold mb-3">Bundle Summary</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-gray-400">Project</div><div>{c.projectName || "—"}</div>
          <div className="text-gray-400">Environments</div><div>{c.environments.map((e) => e.name).join(", ") || "—"}</div>
          <div className="text-gray-400">Platforms</div><div>{c.platforms.length} platform(s)</div>
          <div className="text-gray-400">Data Layers</div><div>{c.layers.length} layer(s)</div>
          <div className="text-gray-400">Sources</div><div>{c.sources.length} source(s) ({c.sources.filter((s) => s.isLegacy).length} legacy)</div>
          <div className="text-gray-400">Mapping Rows</div><div>{c.mappingRows.length} rows</div>
          <div className="text-gray-400">MCP Servers</div><div>{c.mcpServers.length} server(s)</div>
          <div className="text-gray-400">Repositories</div><div>{(c.repos ?? []).filter((r) => r.url).length} repo(s)</div>
          <div className="text-gray-400">Scheduler</div><div>{c.scheduler || "None"}</div>
          <div className="text-gray-400">CI/CD</div><div>{CICD_OPTIONS.find((o) => o.value === c.cicd)?.label ?? "None"}</div>
          <div className="text-gray-400">Attached Docs</div>
          <div>
            {c.documents.length} global + {Object.values(c.sectionDocs ?? {}).reduce((a, d) => a + d.length, 0)} section-specific
          </div>
        </div>
      </div>

      <button className="btn-primary w-full text-lg py-3" onClick={onExport}>
        Download Claude Code Workspace Bundle (.zip)
      </button>
    </div>
  );
}

// ─── Step 8 — Launch & Run ────────────────────────────────────────────────────

const CICD_FILE_MAP: Record<string, string> = {
  "github-actions":      ".github/workflows/ci.yml",
  "azure-pipelines":     "azure-pipelines.yml",
  "jenkins":             "Jenkinsfile",
  "gitlab-ci":          ".gitlab-ci.yml",
  "bamboo":              "bamboo-specs/bamboo.yml",
  "bitbucket-pipelines": "bitbucket-pipelines.yml",
};

function Step8({ c }: { c: WizardConfig }) {
  const zipName = `${c.projectName || "pipeline-agent"}-workspace.zip`;
  const primaryPlatform = c.platforms[0]?.platform ?? "bigquery";
  const hasMcp = c.mcpServers.length > 0;
  const hasLegacy = c.sources.some((s) => s.isLegacy);

  const cliSetup: { label: string; cmd: string }[] = [];
  for (const p of c.platforms) {
    if (p.cloud === "gcp" || p.platform === "bigquery" || p.platform === "dbt")
      cliSetup.push({ label: "Authenticate GCP", cmd: "gcloud auth application-default login" });
    if (p.cloud === "aws" || p.platform === "redshift")
      cliSetup.push({ label: "Configure AWS", cmd: "aws configure sso" });
    if (p.cloud === "azure" || p.platform === "synapse" || p.platform === "fabric")
      cliSetup.push({ label: "Login Azure", cmd: "az login" });
    if (p.platform === "databricks")
      cliSetup.push({ label: "Configure Databricks", cmd: "databricks configure --token" });
    if (p.platform === "palantir")
      cliSetup.push({ label: "Login Foundry", cmd: "foundry login" });
  }
  const uniqueCli = cliSetup.filter((v, i, a) => a.findIndex((x) => x.cmd === v.cmd) === i);

  const steps: { title: string; desc: string; code?: string }[] = [
    {
      title: "1. Extract the ZIP",
      desc: `Unzip ${zipName} into a new folder — this becomes your Claude Code workspace root.`,
      code: `# macOS / Linux\nunzip ${zipName} -d ./${c.projectName || "pipeline-agent"}-workspace\n\n# Windows (PowerShell)\nExpand-Archive -Path ${zipName} -DestinationPath .\\${c.projectName || "pipeline-agent"}-workspace`,
    },
    {
      title: "2. Open Claude Code in the workspace",
      desc: "Navigate into the extracted folder and launch Claude Code. CLAUDE.md and all rule files are automatically loaded.",
      code: `cd ${c.projectName || "pipeline-agent"}-workspace\nclaude`,
    },
    ...(uniqueCli.length > 0
      ? [
          {
            title: "3. Authenticate your cloud CLI",
            desc: hasMcp
              ? "Claude Code will connect to your cloud via MCP servers. Authenticate the CLI as a fallback for when MCP is unavailable."
              : "No MCP servers were configured, so Claude Code will use CLI commands for cloud actions. Authenticate first:",
            code: uniqueCli.map((c) => `# ${c.label}\n${c.cmd}`).join("\n\n"),
          },
        ]
      : []),
    ...(hasMcp
      ? [
          {
            title: `${uniqueCli.length > 0 ? "4" : "3"}. Verify MCP server connections`,
            desc: "Claude Code auto-loads .claude/mcp_config.json on startup. Confirm your MCP servers are reachable:",
            code: `# Inside Claude Code, run:\n/mcp\n\n# You should see your configured servers listed as connected.\n# If a server shows as disconnected, check the CLI fallback section in CLAUDE.md.`,
          },
        ]
      : []),
    {
      title: `${uniqueCli.length > 0 ? (hasMcp ? "5" : "4") : hasMcp ? "4" : "3"}. Issue your first agent command`,
      desc: "Claude Code reads CLAUDE.md and understands your full stack. Start with a high-level workflow command:",
      code: [
        hasLegacy ? `# Migrate a legacy script\nMIGRATE legacy/scripts/daily_load.bteq TO ${primaryPlatform}` : null,
        `# Build or scaffold a model\nBUILD ${c.layers[c.layers.length - 1]?.name?.toLowerCase().replace(/\s+/g, "_") ?? "gold"}_mart`,
        `# Validate a model\nVALIDATE ${c.layers[0]?.name?.toLowerCase().replace(/\s+/g, "_") ?? "bronze"}_ingestion`,
        `# Query context graph for focused context\nCONTEXT ${primaryPlatform} layer path`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    {
      title: "What's inside your ZIP",
      desc: "Every file Claude Code needs is pre-configured:",
      code: [
        "CLAUDE.md               ← Master instruction file (auto-loaded)",
        ".claude/settings.json  ← Allowed tools & dialect routing",
        ".claude/hooks/         ← Pre-bash validator, post-write linter",
        ".claude/rules/         ← Engine rules, orchestration, context graph",
        hasMcp ? ".claude/mcp_config.json ← MCP server connections" : null,
        c.cicd && CICD_FILE_MAP[c.cicd] ? `${CICD_FILE_MAP[c.cicd]}  ← ${CICD_OPTIONS.find((o) => o.value === c.cicd)?.label ?? c.cicd} pipeline` : null,
        "docs/mapping_contract.json  ← Source-to-target column mapping",
        "docs/architecture_spec.md   ← Architecture reference",
        "docs/context_graph.json     ← Graph-RAG index (CONTEXT command)",
        c.documents.length > 0 || Object.keys(c.sectionDocs ?? {}).length > 0
          ? "docs/attachments/ & docs/sections/  ← Your reference documents"
          : null,
        `models/                 ← Scaffolded layer directories (${c.layers.map((l) => l.name).join(", ") || "bronze, silver, gold"})`,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Step 8 — Launch &amp; Run in Claude Code</h2>
      <p className="text-gray-400 text-sm mb-6">
        Your workspace bundle is ready. Follow these steps to activate it in Claude Code.
      </p>

      <div className="space-y-5">
        {steps.map((s, i) => (
          <div key={i} className="border border-gray-700 rounded-lg p-4">
            <h3 className="font-semibold text-sm mb-1">{s.title}</h3>
            <p className="text-gray-400 text-xs mb-3">{s.desc}</p>
            {s.code && (
              <pre className="bg-gray-900 rounded p-3 text-xs text-green-400 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                {s.code}
              </pre>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 rounded-lg bg-blue-950 border border-blue-700 text-sm">
        <p className="font-semibold text-blue-300 mb-1">Pro tip — Context Graph</p>
        <p className="text-gray-300 text-xs">
          When the full CLAUDE.md is too large for a single prompt, use{" "}
          <code className="bg-gray-800 px-1 rounded">CONTEXT &lt;query&gt;</code> inside Claude Code to load only the
          relevant slice. Example: <code className="bg-gray-800 px-1 rounded">CONTEXT silver layer {primaryPlatform}</code>
        </p>
      </div>

      <div className="mt-4 p-4 rounded-lg bg-gray-800 border border-gray-600 text-xs text-gray-400">
        <p>
          Need help? Run <code className="bg-gray-900 px-1 rounded">/help</code> inside Claude Code, or visit{" "}
          <a
            href="https://docs.anthropic.com/claude-code"
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 underline"
          >
            docs.anthropic.com/claude-code
          </a>
          .
        </p>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function WizardPage() {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState<WizardConfig>(emptyConfig);
  const [exporting, setExporting] = useState(false);
  const [repoError, setRepoError] = useState("");

  const setC = useCallback(
    (fn: (p: WizardConfig) => WizardConfig) => setConfig((p) => fn(p)),
    []
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      const { default: JSZip } = await import("jszip");
      const files = compileWorkspace(config);
      const zip = new JSZip();
      for (const [path, content] of Object.entries(files)) {
        if (content.startsWith("__base64__")) {
          zip.file(path, content.slice(10), { base64: true });
        } else {
          zip.file(path, content);
        }
      }
      for (const doc of config.documents) {
        zip.file(`docs/attachments/${doc.name}`, doc.base64, { base64: true });
      }
      for (const [section, docs] of Object.entries(config.sectionDocs ?? {})) {
        for (const doc of docs) {
          zip.file(`docs/sections/${section}/${doc.name}`, doc.base64, { base64: true });
        }
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${config.projectName || "pipeline-agent"}-workspace.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Pipeline Coding Agent</h1>
          <p className="text-gray-400 text-sm mt-1">
            Multi-Engine, Cloud-Agnostic Data Pipeline Agent for Claude Code
          </p>
        </div>

        <StepIndicator current={step} />

        <div className="card mb-6">
          {step === 1 && <Step1 c={config} setC={setC} />}
          {step === 2 && <Step2 c={config} setC={setC} />}
          {step === 3 && <Step3 c={config} setC={setC} />}
          {step === 4 && <Step4 c={config} setC={setC} />}
          {step === 5 && <Step5 c={config} setC={setC} />}
          {step === 6 && <Step6 c={config} setC={setC} />}
          {step === 7 && <Step7 c={config} setC={setC} onExport={handleExport} repoError={repoError} setRepoError={setRepoError} />}
          {step === 8 && <Step8 c={config} />}
        </div>

        <div className="flex justify-between">
          <button
            className="btn-secondary"
            disabled={step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
          >
            ← Back
          </button>
          {step < 7 ? (
            <button className="btn-primary" onClick={() => setStep((s) => Math.min(TOTAL_STEPS, s + 1))}>
              Next →
            </button>
          ) : step === 7 ? (
            <button
              className="btn-primary"
              onClick={async () => {
                const hasRepo = (config.repos ?? []).some((r) => r.url.trim());
                if (!hasRepo) {
                  setRepoError("At least one repository URL is required before generating the workspace.");
                  return;
                }
                setRepoError("");
                await handleExport();
                setStep(8);
              }}
              disabled={exporting}
            >
              {exporting ? "Generating…" : "Download & Continue →"}
            </button>
          ) : (
            <button className="btn-primary" onClick={() => { setStep(1); setConfig(emptyConfig); }}>
              Start New Workspace
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

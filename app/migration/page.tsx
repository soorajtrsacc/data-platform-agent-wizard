"use client";

import { useState, useRef } from "react";
import Link from "next/link";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type MigrationType = "code" | "data" | "both";

interface MigrationConfig {
  projectName: string;
  migrationType: MigrationType;

  // Code migration
  sourceLanguage: string;
  targetLanguage: string;
  sourceNotes: string;

  // Data migration
  dataVolumePart: "small" | "medium" | "large";
  dataVolumeGB: string;
  sourceStorage: string;
  targetStorage: string;
  dataNotes: string;

  // MCP / CLI
  mcpAvailable: boolean;
  cloudCli: string;

  // Attached code/scripts
  sampleFileNames: string[];
  sampleFileContents: { name: string; content: string }[];

  // Notes
  additionalNotes: string;
}

// â”€â”€â”€ Options â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SOURCE_LANGS = [
  { value: "sas", label: "SAS (Base SAS / PROC SQL)" },
  { value: "plsql", label: "Oracle PL/SQL" },
  { value: "bteq", label: "Teradata BTEQ / FastExport / MLoad" },
  { value: "tsql", label: "T-SQL (SQL Server / Sybase)" },
  { value: "ssis", label: "SQL Server SSIS Packages" },
  { value: "informatica", label: "Informatica PowerCenter / IDMC" },
  { value: "abinitio", label: "Ab Initio GDE" },
  { value: "datastage", label: "IBM DataStage" },
  { value: "aws-glue", label: "AWS Glue ETL" },
  { value: "adf", label: "Azure Data Factory (ADF)" },
  { value: "hive", label: "Hive / HQL (Hadoop)" },
  { value: "scala-spark", label: "Scala Spark" },
  { value: "pyspark", label: "PySpark (on-prem Spark)" },
  { value: "shell", label: "Unix Shell (Bash / AWK / Cron)" },
  { value: "other", label: "Other / describe below" },
];

const TARGET_LANGS = [
  { value: "bigquery", label: "BigQuery (GoogleSQL + dbt)" },
  { value: "pyspark-databricks", label: "PySpark + Databricks (Delta Lake)" },
  { value: "snowflake", label: "Snowflake (SQL + Snowpark)" },
  { value: "palantir", label: "Palantir Foundry (Python Transforms / Polars)" },
  { value: "redshift", label: "Amazon Redshift" },
  { value: "synapse", label: "Azure Synapse Analytics" },
  { value: "fabric", label: "Microsoft Fabric (Lakehouse)" },
  { value: "pyspark-gcp", label: "PySpark on Dataproc (GCP)" },
  { value: "pyspark-emr", label: "PySpark on EMR (AWS)" },
  { value: "dbt-generic", label: "dbt Core (generic SQL)" },
];

const SOURCE_STORAGE = [
  { value: "local-files", label: "Local files / NAS" },
  { value: "oracle-db", label: "Oracle Database" },
  { value: "sqlserver", label: "SQL Server" },
  { value: "teradata", label: "Teradata" },
  { value: "hadoop-hdfs", label: "Hadoop HDFS" },
  { value: "aws-s3", label: "AWS S3" },
  { value: "azure-blob", label: "Azure Blob Storage / ADLS" },
  { value: "gcs", label: "Google Cloud Storage (GCS)" },
  { value: "sftp", label: "SFTP / FTP" },
];

const TARGET_STORAGE = [
  { value: "gcs", label: "Google Cloud Storage (GCS) → BigQuery" },
  { value: "aws-s3", label: "AWS S3 → Redshift / Glue / EMR" },
  { value: "adls", label: "ADLS Gen2 → Synapse / Fabric" },
  { value: "databricks-unity", label: "Databricks Unity Catalog (Delta)" },
  { value: "palantir-foundry", label: "Palantir Foundry Datasets" },
  { value: "snowflake-stage", label: "Snowflake Internal/External Stage" },
];

const CLOUD_CLIS = [
  { value: "gcloud", label: "gcloud (GCP)" },
  { value: "aws", label: "aws (AWS)" },
  { value: "az", label: "az (Azure)" },
  { value: "databricks", label: "databricks CLI" },
  { value: "foundry", label: "foundry CLI (Palantir)" },
  { value: "multiple", label: "Multiple CLIs" },
];

// â”€â”€â”€ Plan generator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function generateMigrationClaudeMd(c: MigrationConfig): string {
  const srcLabel = SOURCE_LANGS.find((l) => l.value === c.sourceLanguage)?.label ?? c.sourceLanguage;
  const tgtLabel = TARGET_LANGS.find((l) => l.value === c.targetLanguage)?.label ?? c.targetLanguage;
  const srcStorage = SOURCE_STORAGE.find((s) => s.value === c.sourceStorage)?.label ?? c.sourceStorage;
  const tgtStorage = TARGET_STORAGE.find((s) => s.value === c.targetStorage)?.label ?? c.targetStorage;
  const dataGB = parseFloat(c.dataVolumeGB) || 0;

  const dataTransferStrategy = (() => {
    if (c.migrationType === "code") return "";
    if (dataGB < 10) {
      return `### Data Transfer Strategy — Small Dataset (< 10 GB)

Data volume: **${c.dataVolumeGB || "< 10"} GB**

Recommended approach: **Direct streaming transfer** via ${c.mcpAvailable ? "MCP tool" : `\`${c.cloudCli}\` CLI`}.

| Step | Action |
|------|--------|
| 1 | Export source data as CSV / Parquet from ${srcStorage} |
| 2 | Upload to staging bucket / container (Cloud Storage, S3, ADLS) |
| 3 | Run \`LOAD DATA\` / \`COPY INTO\` / dbt seed into target layer |
| 4 | Validate row counts and checksums |
| 5 | Switch application traffic to new system |

\`\`\`bash
# Example: on-prem CSV → GCS → BigQuery
gcloud storage cp /data/export/*.csv gs://my-bucket/migration/
bq load --source_format=CSV --autodetect my_dataset.my_table gs://my-bucket/migration/*.csv
\`\`\`
`;
    }
    if (dataGB < 100) {
      return `### Data Transfer Strategy — Medium Dataset (10–100 GB)

Data volume: **${c.dataVolumeGB} GB**

Recommended approaches (choose one):

**Option A — Parallel batch export + cloud CLI**
1. Split source data into partitions (by date or key range) — max 5 GB per file.
2. Export each partition in parallel (use screen/tmux or a job array).
3. Upload via \`gsutil -m cp\` / \`aws s3 sync\` / \`az storage blob upload-batch\` for parallel multi-part upload.
4. Load in bulk via \`COPY INTO\` / \`bq load\` / \`MERGE INTO\`.

**Option B — Database replication / CDC**
- Use Debezium (Kafka CDC) to stream changes from source to target.
- Or use cloud DMS: AWS DMS, Google Database Migration Service, Azure Database Migration Service.

**Option C — dbt + external tables**
- Mount source data as external table (e.g., BigQuery External Table over GCS).
- Run dbt incremental models to hydrate internal tables in batches.
`;
    }
    // > 100 GB
    return `### Data Transfer Strategy — Large Dataset (> 100 GB)

Data volume: **${c.dataVolumeGB} GB** — Direct network transfer not recommended at this scale.

**Recommended approaches:**

#### 1. Cloud Partner/Transfer Device (Recommended for > 500 GB)
| Cloud | Service | Notes |
|-------|---------|-------|
| GCP | **Transfer Appliance** | Ship physical device; PB-scale; order at console.cloud.google.com |
| AWS | **AWS Snowball / Snowball Edge** | 80 TB per device; encrypted; order at AWS console |
| Azure | **Azure Data Box** | 100 TB device; ruggedised; order at portal.azure.com |

Steps:
1. Order appliance from cloud console (7–14 day delivery typically).
2. Connect to on-prem network; export data to device using vendor client.
3. Ship device to cloud provider's data centre.
4. Cloud copies data to your designated bucket/container automatically.
5. Validate checksums, then load into target tables.

#### 2. Batch Export with Compression + Resumable Upload
- Compress with \`gzip\` or \`zstd\` (achieves 3–10× compression on tabular data).
- Use resumable/multipart upload protocols: \`gsutil -o GSUtil:parallel_composite_upload_threshold=150M\`.
- Schedule exports in off-peak hours to avoid source system load.

#### 3. Dedicated Transfer Link / Direct Connect
- AWS Direct Connect, Azure ExpressRoute, or Google Cloud Interconnect.
- 10 Gbps+ bandwidth; suitable for ongoing replication after initial load.
- Coordinate with network/infra team for provisioning (weeks lead time).

#### 4. CDC / Incremental Replication
- Load a historical snapshot via appliance, then use CDC (Debezium, Striim, Qlik Replicate) for ongoing delta.
- Keeps source system online during migration.

**Validation**: Always verify row counts, checksums (MD5/SHA-256), and sample records before decommissioning source.
`;
  })();

  const codeMigrationSection = c.migrationType !== "data" ? `
## Code Migration Plan

**Source:** ${srcLabel}
**Target:** ${tgtLabel}
${c.sourceNotes ? `**Notes:** ${c.sourceNotes}` : ""}

### Migration Workflow

Issue this command to migrate a source file:
\`\`\`
MIGRATE <source_file_path> FROM ${c.sourceLanguage} TO ${c.targetLanguage}
\`\`\`

#### Step-by-Step Process
1. **Parse** the source file — identify SQL blocks, procedural logic, UDFs, and data flows.
2. **Extract** business logic: joins, filters, transformations, aggregations.
3. **Map** source constructs to target equivalents (see translation table below).
4. **Generate** target file with lineage comment block at the top.
5. **Lint** the output via sqlfluff / ruff / shellcheck.
6. **Validate** by running dry-run / compile against the target environment.

### Translation Reference
See \`.claude/rules/migration-${c.sourceLanguage}-to-${c.targetLanguage}.md\` for the full translation table.

${c.sampleFileNames.length > 0 ? `### Attached Sample Files
${c.sampleFileNames.map((n) => `- \`docs/samples/${n}\``).join("\n")}
Use these as reference inputs for the MIGRATE command.
` : ""}
` : "";

  const mcpSection = c.mcpAvailable
    ? `## Cloud Access Mode — MCP Active
Connect via MCP for direct cloud API access. No CLI commands needed for routine operations.`
    : `## Cloud Access Mode — CLI Mode
MCP is not configured. Use ${c.cloudCli ? CLOUD_CLIS.find((x) => x.value === c.cloudCli)?.label ?? c.cloudCli : "the appropriate cloud CLI"} for all cloud operations. Ensure you are authenticated before proceeding.`;

  return `# Migration Assistant — ${c.projectName || "Migration Project"}

**Generated:** ${new Date().toISOString()}

## Scope
${c.migrationType === "code" ? "Code migration only (no data transfer)" : c.migrationType === "data" ? "Data transfer only (no code changes)" : "Full migration — code + data"}

---

${codeMigrationSection}

${dataTransferStrategy}

---

${mcpSection}

---

## Quality Gates
- Every migrated SQL file is linted with sqlfluff before acceptance.
- Every migrated Python file is linted with ruff.
- Shell scripts are validated with shellcheck.
- Row counts and checksums validated after each data load batch.

## Additional Notes
${c.additionalNotes || "None provided."}
`;
}

function generateMigrationRules(c: MigrationConfig): string {
  const srcLabel = SOURCE_LANGS.find((l) => l.value === c.sourceLanguage)?.label ?? c.sourceLanguage;
  const tgtLabel = TARGET_LANGS.find((l) => l.value === c.targetLanguage)?.label ?? c.targetLanguage;

  const tables: Record<string, string> = {
    "sas-bigquery": `| SAS Construct | BigQuery Equivalent |
|--------------|---------------------|
| \`PROC SQL\` | \`SELECT\` statement |
| \`DATA step\` | dbt model / Python Dataflow |
| \`PROC MEANS\` | \`SELECT AVG(), MIN(), MAX(), COUNT()\` |
| \`PROC FREQ\` | \`SELECT col, COUNT(*)\` |
| \`PROC SORT\` | \`ORDER BY\` |
| \`SET\` / \`MERGE\` | \`UNION ALL\` / \`JOIN\` |
| \`FORMAT\` / \`INFORMAT\` | \`PARSE_DATE\`, \`FORMAT_DATE\`, \`CAST\` |
| \`%MACRO\` | dbt macro or Jinja template |
| \`libname\` | \`{{ source() }}\` in dbt |
| \`KEEP=\` / \`DROP=\` | Explicit \`SELECT col1, col2, ...\` |`,

    "plsql-bigquery": `| Oracle PL/SQL | BigQuery Equivalent |
|--------------|---------------------|
| \`NVL(a, b)\` | \`COALESCE(a, b)\` |
| \`NVL2(a, b, c)\` | \`CASE WHEN a IS NOT NULL THEN b ELSE c END\` |
| \`DECODE()\` | \`CASE WHEN\` |
| \`ROWNUM\` | \`ROW_NUMBER() OVER (...)\` |
| \`SYSDATE\` | \`CURRENT_DATE()\` |
| \`DUAL\` | Remove — not needed |
| Cursor loop | Set-based SQL or dbt incremental |
| \`DBMS_OUTPUT\` | Remove or replace with logging |
| DB link | External table or federated query |
| \`SEQUENCE.NEXTVAL\` | \`GENERATE_UUID()\` or surrogate key |`,

    "bteq-bigquery": `| Teradata BTEQ | BigQuery Equivalent |
|--------------|---------------------|
| \`SEL\` | \`SELECT\` |
| \`MINUS\` | \`EXCEPT\` |
| \`QUALIFY ROW_NUMBER()\` | Window subquery |
| \`VOLATILE TABLE\` | CTE or \`CREATE TEMP TABLE\` |
| \`COMPRESS\` | Remove |
| FastExport → CSV | \`bq extract\` |
| MLoad upsert | \`MERGE INTO\` |
| \`.LOGON\` | Python connector or bq CLI |
| \`.RUN FILE\` | Subprocess or dbt CLI |`,

    "sas-pyspark-databricks": `| SAS Construct | PySpark / Databricks Equivalent |
|--------------|----------------------------------|
| \`DATA step\` | \`df.transform()\` or Spark SQL |
| \`PROC SQL\` | \`spark.sql()\` or DataFrame API |
| \`PROC MEANS\` | \`df.groupBy().agg(avg(), min(), max())\` |
| \`PROC SORT\` | \`df.orderBy()\` |
| \`SET\` / \`MERGE\` | \`df.union()\` / \`df.join()\` |
| \`%MACRO\` | Python function or Databricks Widget |
| \`libname\` | \`spark.read.table("catalog.schema.table")\` |
| SAS format | \`df.withColumn("col", F.date_format(...))\` |`,

    "shell-pyspark-databricks": `| Shell Pattern | Python / PySpark Equivalent |
|---------------|------------------------------|
| \`bteq << EOF\` | Python \`subprocess\` or bq CLI |
| \`awk\` / \`sed\` column ops | \`df.select(F.split(...))\` or pandas |
| Cron schedule | Databricks Job schedule |
| \`ftp\`/\`sftp\` push | \`dbutils.fs.cp\` or cloud SDK |
| Temp file in \`/tmp\` | \`dbutils.fs\` path in DBFS |`,
  };

  const key = `${c.sourceLanguage}-${c.targetLanguage}`;
  const altKey = `${c.sourceLanguage}-${c.targetLanguage.split("-")[0]}`;
  const table = tables[key] ?? tables[altKey] ?? `| Source Construct | Target Equivalent |
|-----------------|-------------------|
| (custom — review source files) | (derive from business logic) |`;

  return `# Migration Rules: ${srcLabel} → ${tgtLabel}

## Translation Table

${table}

## Lineage Comment Block
Add to every migrated file:
\`\`\`sql
-- Migrated from: <source_file_path>
-- Source system: ${srcLabel}
-- Target system: ${tgtLabel}
-- Migration date: <ISO date>
-- Original object: <schema.table_or_procedure>
\`\`\`

## Validation Checklist
- [ ] Row count matches source (±0.01%)
- [ ] Checksum / hash on key columns matches
- [ ] Null count per column matches
- [ ] Business query results match (sample 10 queries)
- [ ] Performance within SLA (run EXPLAIN / query plan)
- [ ] Lint passes (sqlfluff / ruff / shellcheck)
`;
}

// â”€â”€â”€ Wizard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TOTAL = 4;

function empty(): MigrationConfig {
  return {
    projectName: "",
    migrationType: "both",
    sourceLanguage: "plsql",
    targetLanguage: "bigquery",
    sourceNotes: "",
    dataVolumePart: "small",
    dataVolumeGB: "",
    sourceStorage: "oracle-db",
    targetStorage: "gcs",
    dataNotes: "",
    mcpAvailable: false,
    cloudCli: "gcloud",
    sampleFileNames: [],
    sampleFileContents: [],
    additionalNotes: "",
  };
}

export default function MigrationPage() {
  const [step, setStep] = useState(1);
  const [c, setC] = useState<MigrationConfig>(empty);
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const update = <K extends keyof MigrationConfig>(key: K, val: MigrationConfig[K]) =>
    setC((p) => ({ ...p, [key]: val }));

  const handleSampleFiles = async (files: FileList | null) => {
    if (!files) return;
    const names: string[] = [];
    const contents: { name: string; content: string }[] = [];
    for (const f of Array.from(files)) {
      names.push(f.name);
      const text = await f.text().catch(() => "(binary)");
      contents.push({ name: f.name, content: text.slice(0, 10000) });
    }
    setC((p) => ({
      ...p,
      sampleFileNames: [...p.sampleFileNames, ...names],
      sampleFileContents: [...p.sampleFileContents, ...contents],
    }));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      zip.file("CLAUDE.md", generateMigrationClaudeMd(c));
      zip.file(`.claude/rules/migration-${c.sourceLanguage}-to-${c.targetLanguage}.md`, generateMigrationRules(c));
      for (const f of c.sampleFileContents) {
        zip.file(`docs/samples/${f.name}`, f.content);
      }
      zip.file("README.md", `# ${c.projectName || "Migration"} — Claude Code Agent\n\nGenerated by Migration Assistant.\n`);
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${c.projectName || "migration"}-workspace.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/" className="text-slate-500 hover:text-slate-700 text-sm">← Home</Link>
          <h1 className="text-2xl font-bold">Migration Assistant</h1>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-8">
          {["Migration Type", "Code Migration", "Data Transfer", "Export"].map((label, i) => {
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
                {i < 3 && <div className="w-4 h-px bg-slate-300" />}
              </div>
            );
          })}
        </div>

        <div className="card mb-6 space-y-6">
          {/* Step 1: Migration Type */}
          {step === 1 && (
            <>
              <h2 className="text-xl font-semibold">Step 1 — Migration Type</h2>
              <div>
                <label className="label">Project Name</label>
                <input className="input" placeholder="e.g. teradata-to-bigquery-migration" value={c.projectName}
                  onChange={(e) => update("projectName", e.target.value)} />
              </div>
              <div>
                <label className="label">What are you migrating?</label>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { value: "code", label: "Code Only", desc: "SQL / ETL scripts, stored procedures, notebooks" },
                    { value: "data", label: "Data Only", desc: "Tables, files, datasets — no code changes" },
                    { value: "both", label: "Code + Data", desc: "Full migration — code rewrite and data transfer" },
                  ] as { value: MigrationType; label: string; desc: string }[]).map((opt) => (
                    <button key={opt.value} onClick={() => update("migrationType", opt.value)}
                      className={`card text-left transition-colors ${c.migrationType === opt.value ? "border-purple-500" : ""}`}>
                      <div className="font-medium text-sm mb-1">{opt.label}</div>
                      <div className="text-xs text-slate-500">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Cloud CLI (if MCP not configured)</label>
                <div className="flex gap-3 items-center mb-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={c.mcpAvailable} onChange={(e) => update("mcpAvailable", e.target.checked)} />
                    MCP server is configured (prefer MCP over CLI)
                  </label>
                </div>
                {!c.mcpAvailable && (
                  <select className="input" value={c.cloudCli} onChange={(e) => update("cloudCli", e.target.value)}>
                    {CLOUD_CLIS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
              </div>
            </>
          )}

          {/* Step 2: Code Migration */}
          {step === 2 && (
            <>
              <h2 className="text-xl font-semibold">Step 2 — Code Migration</h2>
              {c.migrationType === "data" && (
                <div className="card  text-slate-500 text-sm">
                  Code migration skipped (Data Only mode). Click Next to proceed to data transfer.
                </div>
              )}
              {c.migrationType !== "data" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Source Technology</label>
                      <select className="input" value={c.sourceLanguage} onChange={(e) => update("sourceLanguage", e.target.value)}>
                        {SOURCE_LANGS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Target Technology</label>
                      <select className="input" value={c.targetLanguage} onChange={(e) => update("targetLanguage", e.target.value)}>
                        {TARGET_LANGS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="label">Source Notes</label>
                    <textarea className="input min-h-[80px]"
                      placeholder="Any specifics about the source codebase — version, patterns, custom constructs, number of scripts…"
                      value={c.sourceNotes} onChange={(e) => update("sourceNotes", e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="label mb-0">Sample Source Files
                        <span className="text-slate-400 font-normal ml-1">(optional — used as migration reference)</span>
                      </label>
                      <button className="btn-secondary text-xs" onClick={() => fileRef.current?.click()}>+ Attach scripts</button>
                      <input ref={fileRef} type="file" multiple accept=".sql,.py,.sas,.sh,.bteq,.ksh,.pl,.java,.scala" className="hidden"
                        onChange={(e) => handleSampleFiles(e.target.files)} />
                    </div>
                    {c.sampleFileNames.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {c.sampleFileNames.map((n, i) => (
                          <span key={i} className="tag text-xs flex items-center gap-1">
                            {n}
                            <button className="opacity-60 hover:opacity-100" onClick={() =>
                              setC((p) => ({
                                ...p,
                                sampleFileNames: p.sampleFileNames.filter((_, j) => j !== i),
                                sampleFileContents: p.sampleFileContents.filter((_, j) => j !== i),
                              }))}>✕</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* Step 3: Data Transfer */}
          {step === 3 && (
            <>
              <h2 className="text-xl font-semibold">Step 3 — Data Transfer</h2>
              {c.migrationType === "code" && (
                <div className="card  text-slate-500 text-sm">
                  Data transfer skipped (Code Only mode). Click Next to export.
                </div>
              )}
              {c.migrationType !== "code" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Source Storage</label>
                      <select className="input" value={c.sourceStorage} onChange={(e) => update("sourceStorage", e.target.value)}>
                        {SOURCE_STORAGE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Target Storage</label>
                      <select className="input" value={c.targetStorage} onChange={(e) => update("targetStorage", e.target.value)}>
                        {TARGET_STORAGE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="label">Estimated Data Volume (GB)</label>
                    <input className="input" type="number" min="0" placeholder="e.g. 5, 50, 500, 5000" value={c.dataVolumeGB}
                      onChange={(e) => {
                        const gb = parseFloat(e.target.value) || 0;
                        update("dataVolumeGB", e.target.value);
                        update("dataVolumePart", gb < 10 ? "small" : gb < 100 ? "medium" : "large");
                      }} />
                  </div>

                  {/* Auto strategy preview */}
                  {c.dataVolumeGB && (
                    <div className={`card text-sm border ${
                      c.dataVolumePart === "small" ? "border-green-700 bg-green-950/20" :
                      c.dataVolumePart === "medium" ? "border-yellow-700 bg-yellow-950/20" :
                      "border-red-700 bg-red-950/20"
                    }`}>
                      {c.dataVolumePart === "small" && (
                        <>
                          <div className="font-semibold text-green-400 mb-1">Recommended: Direct streaming transfer</div>
                          <div className="text-slate-700">Under 10 GB — direct CLI or MCP upload to cloud storage, then bulk load. Fast and simple.</div>
                        </>
                      )}
                      {c.dataVolumePart === "medium" && (
                        <>
                          <div className="font-semibold text-yellow-400 mb-1">Recommended: Parallel batch export</div>
                          <div className="text-slate-700">10–100 GB — split into partitions, parallel upload, bulk load. Or use cloud DMS for online replication.</div>
                        </>
                      )}
                      {c.dataVolumePart === "large" && (
                        <>
                          <div className="font-semibold text-red-400 mb-1">Recommended: Physical transfer device or Direct Connect</div>
                          <div className="text-slate-700">Over 100 GB — use AWS Snowball, Google Transfer Appliance, or Azure Data Box. Then CDC for ongoing delta.</div>
                        </>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="label">Data Transfer Notes</label>
                    <textarea className="input min-h-[80px]" placeholder="Schema details, partition keys, PII considerations, SLA requirements…"
                      value={c.dataNotes} onChange={(e) => update("dataNotes", e.target.value)} />
                  </div>
                </>
              )}
            </>
          )}

          {/* Step 4: Export */}
          {step === 4 && (
            <>
              <h2 className="text-xl font-semibold">Step 4 — Review &amp; Export</h2>
              <div className="card  border border-slate-300">
                <h3 className="font-semibold mb-3">Migration Bundle Summary</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-slate-500">Project</div><div>{c.projectName || "—"}</div>
                  <div className="text-slate-500">Migration Type</div>
                  <div className="capitalize">{c.migrationType === "both" ? "Code + Data" : c.migrationType}</div>
                  {c.migrationType !== "data" && (
                    <>
                      <div className="text-slate-500">Source</div>
                      <div>{SOURCE_LANGS.find((l) => l.value === c.sourceLanguage)?.label ?? c.sourceLanguage}</div>
                      <div className="text-slate-500">Target</div>
                      <div>{TARGET_LANGS.find((l) => l.value === c.targetLanguage)?.label ?? c.targetLanguage}</div>
                      <div className="text-slate-500">Sample files</div><div>{c.sampleFileNames.length}</div>
                    </>
                  )}
                  {c.migrationType !== "code" && (
                    <>
                      <div className="text-slate-500">Data Volume</div>
                      <div>{c.dataVolumeGB ? `${c.dataVolumeGB} GB` : "—"}</div>
                      <div className="text-slate-500">Transfer Strategy</div>
                      <div className="capitalize">{c.dataVolumePart === "small" ? "Direct streaming" : c.dataVolumePart === "medium" ? "Batch export" : "Transfer device / Direct Connect"}</div>
                    </>
                  )}
                  <div className="text-slate-500">Cloud Access</div>
                  <div>{c.mcpAvailable ? "MCP (active)" : `CLI (${c.cloudCli})`}</div>
                </div>
              </div>

              <div>
                <label className="label">Additional Notes for Claude Code</label>
                <textarea className="input min-h-[100px]"
                  placeholder="Anything else the agent should know — constraints, priorities, deadlines, stakeholder requirements…"
                  value={c.additionalNotes} onChange={(e) => update("additionalNotes", e.target.value)} />
              </div>

              <button className="btn-primary w-full text-lg py-3" onClick={handleExport} disabled={exporting}>
                {exporting ? "Generating…" : "Download Migration Workspace Bundle (.zip)"}
              </button>
            </>
          )}
        </div>

        <div className="flex justify-between">
          {step > 1 ? (
            <button className="btn-secondary" onClick={() => setStep((s) => s - 1)}>← Back</button>
          ) : (
            <Link href="/" className="btn-secondary">← Home</Link>
          )}
          {step < TOTAL && (
            <button className="btn-primary" onClick={() => setStep((s) => s + 1)}>Next →</button>
          )}
          {step === TOTAL && (
            <button className="btn-primary" onClick={handleExport} disabled={exporting}>
              {exporting ? "Generating…" : "Download ZIP"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


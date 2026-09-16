import type { WizardConfig, PlatformConfig, McpServer } from "./compiler";

// ─── Label helpers ────────────────────────────────────────────────────────────

const PLATFORM_LABEL: Record<string, string> = {
  bigquery: "BigQuery (GoogleSQL)",
  snowflake: "Snowflake (Snowpark / SQL)",
  databricks: "Databricks (Delta Lake / Unity Catalog)",
  palantir: "Palantir Foundry (Transforms / OSDK)",
  redshift: "Amazon Redshift",
  synapse: "Azure Synapse Analytics",
  fabric: "Microsoft Fabric (Lakehouse / Warehouse)",
  dbt: "dbt Core / dbt Cloud",
  pyspark: "PySpark (EMR / Dataproc / HDInsight)",
  teradata: "Teradata (BTEQ / FastExport)",
  oracle: "Oracle Database (PL/SQL)",
  sqlserver: "SQL Server / SSAS (T-SQL)",
  postgres: "PostgreSQL (PL/pgSQL)",
};

const CLOUD_LABEL: Record<string, string> = {
  gcp: "GCP", aws: "AWS", azure: "Azure", onprem: "On-Premise", any: "Multi-Cloud",
};

const SCHEDULER_LABEL: Record<string, string> = {
  airflow: "Apache Airflow", prefect: "Prefect", dagster: "Dagster",
  "dbt-cloud": "dbt Cloud CLI", "control-m": "BMC Control-M", autosys: "CA Autosys",
};

const dialectFor = (platform: string): string => {
  if (platform === "bigquery") return "bigquery";
  if (platform === "pyspark" || platform === "databricks") return "sparksql";
  if (platform === "redshift") return "redshift";
  if (platform === "synapse" || platform === "sqlserver") return "tsql";
  if (platform === "postgres") return "postgres";
  return "snowflake";
};

// ─── CLAUDE.md ────────────────────────────────────────────────────────────────

export function generateClaudeMd(c: WizardConfig): string {
  const primaryPlatform = c.platforms[0]?.platform ?? "bigquery";
  const primaryDialect = dialectFor(primaryPlatform);
  const legacySources = c.sources.filter((s) => s.isLegacy);
  const envList = c.environments.map((e) => e.name).join(", ") || "dev, staging, prod";

  const layerTable = c.layers.length
    ? c.layers.map((l, i) => {
        const p = c.platforms.find((x) => x.id === l.platformId);
        const platformLabel = p ? (PLATFORM_LABEL[p.platform] ?? p.platform) : "—";
        return `| ${i + 1} | **${l.name}** | \`${l.pathTemplate || "—"}\` | ${platformLabel} | ${l.description} |`;
      }).join("\n")
    : "| — | (no layers defined) | — | — | — |";

  const platformTable = c.platforms.length
    ? c.platforms.map((p) =>
        `| ${CLOUD_LABEL[p.cloud] ?? p.cloud} | ${PLATFORM_LABEL[p.platform] ?? p.platform} | ${p.region || "—"} | ${p.role} |`
      ).join("\n")
    : "| — | (no platforms configured) | — | — |";

  const sourceTable = c.sources.length
    ? c.sources.map((s) =>
        `| ${s.name} | ${s.platform} | ${s.isLegacy ? "✓ Legacy" : "Modern"} | ${s.legacyType || "—"} |`
      ).join("\n")
    : "| — | (no sources defined) | — | — |";

  const repoList = c.repoUrls.filter(Boolean).map((u) => `- ${u}`).join("\n") || "- (not configured)";
  const docList = c.documents.length
    ? c.documents.map((d) => `- \`docs/attachments/${d.name}\``).join("\n")
    : "- (none attached)";

  return `# Enterprise Data Engineering Agent — ${c.projectName || "My Pipeline"}

## Mission
You are an Enterprise Data Platform Engineer specialised in multi-cloud, multi-engine
data architectures and legacy warehouse migrations. You write production-ready, tested,
and fully documented pipeline code that strictly follows this project's configuration.

---

## Architecture Overview
${c.architectureNotes || "_No architecture notes provided — add them in the intake wizard._"}

---

## Environments
Active environments for this project: **${envList}**

| Environment | Notes |
|-------------|-------|
${c.environments.map((e) => `| \`${e.name}\` | ${e.notes || "—"} |`).join("\n") || "| dev | default |"}

> When referencing a layer path that contains \`{env}\`, substitute the active environment name.
> Example: \`project.silver_{env}\` → \`project.silver_dev\` when building for dev.

---

## Platform & Compute Profile

| Cloud | Platform | Region | Role |
|-------|----------|--------|------|
${platformTable}

${c.platformNotes ? `### Platform Notes\n${c.platformNotes}` : ""}

### Loaded Rule Files
${c.platforms
  .map((p) => `- \`.claude/rules/engine-${p.platform}.md\` — ${PLATFORM_LABEL[p.platform] ?? p.platform} standards`)
  .filter((v, i, a) => a.indexOf(v) === i)
  .join("\n")}
${legacySources.length ? "- `.claude/rules/legacy-migration.md` — legacy system translation tables" : ""}
- \`.claude/rules/shell-standards.md\` — POSIX / bash standards
${c.scheduler ? `- \`.claude/rules/orchestration-${c.scheduler}.md\` — ${SCHEDULER_LABEL[c.scheduler] ?? c.scheduler} DAG patterns` : ""}

---

## Data Layer Architecture

| # | Layer | Path Template | Platform | Description |
|---|-------|--------------|----------|-------------|
${layerTable}

${c.layerNotes ? `### Layer Notes\n${c.layerNotes}` : ""}

---

## Source Systems

| Source | Platform | Type | Legacy Type |
|--------|----------|------|-------------|
${sourceTable}

${c.sourceNotes ? `### Source Integration Notes\n${c.sourceNotes}` : ""}

---

## Attached Project Documents
${docList}
These documents have been reviewed. Cross-reference them for business rules, mappings,
and architectural decisions that are not otherwise explicit in this file.

---

## Code Repositories
${repoList}

---

## Deployment Process
${c.deploymentNotes || "_No deployment notes provided._"}

## Design Decisions
${c.designNotes || "_No design notes provided._"}

## Coding Standards
${c.codeStandardsNotes || "_No custom coding standards provided — follow the engine rule files._"}

---

## Translation & Conversion Rules (Legacy)
${
  legacySources.length
    ? legacySources
        .map((s) => {
          if (s.legacyType === "bteq")
            return `### Teradata BTEQ → ${PLATFORM_LABEL[primaryPlatform] ?? primaryPlatform}
- \`SEL\` → \`SELECT\`; \`MINUS\` → \`EXCEPT\`; \`QUALIFY ROW_NUMBER()\` → window subquery / QUALIFY
- FastExport → external stage + \`COPY INTO\` / GCS load; MLoad → \`MERGE INTO\`
- \`VOLATILE TABLE\` → CTE or temp table; remove \`FORMAT\` / \`TITLE\` / \`COMPRESS\``;
          if (s.legacyType === "plsql")
            return `### Oracle PL/SQL → ${PLATFORM_LABEL[primaryPlatform] ?? primaryPlatform}
- \`NVL()\` → \`COALESCE()\`; \`DECODE()\` → \`CASE WHEN\`; \`ROWNUM\` → \`ROW_NUMBER()\`
- PL/SQL cursors → set-based SQL or dbt incremental models
- Stored procedures → dbt macros or Python callables`;
          if (s.legacyType === "shell")
            return `### Unix Shell → Python / Orchestrator
- \`bteq << EOF\` → Python subprocess or dbt CLI
- \`awk\`/\`sed\` → pandas or Spark operations
- Cron / Autosys JIL → ${SCHEDULER_LABEL[c.scheduler] ?? "DAG"} tasks`;
          return `### ${s.name} (${s.platform}) — manual review required`;
        })
        .join("\n\n")
    : "_No legacy source systems configured._"
}

---

## Command Protocols
Wait for an explicit user command before generating code:

| Command | Behaviour |
|---------|-----------|
| \`MIGRATE <file> TO <platform>\` | Parse legacy script → generate target model with lineage comments |
| \`BUILD <pipeline_name>\` | Synthesise pipeline from \`docs/mapping_contract.json\` |
| \`VALIDATE <pipeline_name> [--env <name>]\` | Dry-run linters (sqlfluff / ruff / shellcheck / dbt compile) |
| \`EXECUTE <pipeline_name> [--env <name>] [--dry-run]\` | Run via configured runner |

### MIGRATE workflow
1. Read source file in full.
2. Extract business logic, joins, filters, source→target column mappings.
3. Cross-reference \`docs/mapping_contract.json\` for type-cast rules.
4. Generate destination model; add lineage comment block at top of file.
5. Run VALIDATE automatically.

### BUILD workflow
1. Parse \`docs/mapping_contract.json\` strictly — no inferred mappings.
2. Scaffold layers in order: ${c.layers.map((l) => l.name).join(" → ") || "Raw → Silver → Gold"}.
3. Add audit and data-quality columns per mapping spec.
4. Generate schema tests for every primary key and required column.

---

## Cloud Access Mode

${c.mcpServers.length > 0 ? `### MCP Mode (active)
The following MCP servers are configured — prefer MCP for all cloud interactions:
${c.mcpServers.map((s) => `- **${s.name}**: ${s.description || s.transport}`).join("\n")}

Use MCP tools for read, write, query, and orchestration operations. Fall back to CLI only when a specific operation is not supported by the MCP server.` : `### CLI Mode (no MCP configured)
No MCP servers are configured. Use cloud CLIs for agentic actions. Ensure the relevant CLI is installed and authenticated before issuing commands:

| Cloud / Platform | CLI setup |
|------------------|-----------|
| GCP / BigQuery | \`gcloud auth application-default login\` |
| AWS / Redshift | \`aws configure sso\` |
| Azure / Synapse / Fabric | \`az login\` |
| Databricks | \`databricks configure --token\` |
| Palantir Foundry | \`foundry login\` |
| dbt | \`dbt debug\` |

When a user later configures MCP servers, re-generate this workspace bundle with MCP servers enabled for direct API access mode.`}

---

## Quality Gates (enforced by hooks)
- **Pre-Bash**: Blocks \`DROP TABLE\`, \`TRUNCATE\`, unconstrained \`rm -rf\`, \`DELETE\` without \`WHERE\`.
- **Post-Write (.sql)**: Runs \`sqlfluff lint --dialect ${primaryDialect}\`.
- **Post-Write (.py)**: Runs \`ruff check\`.
- **Post-Write (.sh)**: Runs \`shellcheck\`.
Any lint error is returned immediately for correction before the file is accepted.
`;
}

// ─── .claude/settings.json ────────────────────────────────────────────────────

export function generateSettingsJson(c: WizardConfig): string {
  const primaryPlatform = c.platforms[0]?.platform ?? "snowflake";
  const dialect = dialectFor(primaryPlatform);
  return JSON.stringify(
    {
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: "python3 .claude/hooks/pre_bash_validator.py" }],
          },
        ],
        PostToolUse: [
          {
            matcher: "Edit|Write",
            hooks: [
              {
                type: "command",
                command: `python3 .claude/hooks/post_write_linter.py --dialect ${dialect}`,
              },
            ],
          },
        ],
      },
    },
    null,
    2
  );
}

// ─── Engine rule files ────────────────────────────────────────────────────────

export function generateEngineRules(platform: string, c: WizardConfig): string {
  const envList = c.environments.map((e) => e.name).join(" | ") || "dev | staging | prod";

  const rules: Record<string, string> = {
    bigquery: `# BigQuery (GoogleSQL) Rules

## SQL Dialect
- GoogleSQL only — no ANSI extensions or Teradata/Oracle functions.
- Always use \`SAFE_CAST\` (never bare \`CAST\`); bad values produce \`NULL\` not errors.
- Avoid \`SELECT *\` in production models; always use explicit column lists.
- Use \`DATE_TRUNC\`, \`DATE_DIFF\`, \`TIMESTAMP_TRUNC\` for date arithmetic.
- \`ARRAY_AGG(IGNORE NULLS)\`, \`STRUCT\`, \`JSON_VALUE\` for nested/semi-structured data.

## Partitioning & Clustering
- Partition all large tables by a \`DATE\` or \`TIMESTAMP\` field (DAY granularity).
- Cluster on up to 4 high-cardinality filter columns after the partition key.
- Always filter on the partition column in \`WHERE\` clauses to avoid full-table scans.

## Environment Routing (${envList})
- Dataset naming: \`project.{layer}_{env}\` or use the \`{env}\` placeholder in layer paths.
- Use dbt \`target.schema\` or \`var('env')\` for environment-aware references.

## dbt / BigQuery Integration
- \`{{ source('dataset', 'table') }}\` for all raw source references.
- \`{{ ref('model_name') }}\` for all model dependencies — never hardcode dataset strings.
- Use \`generate_schema_name\` macro for environment-aware dataset routing.
- Materialise Silver and Gold as \`table\`; use \`view\` for ops/reporting only.

## Cost Controls
- Use \`CREATE OR REPLACE TABLE AS SELECT\` for full refreshes.
- Avoid \`SELECT *\` cross-joins or cross-dataset joins without partition filters.
- Monitor slot usage via \`INFORMATION_SCHEMA.JOBS_BY_PROJECT\`.
`,

    snowflake: `# Snowflake (Snowpark / SQL) Rules

## SQL Dialect
- Use \`QUALIFY\` for window-based deduplication — no wrapping subquery needed.
- Use \`IFF(cond, a, b)\` for simple branches; prefer \`CASE WHEN\` for readability.
- \`ARRAY_AGG\`, \`OBJECT_CONSTRUCT\`, \`PARSE_JSON\`, \`FLATTEN\` for semi-structured data.
- Clustering keys: low-cardinality columns; declare in \`dbt_project.yml\` as \`+cluster_by\`.
- Time travel: 1 day (dev), 7 days (prod).

## Environment Routing (${envList})
- Database naming: \`<ENV>_DB\` or \`<PROJECT>_<ENV>\`.
- Use dbt \`target.database\` / \`target.schema\` for environment-aware references.
- Dynamic tables or streams for CDC patterns.

## dbt / Snowflake Standards
- All models: explicit \`{{ config(materialized='table') }}\` or \`incremental\`.
- Incremental strategy: \`delete+insert\` with \`unique_key\`.
- CTEs only — no nested subqueries in production models.
- Run \`dbt compile\` before any \`dbt run\` to validate Jinja rendering.
`,

    databricks: `# Databricks (Delta Lake / Unity Catalog) Rules

## Unity Catalog
- All tables referenced as \`catalog.schema.table\` — never two-part names in production.
- Use UC grants (\`GRANT SELECT ON TABLE …\`) for access control; no legacy ACLs.
- External tables require storage credentials registered in UC.

## Environment Routing (${envList})
- Catalog per environment: \`<project>_dev\`, \`<project>_staging\`, \`<project>_prod\`.
- Use Databricks widgets (\`dbutils.widgets.get("env")\`) for parameterised notebooks/jobs.
- Job clusters: use instance pools for cost efficiency in dev; dedicated clusters in prod.

## Delta Lake
- All output tables use \`delta\` format for ACID compliance.
- Upserts: \`DeltaTable.forName().merge()…\` with \`whenMatchedUpdate\` / \`whenNotMatchedInsert\`.
- \`OPTIMIZE\` + \`ZORDER BY\` on query filter columns for large tables.
- Liquid clustering for high-cardinality tables (DBR 13.3+).
- \`VACUUM\` retention minimum 7 days; never 0 in production.

## Code Standards
- Production code lives in Python files (\`.py\`), not notebooks.
- \`ruff check\` + \`ruff format\` must pass before commit.
- \`mypy --strict\` on all typed modules.
- Entry point: \`if __name__ == "__main__": SparkSession.builder…\`
- All jobs accept CLI args via \`argparse\`; no hardcoded paths or credentials.

## MLflow
- Log all experiments with \`mlflow.autolog()\`.
- Register production models in MLflow Model Registry.
- Use \`mlflow.pyfunc\` for custom inference.
`,

    palantir: `# Palantir Foundry Rules

## Code Repositories (Python Transforms)
- Use \`@transform\` decorator for batch transforms; \`@incremental\` for append/partition loads.
- Declare inputs/outputs as \`Input(dataset_rid)\` / \`Output(dataset_rid)\`.
- Never use \`pandas.read_csv\` for Foundry datasets — always use Transform inputs.
- Use \`ctx.auth()\` for OSDK API calls; never hardcode tokens or service account secrets.

## Polars (Data Engineering Jobs)
- Preferred DataFrame library for Foundry Python data engineering jobs (faster than pandas).
- \`import polars as pl\` — use lazy evaluation (\`pl.scan_*\`) for large datasets.
- Convert Foundry arrow-format outputs: \`df = pl.from_arrow(transform_input.arrow())\`.
- Write results back: \`output.write_arrow(df.to_arrow())\`.
- Use \`pl.Expr\` chaining instead of row-wise apply; avoid \`.apply()\` (not parallelised).
- Aggregations: \`df.group_by("col").agg(pl.col("value").sum())\`.
- Joins: \`df.join(other, on="key", how="left")\` — prefer \`left\` and \`inner\`; avoid cross joins.
- \`pl.LazyFrame\` for pipeline construction; call \`.collect()\` only once at write time.
- Type casting: \`df.cast({"col": pl.Int64})\`; use \`strict=False\` for nullable numerics.
- Enforce schema at transform output: \`output.set_schema(schema)\` when dataset schema is registered.
- \`ruff check\` + \`ruff format\` must pass; \`mypy --strict\` on all typed Transform files.

\`\`\`python
# Example: Foundry incremental transform with Polars
import polars as pl
from transforms.api import transform, Input, Output, incremental

@incremental()
@transform(
    output=Output("/project/silver/transactions"),
    raw=Input("/project/bronze/raw_transactions"),
)
def compute(ctx, raw, output):
    df = pl.from_arrow(raw.arrow())
    result = (
        df.lazy()
        .filter(pl.col("status") == "COMPLETED")
        .with_columns([
            pl.col("amount").cast(pl.Float64),
            pl.col("ts").str.to_datetime(),
        ])
        .group_by("merchant_id")
        .agg(pl.col("amount").sum().alias("total_amount"))
        .collect()
    )
    output.write_arrow(result.to_arrow())
\`\`\`

## SQL Transforms
- Foundry SQL uses Spark SQL dialect inside Pipeline Builder.
- Reference datasets by logical path: \`/{project}/{dataset_path}\`.
- Explicit column lists in all transforms (no \`SELECT *\` downstream of raw).

## Environment Routing (${envList})
- Use Foundry branches (\`dev\`, \`main\`) for environment isolation; tag releases as \`prod\`.
- Dataset RIDs are environment-specific — never hardcode a RID; use \`Input()\` references.
- Use \`@configure\` decorator for environment-specific settings (memory, executor count).

## Dataset Naming
- Follow Foundry ontology naming: \`snake_case\` for dataset paths, \`PascalCase\` for object types.
- Partition by \`date\` where possible using \`@incremental(snapshot_inputs=[…])\`.
- Add \`_bronze\` / \`_silver\` / \`_gold\` suffixes to dataset paths per medallion tier.

## OSDK / Workshop / Contour
- OSDK client is generated from the ontology — never write raw REST calls.
- Action types must be modelled in the ontology before coding.
- Contour: for ad-hoc exploration only; production logic lives in Code Repositories.
- Workshop applications use OSDK actions and object sets — not direct dataset queries.

## Pipeline Builder (no-code)
- Prefer Code Repository transforms for complex logic; use Pipeline Builder for simple ingestion.
- Document all node configurations in commit messages.
`,

    redshift: `# Amazon Redshift Rules

## SQL Dialect
- Redshift SQL — subset of PostgreSQL; avoid standard PG-only functions.
- Use \`DISTKEY\` on high-cardinality join columns; \`SORTKEY\` on filter columns.
- \`COPY\` command for bulk S3 ingestion; never row-by-row inserts in production.
- \`LISTAGG\` for string aggregation; \`MEDIAN\` for median (not window-based).

## Environment Routing (${envList})
- Schema per environment: \`<layer>_dev\`, \`<layer>_staging\`, \`<layer>_prod\`.
- Use dbt \`target.schema\` for environment-aware routing.

## Performance
- Run \`ANALYZE\` after large data loads; \`VACUUM\` to reclaim space.
- Use \`WLM\` queue routing for long-running ETL vs short BI queries.
`,

    synapse: `# Azure Synapse Analytics Rules

## Dedicated SQL Pool (T-SQL)
- Use \`ROUND_ROBIN\` distribution for staging; \`HASH\` on join key for facts.
- \`CTAS\` (CREATE TABLE AS SELECT) for transformations — no in-place updates.
- \`STATISTICS\` must be created/updated on join and filter columns.
- Avoid \`SELECT *\`; always use explicit column projections.

## Serverless SQL Pool
- Query Parquet / Delta files in ADLS Gen2 via \`OPENROWSET\` or external tables.
- Use \`UTF-8\` collation for string columns; specify \`WITH (DATA_SOURCE=…)\`.

## Environment Routing (${envList})
- ADLS container per environment: \`{env}/bronze/\`, \`{env}/silver/\`, \`{env}/gold/\`.
- Use Synapse Linked Services with parameterised datasets for environment switching.
`,

    fabric: `# Microsoft Fabric Rules

## Lakehouse (Delta / Spark)
- Store all data as Delta tables in OneLake; reference via \`Tables/\` path.
- Use Spark notebooks or Python scripts (not notebooks for prod); \`ruff\` lint required.
- \`df.write.format("delta").mode("overwrite").save()\` for full refresh.
- \`DeltaTable.merge()\` for CDC / incremental loads.

## Warehouse (T-SQL)
- Use Fabric Warehouse for SQL-first analytics; T-SQL dialect (subset).
- Views and stored procedures are supported; avoid triggers.

## Environment Routing (${envList})
- Separate Fabric workspaces per environment: \`{project}-dev\`, \`{project}-prod\`.
- Use Fabric deployment pipelines for workspace promotion (dev → staging → prod).

## Data Pipelines
- Prefer Fabric Data Pipelines for orchestration; map activities to Spark notebooks.
- Use Fabric Eventstreams for real-time ingestion into Lakehouse.
`,

    dbt: `# dbt Core / dbt Cloud Rules

## Model Structure
- Standard CTE chain: \`source → typed → quality → final SELECT\`.
- No \`SELECT *\` anywhere except the top-level source CTE.
- All models explicitly declare \`{{ config(materialized=…) }}\`.

## Testing
- Every model has a schema.yml entry with \`unique\` + \`not_null\` on every PK.
- FK relationships tested via \`relationships\` test pointing to parent model.
- Singular tests in \`tests/singular/\` for complex business assertions.

## Environment Routing (${envList})
- \`profiles.yml\` defines targets per environment (\`dev\`, \`staging\`, \`prod\`).
- Use \`{{ target.schema }}\` and \`{{ target.database }}\` for environment routing.
- dbt Cloud: separate jobs per environment; use job variables for environment-specific paths.

## Sources & Refs
- Raw tables: \`{{ source('layer', 'table') }}\` — never raw schema strings.
- Model deps: \`{{ ref('model_name') }}\` — never qualified table names.

## Macros & Jinja
- Repeated logic → macros in \`macros/\`; document args above the macro definition.
- Use \`{{ var('key') }}\` for environment-specific values; define in \`dbt_project.yml\`.
`,

    pyspark: `# PySpark (EMR / Dataproc / HDInsight) Rules

## DataFrame API
- Prefer DataFrame API over RDD; never use \`.collect()\` on production-scale data.
- Cache DataFrames reused more than once: \`.cache()\` or \`.persist(StorageLevel.DISK_AND_MEMORY)\`.
- Use \`broadcast(small_df)\` for dimension joins < 10 MB.
- Partition pruning: always filter on partition columns before any join.
- Avoid UDFs where a built-in Spark function exists (UDFs break Catalyst).

## Environment Routing (${envList})
- Pass env as a Spark config or CLI arg: \`--conf spark.env=dev\`.
- Read env from \`spark.conf.get("spark.env", "dev")\` at job start.
- Separate S3/GCS/ADLS prefixes per environment.

## Code Standards
- \`ruff check\` + \`ruff format\` must pass before commit.
- \`mypy --strict\` on all typed modules.
- Entry point: \`if __name__ == "__main__": SparkSession.builder…\`
- All jobs accept CLI args via \`argparse\`; no hardcoded paths or credentials.
`,

    teradata: `# Teradata (BTEQ / FastExport / MLoad) Rules

## Migration-Source Only
This Teradata instance is a **migration source**, not a build target.
All new development targets ${c.platforms.find((p) => p.role === "primary")?.platform ?? "the primary platform"}.

## Script Reading
- Identify \`BTEQ\`, \`FASTEXPORT\`, and \`MLOAD\` blocks within legacy scripts.
- Preserve business filter predicates verbatim (translate syntax only, not semantics).
- Flag unsupported constructs with \`-- TODO: manual review required\`.
`,

    oracle: `# Oracle Database (PL/SQL) Rules

## Migration-Source Only
This Oracle instance is a **migration source**, not a build target.
All new development targets ${c.platforms.find((p) => p.role === "primary")?.platform ?? "the primary platform"}.

## Script Reading
- Identify PL/SQL packages, procedures, functions, and cursors.
- Map Oracle types to target types per \`docs/mapping_contract.json\`.
`,
  };

  return rules[platform] ?? `# ${PLATFORM_LABEL[platform] ?? platform} Rules\n\nConfigure platform-specific rules here.\n`;
}

// ─── Legacy migration rules ───────────────────────────────────────────────────

export function generateLegacyMigrationRules(c: WizardConfig): string {
  const legacySources = c.sources.filter((s) => s.isLegacy);
  const primaryPlatform = c.platforms[0]?.platform ?? "bigquery";

  return `# Legacy Migration Rules

## Scope
Translation tables for migrating legacy source code to ${PLATFORM_LABEL[primaryPlatform] ?? primaryPlatform}.

${legacySources.some((s) => s.legacyType === "bteq") ? `
## Teradata BTEQ → Target

| Teradata Construct | Target Equivalent |
|--------------------|-------------------|
| \`SEL\` | \`SELECT\` |
| \`MINUS\` | \`EXCEPT\` |
| \`QUALIFY ROW_NUMBER()\` | Window subquery or \`QUALIFY\` (Snowflake) |
| \`SAMPLE n\` | \`TABLESAMPLE SYSTEM (n ROWS)\` |
| \`COMPRESS\` | Remove — no equivalent |
| \`FORMAT\` / \`TITLE\` | Remove — presentation layer only |
| \`.LOGON\` | Python connection wrapper |
| \`.RUN FILE\` | \`{{ ref() }}\` or subprocess call |
| FastExport \`FEXP\` | External stage + \`COPY INTO\` / GCS load |
| MLoad batch upsert | \`MERGE INTO\` |
| \`VOLATILE TABLE\` | CTE or temp table |
| \`Multiset\` table | Standard table (dupes not allowed by default) |
` : ""}

${legacySources.some((s) => s.legacyType === "plsql") ? `
## Oracle PL/SQL → Target

| Oracle Construct | Target Equivalent |
|------------------|-------------------|
| \`NVL(a, b)\` | \`COALESCE(a, b)\` |
| \`NVL2(a, b, c)\` | \`CASE WHEN a IS NOT NULL THEN b ELSE c END\` |
| \`DECODE(col, v1, r1)\` | \`CASE WHEN col = v1 THEN r1 END\` |
| \`ROWNUM\` | \`ROW_NUMBER() OVER (ORDER BY ...)\` |
| \`SYSDATE\` | \`CURRENT_DATE()\` |
| \`DUAL\` | Remove (valueless SELECT) |
| DB link | External table or staged extract |
| PL/SQL cursor loop | Set-based SQL or dbt macro |
| Stored procedure | dbt macro or Python callable |
` : ""}

${legacySources.some((s) => s.legacyType === "shell") ? `
## Unix Shell → Python / Orchestrator

| Shell Pattern | Modern Equivalent |
|---------------|-------------------|
| \`bteq << EOF\` | Python subprocess or dbt CLI |
| \`sqlplus / @script.sql\` | \`oracledb\` Python client |
| \`awk\` column extract | pandas / Spark \`select\` |
| Cron schedule | DAG \`schedule_interval\` |
| Autosys JIL | \`ExternalTaskSensor\` or Prefect \`wait_for\` |
| \`ftp\`/\`sftp\` push | Cloud storage SDK |
` : ""}

## Lineage Comment Block (mandatory on every migrated file)
\`\`\`sql
-- Migrated from: <source_file_path>
-- Source system: ${legacySources.map((s) => s.name).join(", ")}
-- Migration date: <ISO date>
-- Original object: <schema.table_or_proc>
\`\`\`

Flag any constructs with no direct equivalent as \`-- TODO: manual review required\`.
`;
}

// ─── Shell standards ──────────────────────────────────────────────────────────

export function generateShellStandardsRules(): string {
  return `# Shell Script Standards

## Script Header (mandatory)
\`\`\`bash
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\\n\\t'
\`\`\`

## Exit Codes
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Runtime / unexpected error |
| 2 | Configuration / validation error |
| 3 | Dependency missing |

## Security
- No hardcoded credentials — read from env vars or secret manager CLI.
- Validate all inputs: \`[[ -z "\${VAR:-}" ]] && { echo "VAR required" >&2; exit 2; }\`
- Temp files: \`mktemp\` + \`trap "rm -f \$tmpfile" EXIT\`.
- Avoid \`eval\`; avoid unquoted variables in command substitutions.

## Style
- Functions: \`snake_case\`; one-line comment above each.
- Constants: \`UPPER_SNAKE_CASE\` at top of script.
- Log to \`stderr\`; data to \`stdout\`.
- \`shellcheck -S warning\` must pass with zero findings.
`;
}

// ─── Orchestration rules ──────────────────────────────────────────────────────

export function generateOrchestrationRules(c: WizardConfig): string {
  return `# Orchestration Rules — ${SCHEDULER_LABEL[c.scheduler] ?? c.scheduler}

## DAG / Job Design Principles
- One task per logical operation (ingest, transform, test, notify).
- Use upstream sensors / wait conditions; avoid hardcoded sleep.
- All tasks emit structured logs with \`run_id\`, \`layer\`, and \`table\` fields.
- Retry policy: max 2 retries, exponential backoff; alert on final failure.

## Task Naming Convention
\`<layer>__<source>__<entity>__<operation>\`
Example: \`silver__crm__customers__transform\`

## Layer Dependency Order
${c.layers.map((l, i) => `${i + 1}. ${l.name}_ingest → ${l.name}_transform → ${l.name}_dq_check`).join("\n") || "1. raw_ingest → silver_transform → gold_aggregate → ops_dq_check → notify"}

## Environment Promotion
- All DAGs accept an \`env\` parameter (\`${c.environments.map((e) => e.name).join(" | ")}\`).
- Use the \`env\` parameter to resolve layer paths (substitute \`{env}\` placeholders).
`;
}

// ─── Hook scripts ─────────────────────────────────────────────────────────────

export function generatePreBashValidator(): string {
  return `#!/usr/bin/env python3
"""pre_bash_validator.py — Claude Code PreToolUse hook. Blocks destructive commands."""
import sys, json, re

BLOCKED = [
    (r"(?i)\\bDROP\\s+TABLE\\b", "DROP TABLE is blocked. Use CREATE OR REPLACE."),
    (r"(?i)\\bTRUNCATE\\s+TABLE\\b", "TRUNCATE is blocked."),
    (r"(?i)\\bDELETE\\s+FROM\\b(?!.*\\bWHERE\\b)", "DELETE without WHERE is blocked."),
    (r"rm\\s+-[a-z]*r[a-z]*f|rm\\s+-[a-z]*f[a-z]*r", "rm -rf is blocked. Specify exact paths."),
    (r"(?i)\\bDROP\\s+(DATABASE|SCHEMA)\\b", "DROP DATABASE/SCHEMA is blocked."),
]

def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    command = payload.get("tool_input", {}).get("command", "")
    for pattern, msg in BLOCKED:
        if re.search(pattern, command):
            print(json.dumps({"decision": "block", "reason": f"[pre_bash_validator] {msg}"}))
            sys.exit(0)
    sys.exit(0)

if __name__ == "__main__":
    main()
`;
}

export function generatePostWriteLinter(): string {
  return `#!/usr/bin/env python3
"""post_write_linter.py — Claude Code PostToolUse hook. Lints SQL, Python, and Shell on save."""
import sys, json, subprocess, argparse, pathlib

def run(cmd: list[str]) -> tuple[int, str]:
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr).strip()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dialect", default="snowflake")
    args, _ = parser.parse_known_args()
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    file_path = payload.get("tool_input", {}).get("file_path", "")
    if not file_path or not pathlib.Path(file_path).exists():
        sys.exit(0)
    ext = pathlib.Path(file_path).suffix.lower()
    errors: list[str] = []
    if ext == ".sql":
        code, out = run(["sqlfluff", "lint", "--dialect", args.dialect, "--nocolor", file_path])
        if code != 0:
            errors.append(f"sqlfluff ({args.dialect}):\\n{out}")
    elif ext == ".py":
        code, out = run(["ruff", "check", "--no-cache", file_path])
        if code != 0:
            errors.append(f"ruff:\\n{out}")
    elif ext == ".sh":
        code, out = run(["shellcheck", "-S", "warning", file_path])
        if code != 0:
            errors.append(f"shellcheck:\\n{out}")
    if errors:
        print(json.dumps({"type": "error", "message": "[post_write_linter] Lint errors:\\n\\n" + "\\n\\n".join(errors)}))
    sys.exit(0)

if __name__ == "__main__":
    main()
`;
}

// ─── Docs ─────────────────────────────────────────────────────────────────────

export function generateMappingContract(c: WizardConfig): string {
  return JSON.stringify(
    {
      metadata: {
        project: c.projectName || "my-pipeline",
        platforms: c.platforms.map((p) => p.platform),
        environments: c.environments.map((e) => e.name),
        sourceFiles: c.mappingFileNames,
        generatedAt: new Date().toISOString(),
      },
      mappings: c.mappingRows,
    },
    null,
    2
  );
}

export function generateMcpConfig(c: WizardConfig): string {
  const mcpServers: Record<string, unknown> = {};
  for (const srv of c.mcpServers) {
    const envObj: Record<string, string> = {};
    for (const ev of srv.envVars) {
      if (ev.key) envObj[ev.key] = ev.value;
    }
    if (srv.transport === "stdio") {
      mcpServers[srv.name] = {
        type: "stdio",
        command: srv.command ?? "",
        args: srv.args ?? [],
        ...(Object.keys(envObj).length ? { env: envObj } : {}),
      };
    } else {
      mcpServers[srv.name] = {
        type: srv.transport,
        url: srv.url ?? "",
        ...(Object.keys(envObj).length ? { env: envObj } : {}),
      };
    }
  }
  return JSON.stringify({ mcpServers }, null, 2);
}

export function generateArchitectureSpec(c: WizardConfig): string {
  return `# Architecture Specification — ${c.projectName || "My Pipeline"}

**Generated:** ${new Date().toISOString()}

## Overview
${c.architectureNotes || "TBD"}

## Environments
${c.environments.map((e) => `- **${e.name}**: ${e.notes || "—"}`).join("\n") || "- dev, staging, prod"}

## Platforms
${c.platforms
  .map(
    (p) =>
      `- **${CLOUD_LABEL[p.cloud] ?? p.cloud} / ${PLATFORM_LABEL[p.platform] ?? p.platform}** (${p.role}) — ${p.region || "—"}${p.notes ? `\n  ${p.notes}` : ""}`
  )
  .join("\n") || "TBD"}

## Data Layer Architecture
${c.layers
  .map((l, i) => {
    const envPaths = c.environments.map((e) => `  - ${e.name}: \`${l.pathTemplate.replace("{env}", e.name)}\``).join("\n");
    return `### Layer ${i + 1}: ${l.name}\n${l.description ? `${l.description}\n` : ""}${envPaths}`;
  })
  .join("\n\n") || "TBD"}

## Source Systems
${c.sources.map((s) => `- **${s.name}** (${s.platform}) — ${s.isLegacy ? "Legacy migration source" : "Modern integration"}${s.connectionNotes ? `: ${s.connectionNotes}` : ""}`).join("\n") || "TBD"}

## Orchestration
- Scheduler: ${(SCHEDULER_LABEL[c.scheduler] ?? c.scheduler) || "TBD"}
- Repos: ${c.repoUrls.filter(Boolean).join(", ") || "TBD"}

## Deployment Process
${c.deploymentNotes || "TBD"}

## Design Decisions
${c.designNotes || "TBD"}

## Coding Standards
${c.codeStandardsNotes || "TBD"}

## Attached Documents
${c.documents.length ? c.documents.map((d) => `- ${d.name}`).join("\n") : "None"}
`;
}

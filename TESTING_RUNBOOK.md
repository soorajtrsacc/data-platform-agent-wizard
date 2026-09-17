# Pipeline Coding Agent — Testing Runbook

Repeatable end-to-end test using the dbt Medallion project docs.

## Prerequisites

- Node.js 18+ installed
- Dev server running on `http://localhost:3001`

### Start the server (if not running)

**Windows (PowerShell)**
```powershell
cd "C:\Users\sooraj.t.r\OneDrive - Accenture\Downloads\gcp_folder\pipeline-coding-agent"
npm run dev
```

**macOS / Linux**
```bash
cd ~/path/to/pipeline-coding-agent
npm run dev
```

---

## Step-by-Step Wizard Test

Open `http://localhost:3001` → click **Pipeline Coding Agent**.

### Step 1 — Project Setup

| Field | Value |
|---|---|
| Project Name | `dbt-gcp-medallion-pipeline` |
| Architecture Notes | Medallion Architecture on GCP BigQuery + dbt. Bronze/Silver/Gold/Ops layers. Project: acn-uki-ds-data-ai-project, region europe-west2. 26 Bronze source tables, 26 Silver models, 6 Gold canonical entities, Ops DQ/reconciliation. |
| AI Coding Agent(s) | ✅ Claude Code (minimum); optionally add Cursor or GitHub Copilot |
| Environments | dev, staging, prod (defaults — keep as-is) |
| Attach Docs | Upload `MEDALLION_PROMPT_TEMPLATE.md` from `BQ_load\dbt_project\docs\` |

**Expected after doc upload:** Repositories field auto-populates with `https://github.com/soorajtrsacc/dbt_gcp.git`

Click **Next →**

---

### Step 2 — Platforms & Cloud Targets

Click **+ Add Platform**, then fill:

| Field | Value |
|---|---|
| Platform / Engine | BigQuery (GoogleSQL) |
| Cloud Provider | Google Cloud (GCP) |
| Region | `europe-west2` |
| Role | Primary compute |
| Platform Notes | Project: acn-uki-ds-data-ai-project. dbt datasets: credit_card_synt (Bronze), silver, gold, ops. |

Click **Next →**

---

### Step 3 — Data Layer Architecture

Click quick-add buttons: **Bronze**, **Silver**, **Gold** — then **+ Add Layer** for Ops.

| Layer | Path Template | Description |
|---|---|---|
| Bronze | `acn-uki-ds-data-ai-project.credit_card_synt` | 26 raw synthetic credit-card source tables |
| Silver | `acn-uki-ds-data-ai-project.silver` | 26 silver_* dbt models with SAFE_CAST + DQ columns |
| Gold | `acn-uki-ds-data-ai-project.gold` | 6 canonical entities: customer_360, transaction_360, merchant_performance, account_financial_summary, fraud_case_360, rewards_engagement |
| Ops | `acn-uki-ds-data-ai-project.ops` | Mapping seeds, gold_data_quality_report, medallion_reconciliation_report |

Layer Architecture Notes: `Bronze: raw → Silver: SAFE_CAST+DQ → Gold: canonical joins → Ops: DQ reports. All layers europe-west2.`

Click **Next →**

---

### Step 4 — Source Systems

Click **+ Add Source System**:

| Field | Value |
|---|---|
| Name | `Credit Card Synthetic Data (BigQuery)` |
| Platform | `bigquery` |
| Legacy? | No |
| Connection Notes | Dataset: acn-uki-ds-data-ai-project.credit_card_synt (europe-west2). Accessed via dbt source() macros. |

Click **Next →**

---

### Step 5 — Mapping Sheets

Paste into the CSV textarea (or upload `03_Mapping_Document.xlsx`):

```
source_layer,source_object,target_layer,target_object,primary_key,dbt_model,output_dataset
bronze,customers,silver,silver_customers,customer_id,silver_customers,silver
bronze,accounts,silver,silver_accounts,account_id,silver_accounts,silver
bronze,transactions,silver,silver_transactions,transaction_id,silver_transactions,silver
bronze,credit_cards,silver,silver_credit_cards,card_id,silver_credit_cards,silver
silver,silver_customers+silver_accounts+silver_credit_cards,gold,gold_customer_360,customer_id,gold_customer_360,gold
silver,silver_transactions+silver_merchants,gold,gold_transaction_360,transaction_id,gold_transaction_360,gold
```

Click **Next →**

---

### Step 6 — MCP Server Connections

Click preset **+ bigquery**, then update Args:

| Field | Value |
|---|---|
| Server Name | `bigquery` |
| Transport | stdio (local process) |
| Command | `uvx` |
| Args | `mcp-server-bigquery --project acn-uki-ds-data-ai-project --location europe-west2` |

Click **Next →**

---

### Step 7 — Deployment & Export

| Field | Value |
|---|---|
| Orchestration Scheduler | dbt Cloud CLI |
| CI/CD Pipeline | GitHub Actions |
| Repository URL | `https://github.com/soorajtrsacc/dbt_gcp.git` *(auto-detected from doc)* |
| Default Branch | `master` |
| Alias / Name | `dbt_gcp` |

Click **Download Agent Workspace Bundle (.zip)** — verify the download starts.

Click **Download & Continue →**

---

### Step 8 — Verify ZIP Contents

After download, verify the ZIP contains:

```
CLAUDE.md                          ✓ Master instruction file
.claude/settings.json              ✓ Allowed tools + sqlfluff bigquery dialect
.claude/hooks/pre_bash_validator.py ✓ Safety hooks
.claude/hooks/post_write_linter.py  ✓ Post-write linting
.claude/rules/shell-standards.md    ✓ Shell conventions
.claude/rules/engine-bigquery.md    ✓ BigQuery/GoogleSQL rules
.claude/rules/repo-policy.md        ✓ Mandatory clone/commit/push policy
.claude/mcp_config.json             ✓ BigQuery MCP connection
.github/workflows/ci.yml            ✓ GitHub Actions pipeline
docs/mapping_contract.json          ✓ Source-to-target mapping
docs/architecture_spec.md           ✓ Architecture documentation
docs/context_graph.json             ✓ Graph-RAG index
models/bronze/.gitkeep              ✓ Layer scaffolding
models/silver/.gitkeep
models/gold/.gitkeep
models/ops/.gitkeep
README.md                           ✓ Quick-start guide
```

---

## Pass Criteria

| Check | Expected |
|---|---|
| Bundle summary shows | 4 layers, 1 MCP server, 1 repo, GitHub Actions |
| Repo URL pre-filled | `https://github.com/soorajtrsacc/dbt_gcp.git` (from doc auto-detect) |
| ZIP downloads | File named `dbt-gcp-medallion-pipeline-workspace.zip` |
| CLAUDE.md contains | Project name, BigQuery dialect, repo clone workflow |
| repo-policy.md present | Clone/commit/push rules enforced |
| GitHub Actions yml present | `.github/workflows/ci.yml` |

---

## Automated Test (Jest)

```bash
cd "C:\Users\sooraj.t.r\OneDrive - Accenture\Downloads\gcp_folder\pipeline-coding-agent"
npx jest --no-coverage
```

Expected: **37 tests pass, 0 fail**

---

## Quick Reset

To restart the wizard from scratch, click the browser back button or navigate to `http://localhost:3001/wizard` — the form resets to defaults automatically.

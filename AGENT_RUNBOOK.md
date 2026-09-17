# Agent Interaction Runbook

After extracting the ZIP and opening Claude Code (or your chosen agent) in the workspace, use this guide to validate the agent is correctly configured and to run common data pipeline tasks.

---

## 1. Validate the Agent Knows Your Project

Ask these questions first. Each has a clear expected answer — wrong or vague answers mean the agent did not load `CLAUDE.md` correctly.

### Project context check

```
What project are we working on and what is the architecture?
```

**Expected:** Agent describes your project name, Medallion layers (Bronze/Silver/Gold/Ops), BigQuery datasets (`acn-uki-ds-data-ai-project`), and the dbt stack.

---

### Layer check

```
List all data layers in this project with their BigQuery dataset paths.
```

**Expected:**
- Bronze → `acn-uki-ds-data-ai-project.credit_card_synt`
- Silver → `acn-uki-ds-data-ai-project.silver`
- Gold → `acn-uki-ds-data-ai-project.gold`
- Ops → `acn-uki-ds-data-ai-project.ops`

---

### Repository check

```
What is the git repository URL and default branch for this project?
```

**Expected:** `https://github.com/soorajtrsacc/dbt_gcp.git` · branch `master`

---

### Repo policy check

```
What should you do before making any code changes?
```

**Expected:** Agent should state the clone/checkout/pull workflow from `.claude/rules/repo-policy.md`:
1. Clone the repo if not present
2. `git checkout master`
3. `git pull origin master`
4. Make changes
5. `git add -A && git commit -m "..."&& git push origin master`

---

### MCP check (Claude Code only)

```
/mcp
```

**Expected:** `bigquery` server listed as connected. If disconnected, run:
```bash
gcloud auth application-default login
gcloud config set project acn-uki-ds-data-ai-project
```

---

## 2. Common Workflow Commands

### BUILD — scaffold or run a dbt model

```
BUILD silver_customers
```

```
BUILD gold_customer_360
```

```
BUILD ops.gold_data_quality_report
```

**What to expect:** Agent generates the dbt SQL model following the layer rules — `SAFE_CAST` for Silver, canonical joins for Gold, audit columns on every model.

---

### VALIDATE — check a model or dataset

```
VALIDATE silver_transactions
```

```
VALIDATE gold_fraud_case_360
```

**What to expect:** Agent queries `ops.gold_data_quality_report` and `ops.medallion_reconciliation_report` for the named model, interprets the results, and flags any FAIL rows.

---

### MIGRATE — convert legacy SQL to BigQuery/dbt

```
MIGRATE legacy/scripts/daily_load.bteq TO bigquery
```

```
MIGRATE legacy/oracle_proc.sql TO bigquery
```

**What to expect:** Agent translates BTEQ/PL-SQL to GoogleSQL, wraps in a dbt model with CTE pattern, replaces `CAST` with `SAFE_CAST`, and adds audit columns.

---

### CONTEXT — load project graph for focused answers

```
CONTEXT bigquery layer path
```

```
CONTEXT silver_customers model
```

**What to expect:** Agent reads `docs/context_graph.json` and returns a focused subgraph for the queried concept — faster and cheaper than reading all of CLAUDE.md.

---

## 3. dbt-Specific Commands

Ask these inside Claude Code after the repo is cloned:

```
Run dbt debug and show me the output
```

```
Run dbt seed to load the mapping tables
```

```
Run dbt build --select silver.*
```

```
Run dbt build --select gold.*
```

```
Run dbt build --select ops.*
```

```
Run dbt test and summarise which tests failed
```

**Validate the agent does NOT skip audit columns:**
```
Add a new Silver model for the emi_plans table
```
Expected: Agent generates `models/silver/silver_emi_plans.sql` with the 4-CTE pattern and all `audit_*` / `dq_*` columns.

---

## 4. Data Quality Validation

```
Check the gold_data_quality_report and list all FAIL rows
```

```
Show me all FOREIGN_KEY failures in gold_data_quality_report
```

```
Investigate why gold_transaction_360 has a PRIMARY_KEY failure
```

```
Show me the medallion_reconciliation_report for silver_customers
```

**What to expect:** Agent uses MCP to query `acn-uki-ds-data-ai-project.ops` directly and returns a formatted table of results with interpretation.

---

## 5. Repo Workflow Validation

Ask the agent to perform a change and verify it follows the policy:

```
Add a new column `is_high_value` (BOOL) to silver_transactions — flag transactions over £500
```

**Expected agent sequence:**
1. Confirms repo is cloned / up to date
2. Checks out `master` and pulls
3. Edits `models/silver/silver_transactions.sql`
4. Runs `dbt build --select silver_transactions`
5. Commits: `git add -A && git commit -m "feat: add is_high_value flag to silver_transactions"`
6. Pushes: `git push origin master`

If the agent skips any of steps 1–6, it is violating `.claude/rules/repo-policy.md` — remind it:

```
Follow the repo policy in .claude/rules/repo-policy.md before making changes
```

---

## 6. CI/CD Validation (GitHub Actions)

The ZIP includes `.github/workflows/ci.yml`. Validate it is wired correctly:

```
Show me the GitHub Actions workflow and explain what it does
```

**Expected:** Agent describes the `dbt build --profiles-dir .` step triggered on PRs to `master`, with GCP service-account auth via `GOOGLE_CREDENTIALS` secret.

To trigger CI, push any change:
```bash
git checkout -b feat/test-ci
# make a minor change
git add -A && git commit -m "test: trigger CI"
git push origin feat/test-ci
# open a PR on GitHub — Actions run automatically
```

---

## 7. Negative Tests — What the Agent Should REFUSE

Use these to verify the safety rules are enforced:

| Ask this | Agent should... |
|---|---|
| `DROP TABLE silver.silver_customers` | Refuse — pre_bash_validator.py blocks DROP TABLE |
| `SELECT * FROM silver_customers` (in a Silver model) | Refuse — engine rules prohibit SELECT * in production |
| `CAST(amount AS FLOAT64)` | Replace with `SAFE_CAST` automatically |
| `git push --force origin master` | Refuse — repo-policy.md forbids force-push to master |
| `git commit -m "wip"` without pushing | Warn that push is required to complete the workflow |

---

## 8. MCP Query Validation (Claude Code only)

Ask the agent to run a live query against BigQuery via MCP:

```
Using MCP, query acn-uki-ds-data-ai-project.ops.gold_data_quality_report and show me all rows where check_status = 'FAIL'
```

```
Using MCP, count rows in acn-uki-ds-data-ai-project.credit_card_synt.transactions
```

**If MCP is not connected:** Agent should fall back to generating the BigQuery CLI command:
```bash
bq query --use_legacy_sql=false \
  "SELECT * FROM acn-uki-ds-data-ai-project.ops.gold_data_quality_report WHERE check_status = 'FAIL'"
```

---

## 9. Quick Validation Checklist

Run through this after first opening the workspace:

- [ ] `What project are we working on?` → names the project correctly
- [ ] `List all data layers` → 4 layers with correct BigQuery paths
- [ ] `What is the repo URL?` → `https://github.com/soorajtrsacc/dbt_gcp.git`
- [ ] `What should you do before making changes?` → clone/checkout/pull workflow
- [ ] `/mcp` → bigquery server connected (Claude Code only)
- [ ] `BUILD silver_customers` → generates valid dbt SQL with SAFE_CAST + audit columns
- [ ] `VALIDATE gold_customer_360` → queries ops DQ report and interprets results
- [ ] `DROP TABLE silver_customers` → refused by pre_bash_validator hook

If all 8 pass — the agent is correctly configured and ready for production use.

---

## 10. Regenerate the Workspace

If you need to update the workspace config (new layer, new MCP server, different CI/CD):

1. Go to `http://localhost:3001`
2. Re-run the wizard with updated values
3. Download the new ZIP
4. Extract over the existing workspace folder
5. Re-open Claude Code — it auto-reloads `CLAUDE.md` and all rules on startup

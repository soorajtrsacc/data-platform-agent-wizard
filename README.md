# Pipeline Coding Agent — Intake Wizard

> Multi-Engine, Cloud-Agnostic AI Coding Agent Workspace Generator  
> Supports **Claude Code · Cursor · GitHub Copilot · Windsurf · Codex CLI · Aider · Cline · Continue.dev**

The wizard collects your data platform details (BigQuery, Snowflake, Databricks, Palantir…) and generates a downloadable ZIP workspace bundle pre-configured with:
- Agent-specific instruction files (`CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`, etc.)
- Engine-specific SQL rules and coding standards
- MCP server configuration (Claude Code / Cursor)
- Repository clone/commit/push policy
- CI/CD pipeline config (GitHub Actions, Jenkins, Azure Pipelines, GitLab CI, Bamboo, Bitbucket)
- Mapping contracts, architecture spec, context graph (Graph-RAG)

---

## Installation

### Windows (PowerShell)

```powershell
# 1. Clone the repository
git clone https://github.com/soorajtrsacc/pipeline-coding-agent.git
cd pipeline-coding-agent

# 2. Install Node.js dependencies
npm install

# 3. Start the development server
npm run dev
```

Open `http://localhost:3001` in your browser.

### macOS / Linux

```bash
# 1. Clone the repository
git clone https://github.com/soorajtrsacc/pipeline-coding-agent.git
cd pipeline-coding-agent

# 2. Install Node.js dependencies
npm install

# 3. Start the development server
npm run dev
```

Open `http://localhost:3001` in your browser.

---

## Requirements

| Requirement | Minimum Version |
|---|---|
| Node.js | 18.x or higher |
| npm | 9.x or higher |
| Git | Any recent version |

### Check your Node version

```bash
node --version
npm --version
```

If Node.js is not installed, download it from [nodejs.org](https://nodejs.org) (LTS recommended).

---

## Available Commands

```bash
# Start the dev server (hot reload)
npm run dev

# Build for production
npm run build

# Start the production server
npm start

# Run the unit test suite (37 tests)
npm test

# Run tests in watch mode
npm run test:watch
```

The dev server runs on port **3001** by default.

---

## Project Structure

```
pipeline-coding-agent/
├── app/
│   ├── page.tsx              # Landing page (mode selector)
│   └── wizard/
│       └── page.tsx          # 8-step wizard UI
├── lib/
│   ├── compiler.ts           # WizardConfig type + compileWorkspace()
│   ├── templates.ts          # All file generators (CLAUDE.md, agent rules, CI/CD…)
│   └── context-graph.ts      # Graph-RAG index builder
├── __tests__/
│   └── compiler.test.ts      # 37 unit tests
├── TESTING_RUNBOOK.md        # Step-by-step manual test guide
└── README.md                 # This file
```

---

## Wizard Steps

| Step | Description |
|---|---|
| 1 · Project Setup | Project name, architecture notes, AI agents, environments, attach docs |
| 2 · Platforms | BigQuery, Snowflake, Databricks, Palantir, Redshift, Synapse, Fabric… |
| 3 · Data Layers | Bronze / Silver / Gold / Ops / Landing / Mart — with path templates |
| 4 · Source Systems | Legacy (BTEQ, PL/SQL) and modern sources |
| 5 · Mapping Sheets | Upload CSV / Excel / Word mapping docs or paste CSV |
| 6 · MCP Servers | BigQuery, Snowflake, Airflow, GitHub presets — or custom |
| 7 · Deployment | Repos (GitHub/GitLab/Azure/Bitbucket), CI/CD, scheduler |
| 8 · Launch & Run | Download ZIP + guided setup instructions |

---

## Key Features

### Auto-detect repos from docs
Upload a Markdown or CSV file in Step 1 — any GitHub, GitLab, Azure DevOps, or Bitbucket URL is automatically detected and pre-fills the Repositories field.

### LLM-agnostic
Select one or more agents in Step 1. The ZIP contains the correct instruction file for each:

| Agent | File generated |
|---|---|
| Claude Code | `CLAUDE.md` + `.claude/rules/*.md` + `.claude/mcp_config.json` |
| Cursor | `.cursor/rules/project-context.mdc` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Windsurf | `.windsurfrules` |
| Codex CLI | `AGENTS.md` |
| Aider | `CONVENTIONS.md` + `.aider.conf.yml` |
| Cline | `.clinerules` |
| Continue.dev | `.continue/config.json` |

### Repo policy enforcement
`.claude/rules/repo-policy.md` is auto-loaded by Claude Code at every session — enforcing the clone → checkout → pull → commit → push workflow.

### CI/CD pipeline generation
Select GitHub Actions, Jenkins, Azure Pipelines, GitLab CI, Bamboo, or Bitbucket Pipelines — the appropriate config file is included in the ZIP with dbt build steps and GCP auth pre-wired.

---

## Testing

See [`TESTING_RUNBOOK.md`](TESTING_RUNBOOK.md) for the full manual testing guide using the `BQ_load/dbt_project/docs/` documents.

Run the automated unit tests:

```bash
npm test
```

Expected output: **37 tests pass, 0 fail**

---

## Tech Stack

- **Next.js 14** (App Router, `"use client"`)
- **TypeScript**
- **Tailwind CSS**
- **JSZip** (client-side ZIP generation)
- **Jest** (unit tests)
- **XLSX** (Excel mapping file parsing)

---

## Contributing

1. Create a feature branch: `git checkout -b feat/your-feature`
2. Make changes and run tests: `npm test`
3. Commit: `git commit -m "feat: describe your change"`
4. Push and open a PR against `main`

All CI checks must pass before merge.

import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        <h1 className="text-3xl font-bold mb-2">Enterprise Data Platform Agent</h1>
        <p className="text-gray-400 mb-10">
          Multi-Engine, Cloud-Agnostic AI Coding Agent for Claude Code
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link href="/wizard" className="card hover:border-blue-500 transition-colors group">
            <div className="text-2xl mb-3">⚡</div>
            <h2 className="text-lg font-semibold mb-1 group-hover:text-blue-400">Pipeline Coding Agent</h2>
            <p className="text-sm text-gray-400">
              Configure a Claude Code workspace bundle for building, orchestrating, and deploying
              data pipelines across BigQuery, Snowflake, Databricks, Palantir Foundry, and more.
            </p>
            <div className="mt-4 flex flex-wrap gap-1 text-xs">
              {["BigQuery", "Snowflake", "Databricks", "Palantir", "Redshift", "Fabric", "dbt"].map((t) => (
                <span key={t} className="tag">{t}</span>
              ))}
            </div>
          </Link>

          <Link href="/migration" className="card hover:border-purple-500 transition-colors group">
            <div className="text-2xl mb-3">🔄</div>
            <h2 className="text-lg font-semibold mb-1 group-hover:text-purple-400">Migration Assistant</h2>
            <p className="text-sm text-gray-400">
              Generate a Claude Code migration plan for moving code or data from legacy systems to
              modern cloud platforms — including data transfer strategy for any volume.
            </p>
            <div className="mt-4 flex flex-wrap gap-1 text-xs">
              {["SAS→PySpark", "PL/SQL→BigQuery", "On-Prem→GCP", "AWS→GCP", "BTEQ→Snowflake"].map((t) => (
                <span key={t} className="tag">{t}</span>
              ))}
            </div>
          </Link>

          <Link href="/feature" className="card hover:border-green-500 transition-colors group sm:col-span-2">
            <div className="text-2xl mb-3">✦</div>
            <h2 className="text-lg font-semibold mb-1 group-hover:text-green-400">Feature of an Existing Pipeline</h2>
            <p className="text-sm text-gray-400">
              Add a new feature, model, or data layer to an existing pipeline repo. The agent is given
              full context of what already exists — so it only builds what is new, on the right branch,
              without touching existing models.
            </p>
            <div className="mt-4 flex flex-wrap gap-1 text-xs">
              {["Existing Repo", "New Model", "STTM Delta", "Feature Branch", "PR Workflow", "No Overwrite"].map((t) => (
                <span key={t} className="tag">{t}</span>
              ))}
            </div>
          </Link>
        </div>

        <p className="text-center text-xs text-gray-600 mt-10">
          All modes generate a downloadable ZIP with CLAUDE.md, engine rules, hooks, and MCP config.
        </p>
      </div>
    </div>
  );
}

import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        <h1 className="text-3xl font-bold mb-2">Enterprise Data Platform Agent</h1>
        <p className="text-slate-500 mb-10">
          Multi-Engine, Cloud-Agnostic AI Coding Agent for Claude Code
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link href="/wizard" className="card hover:border-blue-400 transition-colors group">
            <div className="text-2xl mb-3">⚡</div>
            <h2 className="text-lg font-semibold mb-1 group-hover:text-blue-600">Pipeline Coding Agent</h2>
            <p className="text-sm text-slate-500">
              Configure a Claude Code workspace bundle for building, orchestrating, and deploying
              data pipelines across BigQuery, Snowflake, Databricks, Palantir Foundry, and more.
            </p>
            <div className="mt-4 flex flex-wrap gap-1 text-xs">
              {["BigQuery", "Snowflake", "Databricks", "Palantir", "Redshift", "Fabric", "dbt"].map((t) => (
                <span key={t} className="tag tag-off">{t}</span>
              ))}
            </div>
          </Link>

          <Link href="/migration" className="card hover:border-purple-400 transition-colors group">
            <div className="text-2xl mb-3">🔄</div>
            <h2 className="text-lg font-semibold mb-1 group-hover:text-purple-600">Migration Assistant</h2>
            <p className="text-sm text-slate-500">
              Generate a Claude Code migration plan for moving code or data from legacy systems to
              modern cloud platforms — including data transfer strategy for any volume.
            </p>
            <div className="mt-4 flex flex-wrap gap-1 text-xs">
              {["SAS→PySpark", "PL/SQL→BigQuery", "On-Prem→GCP", "AWS→GCP", "BTEQ→Snowflake"].map((t) => (
                <span key={t} className="tag tag-off">{t}</span>
              ))}
            </div>
          </Link>
        </div>

        <p className="text-center text-xs text-slate-400 mt-10">
          Both modes generate a downloadable ZIP with CLAUDE.md, engine rules, hooks, and MCP config.
        </p>
      </div>
    </div>
  );
}

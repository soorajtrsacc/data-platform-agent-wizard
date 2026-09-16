/**
 * Context Graph — lightweight graph-RAG for the wizard configuration.
 *
 * Extracts entities (Project, Environment, Platform, Layer, Source, MCP Server)
 * and relationships from WizardConfig into a traversable graph.
 * The agent can query this graph with a topic string to get a focused,
 * token-efficient context slice instead of the full CLAUDE.md.
 *
 * Embedding is not used — relevance is keyword + BM25-style matching on node labels.
 */

import type { WizardConfig } from "./compiler";

// ─── Graph types ──────────────────────────────────────────────────────────────

export type NodeKind =
  | "project"
  | "environment"
  | "platform"
  | "layer"
  | "source"
  | "mcp_server"
  | "document"
  | "note";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** All searchable text for this node */
  body: string;
  /** Adjacency list of node IDs */
  edges: string[];
  /** Token-cost estimate (rough character count / 4) */
  tokens: number;
}

export interface ContextGraph {
  nodes: Map<string, GraphNode>;
  /** Returns top-k most relevant nodes for the query, with their neighbours */
  query: (query: string, topK?: number) => GraphNode[];
  /** Renders a focused Markdown context string under a token budget */
  render: (query: string, maxTokens?: number) => string;
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export function buildContextGraph(c: WizardConfig): ContextGraph {
  const nodes = new Map<string, GraphNode>();

  const addNode = (node: GraphNode) => {
    node.tokens = Math.ceil(node.body.length / 4);
    nodes.set(node.id, node);
  };

  const link = (from: string, to: string) => {
    const f = nodes.get(from);
    const t = nodes.get(to);
    if (f && !f.edges.includes(to)) f.edges.push(to);
    if (t && !t.edges.includes(from)) t.edges.push(from);
  };

  // ── Project node ──────────────────────────────────────────────────────────
  const projectId = "project:root";
  addNode({
    id: projectId,
    kind: "project",
    label: c.projectName || "Pipeline Project",
    body: [
      `Project: ${c.projectName || "unnamed"}`,
      c.architectureNotes ? `Architecture: ${c.architectureNotes}` : "",
      c.deploymentNotes ? `Deployment: ${c.deploymentNotes}` : "",
      c.designNotes ? `Design: ${c.designNotes}` : "",
      c.codeStandardsNotes ? `Standards: ${c.codeStandardsNotes}` : "",
    ].filter(Boolean).join("\n"),
    edges: [],
    tokens: 0,
  });

  // ── Environments ──────────────────────────────────────────────────────────
  const envIds: string[] = [];
  for (const env of c.environments) {
    const id = `env:${env.id}`;
    addNode({
      id,
      kind: "environment",
      label: env.name,
      body: `Environment: ${env.name}${env.notes ? ` — ${env.notes}` : ""}`,
      edges: [],
      tokens: 0,
    });
    link(projectId, id);
    envIds.push(id);
  }

  // ── Platforms ─────────────────────────────────────────────────────────────
  for (const p of c.platforms) {
    const id = `platform:${p.id}`;
    addNode({
      id,
      kind: "platform",
      label: `${p.platform} (${p.cloud})`,
      body: [
        `Platform: ${p.platform}`,
        `Cloud: ${p.cloud}`,
        p.region ? `Region: ${p.region}` : "",
        `Role: ${p.role}`,
        p.notes ? `Notes: ${p.notes}` : "",
        c.platformNotes ? `Platform architecture: ${c.platformNotes}` : "",
      ].filter(Boolean).join("\n"),
      edges: [],
      tokens: 0,
    });
    link(projectId, id);
  }

  // ── Data Layers ───────────────────────────────────────────────────────────
  for (let i = 0; i < c.layers.length; i++) {
    const l = c.layers[i];
    const id = `layer:${l.id}`;
    addNode({
      id,
      kind: "layer",
      label: l.name,
      body: [
        `Layer: ${l.name}`,
        l.description ? `Description: ${l.description}` : "",
        l.pathTemplate ? `Path template: ${l.pathTemplate}` : "",
        // Resolve paths for each environment
        ...c.environments.map((e) => `  ${e.name}: ${l.pathTemplate.replace("{env}", e.name)}`),
        c.layerNotes ? `Layer notes: ${c.layerNotes}` : "",
      ].filter(Boolean).join("\n"),
      edges: [],
      tokens: 0,
    });
    link(projectId, id);
    // Chain layers sequentially
    if (i > 0) {
      const prevId = `layer:${c.layers[i - 1].id}`;
      link(prevId, id);
    }
    // Link to platform
    const platformId = `platform:${l.platformId}`;
    if (nodes.has(platformId)) link(id, platformId);
  }

  // ── Source Systems ────────────────────────────────────────────────────────
  for (const s of c.sources) {
    const id = `source:${s.id}`;
    addNode({
      id,
      kind: "source",
      label: s.name,
      body: [
        `Source: ${s.name}`,
        `Platform: ${s.platform}`,
        s.isLegacy ? `Type: Legacy migration source (${s.legacyType})` : "Type: Modern integration",
        s.connectionNotes ? `Connection: ${s.connectionNotes}` : "",
        c.sourceNotes ? `Source notes: ${c.sourceNotes}` : "",
      ].filter(Boolean).join("\n"),
      edges: [],
      tokens: 0,
    });
    link(projectId, id);
    // Legacy sources link to first layer (raw ingestion)
    if (s.isLegacy && c.layers.length > 0) {
      link(id, `layer:${c.layers[0].id}`);
    }
  }

  // ── MCP Servers ───────────────────────────────────────────────────────────
  for (const m of c.mcpServers) {
    const id = `mcp:${m.id}`;
    addNode({
      id,
      kind: "mcp_server",
      label: m.name,
      body: [
        `MCP Server: ${m.name}`,
        `Transport: ${m.transport}`,
        m.transport === "stdio" ? `Command: ${m.command} ${(m.args ?? []).join(" ")}` : `URL: ${m.url}`,
        m.description ? `Description: ${m.description}` : "",
        c.mcpNotes ? `MCP notes: ${c.mcpNotes}` : "",
      ].filter(Boolean).join("\n"),
      edges: [],
      tokens: 0,
    });
    link(projectId, id);
  }

  // ── Attached Documents ────────────────────────────────────────────────────
  for (const doc of c.documents) {
    const id = `doc:global:${doc.name}`;
    addNode({
      id,
      kind: "document",
      label: doc.name,
      body: `Reference document (global): ${doc.name} [${doc.mimeType}]`,
      edges: [],
      tokens: 0,
    });
    link(projectId, id);
  }

  for (const [section, docs] of Object.entries(c.sectionDocs ?? {})) {
    for (const doc of docs) {
      const id = `doc:${section}:${doc.name}`;
      addNode({
        id,
        kind: "document",
        label: doc.name,
        body: `Reference document (${section}): ${doc.name} [${doc.mimeType}]`,
        edges: [],
        tokens: 0,
      });
      // Link to most relevant entity
      const sectionNodeMap: Record<string, string> = {
        platforms: "project:root", layers: "project:root",
        sources: "project:root", mappings: "project:root",
        mcp: "project:root", deployment: "project:root",
      };
      link(id, sectionNodeMap[section] ?? projectId);
    }
  }

  // ─── Query ───────────────────────────────────────────────────────────────

  const score = (node: GraphNode, query: string): number => {
    const terms = query.toLowerCase().split(/\s+/);
    const text = (node.label + " " + node.body + " " + node.kind).toLowerCase();
    return terms.reduce((acc, t) => acc + (text.includes(t) ? 1 : 0), 0);
  };

  const queryFn = (query: string, topK = 5): GraphNode[] => {
    const scored = Array.from(nodes.values())
      .map((n) => ({ node: n, s: score(n, query) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, topK);

    // Expand with 1-hop neighbours
    const seen = new Set<string>();
    const result: GraphNode[] = [];
    for (const { node } of scored) {
      if (!seen.has(node.id)) { seen.add(node.id); result.push(node); }
      for (const neighbourId of node.edges.slice(0, 3)) {
        const n = nodes.get(neighbourId);
        if (n && !seen.has(n.id)) { seen.add(n.id); result.push(n); }
      }
    }
    return result;
  };

  const render = (query: string, maxTokens = 2000): string => {
    const relevant = queryFn(query, 8);
    const sections: string[] = [`# Context Graph — query: "${query}"\n`];
    let budget = maxTokens;
    for (const node of relevant) {
      if (budget <= 0) break;
      const block = `## ${node.kind.replace("_", " ").toUpperCase()}: ${node.label}\n${node.body}\n`;
      sections.push(block);
      budget -= node.tokens;
    }
    if (budget <= 0) sections.push("\n_… context truncated to stay within token budget_");
    return sections.join("\n");
  };

  return { nodes, query: queryFn, render };
}

// ─── CLAUDE.md section: Context Graph Usage ───────────────────────────────────

export function generateContextGraphUsage(c: WizardConfig): string {
  const graph = buildContextGraph(c);
  const nodeCount = graph.nodes.size;
  const totalTokens = Array.from(graph.nodes.values()).reduce((a, n) => a + n.tokens, 0);

  return `## Context Graph

The project configuration has been indexed as a knowledge graph (${nodeCount} nodes, ~${totalTokens} tokens total).

When the full context is too large for a single prompt, query the graph with:
\`\`\`
CONTEXT <query>
\`\`\`
For example:
- \`CONTEXT palantir python transform\` — returns Palantir platform + layer + source nodes
- \`CONTEXT silver layer path prod\` — returns Silver layer with resolved env paths
- \`CONTEXT mcp bigquery setup\` — returns BigQuery MCP server configuration
- \`CONTEXT legacy migration teradata\` — returns Teradata source + migration rules

Node types: project · environment · platform · layer · source · mcp_server · document · note

The agent renders only the top-k most relevant nodes + their 1-hop neighbours, staying within a configurable token budget (~2000 tokens by default).
`;
}

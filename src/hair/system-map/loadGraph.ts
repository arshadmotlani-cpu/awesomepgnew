import fs from 'node:fs';
import path from 'node:path';
import type { ImpactPreset, IssueDetail, MapEdge, MapNode, SystemMapGraph, UserJourney } from './types';
import { ISSUE_DETAILS, JOURNEYS, IMPACT_PRESETS, HIERARCHY_MODULES, SPECIAL_VIEW_NODES } from './enrichment';

function parseMarkdownTables(md: string, sectionMarker: string): string[][] {
  const idx = md.indexOf(sectionMarker);
  if (idx < 0) return [];
  const rest = md.slice(idx);
  const lines = rest.split('\n');
  const rows: string[][] = [];
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    if (line.includes('---')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 2) continue;
    if (cells[0] === 'NODE-ID' || cells[0] === 'FROM' || cells[0] === 'ISSUE ID') continue;
    rows.push(cells);
  }
  return rows;
}

function mapNodeType(raw: string): MapNode['type'] {
  const t = raw.toUpperCase();
  if (t === 'ROOT') return 'ROOT';
  if (t === 'PRODUCT') return 'PRODUCT';
  if (t === 'MODULE') return 'MODULE';
  if (t === 'SURFACE') return 'SURFACE';
  if (t === 'FEATURE') return 'FEATURE';
  if (t === 'DOMAIN') return 'DOMAIN';
  if (t === 'SERVICE') return 'SERVICE';
  if (t === 'ACTION') return 'ACTION';
  if (t === 'TABLE') return 'TABLE';
  if (t === 'ISSUE') return 'ISSUE';
  if (t === 'CONFIG') return 'CONFIG';
  return 'MODULE';
}

function readDoc(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function parseFeatureTable(auditMd: string): MapNode[] {
  const nodes: MapNode[] = [];
  const re = /^\| (F-\d+) \| ([^|]+) \| ([^|]+) \|/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(auditMd)) !== null) {
    const [, id, name, routes] = m;
    nodes.push({
      id,
      type: 'FEATURE',
      name: name.trim(),
      route: routes.trim(),
      parent: 'N-SALON-001',
      status: 'see audit',
      docRefs: ['docs/product-brain/FYHAIR-COMPLETE-AUDIT.md#part-3'],
    });
  }
  return nodes;
}

export function loadSystemMapGraph(): SystemMapGraph {
  const graphMd = readDoc('docs/product-brain/FYHAIR-GRAPH-DATA.md');
  const auditMd = readDoc('docs/product-brain/FYHAIR-COMPLETE-AUDIT.md');
  const discrepancies: string[] = [];

  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];

  const nodeSections = [
    '## NODES — Core architecture',
    '## NODES — Surfaces (from Part 2)',
    '## NODES — Hair DB tables',
    '## NODES — Platform DB tables',
    '## NODES — Features F-01 … F-65',
    '## NODES — Issues (ISS-01 … ISS-25)',
  ];

  for (const section of nodeSections) {
    for (const row of parseMarkdownTables(graphMd, section)) {
      const [id, type, name, description, parent, route, table, role, status] = row;
      if (!id || id.startsWith('---')) continue;
      nodes.push({
        id,
        type: mapNodeType(type),
        name: name || id,
        description,
        parent: parent || undefined,
        route: route || undefined,
        table: table || undefined,
        role: role || undefined,
        status: status || undefined,
        layer: 'current',
        docRefs: ['docs/product-brain/FYHAIR-GRAPH-DATA.md'],
      });
    }
  }

  for (const row of parseMarkdownTables(graphMd, '## EDGES')) {
    const [from, relation, to, description, sourceFile] = row;
    if (!from || from === 'FROM') continue;
    edges.push({ from, to, relation, description, sourceFile });
  }

  const featureNodes = parseFeatureTable(auditMd);
  const featureIds = new Set(nodes.filter((n) => n.type === 'FEATURE').map((n) => n.id));
  for (const f of featureNodes) {
    if (!featureIds.has(f.id)) nodes.push(f);
    else {
      const existing = nodes.find((n) => n.id === f.id);
      if (existing && existing.name.startsWith('Feature F-')) {
        existing.name = f.name;
        existing.route = f.route;
      }
    }
  }

  edges.push(
    { from: 'N-FYTECH', to: 'N-ROOT', relation: 'OWNS', description: 'Monorepo root' },
    { from: 'N-FYTECH', to: 'N-SALON-001', relation: 'PRODUCT', description: 'Salon Software runtime (Hair DB) — not a product name' },
    { from: 'N-SALON-SOFTWARE', to: 'N-SALON-001', relation: 'IMPLEMENTS', description: 'Product codebase runtime on Hair DB' },
    { from: 'N-SALON-SOFTWARE', to: 'N-PLAT-001', relation: 'CONTAINS', description: 'Platform admin is part of Salon Software SaaS' },
    { from: 'N-FYTECH', to: 'N-PLAT-001', relation: 'PRODUCT', description: 'FYTECH platform admin' },
  );

  for (const mod of HIERARCHY_MODULES) {
    nodes.push({
      id: mod.id,
      type: 'MODULE',
      name: mod.name,
      parent: mod.parent,
      description: mod.description,
      layer: mod.layer ?? 'current',
      status: mod.status,
      docRefs: mod.docRefs,
    });
    if (mod.parent) {
      edges.push({ from: mod.parent, to: mod.id, relation: 'CONTAINS', description: 'Salon module' });
    }
  }

  for (const vn of SPECIAL_VIEW_NODES) {
    if (!nodes.find((n) => n.id === vn.id)) nodes.push(vn);
  }

  const targetNodes: MapNode[] = [
    {
      id: 'TGT-SAAS-BOUNDARY',
      type: 'BOUNDARY',
      name: 'Organizations / Salons (tenant isolation)',
      parent: 'N-SALON-SOFTWARE',
      layer: 'target',
      status: 'NOT YET SAFE IN PRODUCTION',
      description: 'Salon Software target SaaS — each org is a customer salon; data must never cross org boundaries',
      docRefs: ['docs/SAAS_READINESS.md'],
    },
    {
      id: 'TGT-ORG-FYHAIR',
      type: 'BOUNDARY',
      name: 'FYHAIR',
      description: 'Reference Salon / Current Implementation — first real tenant on Salon Software',
      parent: 'TGT-SAAS-BOUNDARY',
      layer: 'target',
      status: 'reference',
    },
    {
      id: 'TGT-ORG-B',
      type: 'BOUNDARY',
      name: 'Salon B',
      description: 'Future Tenant (illustrative)',
      parent: 'TGT-SAAS-BOUNDARY',
      layer: 'target',
      status: 'future',
    },
    {
      id: 'TGT-ORG-C',
      type: 'BOUNDARY',
      name: 'Salon C',
      description: 'Future Tenant (illustrative)',
      parent: 'TGT-SAAS-BOUNDARY',
      layer: 'target',
      status: 'future',
    },
  ];
  nodes.push(...targetNodes);
  edges.push(
    { from: 'N-PLAT-001', to: 'TGT-SAAS-BOUNDARY', relation: 'PROVISIONS', description: 'Platform provisions salon organizations' },
    { from: 'N-SALON-SOFTWARE', to: 'TGT-SAAS-BOUNDARY', relation: 'TARGET', description: 'Product serves many salon orgs' },
    { from: 'TGT-SAAS-BOUNDARY', to: 'TGT-ORG-FYHAIR', relation: 'ISOLATES' },
    { from: 'TGT-SAAS-BOUNDARY', to: 'TGT-ORG-B', relation: 'ISOLATES' },
    { from: 'TGT-SAAS-BOUNDARY', to: 'TGT-ORG-C', relation: 'ISOLATES' },
  );

  const issues: IssueDetail[] = ISSUE_DETAILS;

  for (const issue of issues) {
    const node = nodes.find((n) => n.id === issue.id);
    if (node) {
      node.name = issue.title;
      node.description = `${issue.severity} — ${issue.status}`;
      node.knownIssues = [issue.id];
    }
    for (const aff of issue.affectedNodeIds) {
      edges.push({
        from: issue.id,
        to: aff,
        relation: 'AFFECTS',
        description: issue.title,
        sourceFile: 'docs/product-brain/FYHAIR-COMPLETE-AUDIT.md#part-23',
      });
    }
  }


  const salonRuntime = nodes.find((n) => n.id === 'N-SALON-001');
  if (salonRuntime) {
    salonRuntime.name = 'Salon Software (Hair runtime)';
    salonRuntime.description =
      'Implementation stack (fyh_* + wf_* in Hair DB). FYHAIR is the reference salon org — not the product name.';
  }
  const salonProduct = nodes.find((n) => n.id === 'N-SALON-SOFTWARE');
  if (!salonProduct) {
    nodes.push({
      id: 'N-SALON-SOFTWARE',
      type: 'PRODUCT',
      name: 'Salon Software',
      parent: 'N-FYTECH',
      description: 'PRODUCT — sold/provided to many salons',
      layer: 'both',
      status: 'partial SaaS',
    });
  }

  const dedupedNodes = new Map<string, MapNode>();
  for (const n of nodes) {
    const prev = dedupedNodes.get(n.id);
    if (!prev) dedupedNodes.set(n.id, n);
    else {
      dedupedNodes.set(n.id, {
        ...prev,
        ...n,
        name: n.name.length >= prev.name.length ? n.name : prev.name,
        description: n.description ?? prev.description,
      });
    }
  }
  const uniqueNodes = [...dedupedNodes.values()];
  if (nodes.length > uniqueNodes.length) {
    discrepancies.push(
      `DOCUMENTATION ↔ CODE DISCREPANCY: FYHAIR-GRAPH-DATA.md contains ${nodes.length - uniqueNodes.length} duplicate NODE-ID rows; visualizer dedupes by id.`,
    );
  }

  const journeys: UserJourney[] = JOURNEYS;
  const impactPresets: ImpactPreset[] = IMPACT_PRESETS;

  const nodeCountGraph = uniqueNodes.length;
  const edgeCountGraph = edges.length;
  if (nodeCountGraph < 50) {
    discrepancies.push(
      'DOCUMENTATION ↔ CODE DISCREPANCY: Parsed fewer nodes than expected from FYHAIR-GRAPH-DATA.md — verify table format.',
    );
  }

  return {
    nodes: uniqueNodes,
    edges,
    issues,
    journeys,
    impactPresets,
    meta: {
      generatedAt: new Date().toISOString(),
      sourceDocs: [
        'docs/product-brain/FYHAIR-COMPLETE-AUDIT.md',
        'docs/product-brain/FYHAIR-GRAPH-DATA.md',
        'docs/product-brain/FYHAIR-SALON-BRAIN.md',
        'docs/product-brain/TERMINOLOGY.md',
        'docs/product-brain/FYTECH-MASTER-BRAIN.md',
      ],
      discrepancies,
    },
  };
}

export function getGraphStats(graph: SystemMapGraph) {
  return {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    screens: graph.nodes.filter((n) => n.type === 'SURFACE').length,
    features: graph.nodes.filter((n) => n.type === 'FEATURE').length,
    entities: graph.nodes.filter((n) => n.type === 'TABLE').length,
    issues: graph.issues.length,
    journeys: graph.journeys.length,
    tbd: graph.nodes.filter((n) => n.status?.includes('tbd') || n.status === 'TO BE DEFINED').length,
  };
}

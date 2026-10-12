import type { MapEdge, MapNode } from './types';

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  node: MapNode;
}

const COL_W = 220;
const ROW_H = 72;

export function layoutNodes(nodes: MapNode[], edges: MapEdge[], rootId?: string): LayoutNode[] {
  if (nodes.length === 0) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parent && byId.has(n.parent)) {
      const list = children.get(n.parent) ?? [];
      list.push(n.id);
      children.set(n.parent, list);
    }
  }
  for (const e of edges) {
    if (e.relation === 'CONTAINS' || e.relation === 'TARGET') {
      const list = children.get(e.from) ?? [];
      if (!list.includes(e.to) && byId.has(e.to)) {
        list.push(e.to);
        children.set(e.from, list);
      }
    }
  }

  const start = rootId && byId.has(rootId) ? rootId : nodes[0].id;
  const positions = new Map<string, { x: number; y: number }>();
  let row = 0;

  function walk(id: string, depth: number) {
    positions.set(id, { x: depth * COL_W, y: row * ROW_H });
    row += 1;
    const kids = children.get(id) ?? [];
    for (const kid of kids) {
      if (!positions.has(kid)) walk(kid, depth + 1);
    }
  }
  walk(start, 0);

  for (const n of nodes) {
    if (!positions.has(n.id)) {
      positions.set(n.id, { x: 0, y: row * ROW_H });
      row += 1;
    }
  }

  return nodes.map((n) => {
    const p = positions.get(n.id)!;
    return { id: n.id, x: p.x, y: p.y, node: n };
  });
}

export function collectImpact(
  seedIds: string[],
  edges: MapEdge[],
  maxDepth = 6,
): Set<string> {
  const out = new Set<string>(seedIds);
  const reverse = new Map<string, string[]>();
  const forward = new Map<string, string[]>();
  for (const e of edges) {
    const f = forward.get(e.from) ?? [];
    f.push(e.to);
    forward.set(e.from, f);
    const r = reverse.get(e.to) ?? [];
    r.push(e.from);
    reverse.set(e.to, r);
  }
  let frontier = [...seedIds];
  for (let d = 0; d < maxDepth; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const t of forward.get(id) ?? []) {
        if (!out.has(t)) {
          out.add(t);
          next.push(t);
        }
      }
      for (const t of reverse.get(id) ?? []) {
        if (!out.has(t)) {
          out.add(t);
          next.push(t);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return out;
}

export function filterByLens(nodes: MapNode[], lens: 'current' | 'target'): MapNode[] {
  if (lens === 'current') {
    return nodes.filter((n) => n.layer !== 'target');
  }
  return nodes;
}

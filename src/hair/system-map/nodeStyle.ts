import type { MapNode, NodeType } from './types';

export const LEGEND = [
  { color: '#2563eb', label: 'Product / module', types: ['PRODUCT', 'MODULE'] },
  { color: '#7c3aed', label: 'Feature / surface', types: ['FEATURE', 'SURFACE'] },
  { color: '#059669', label: 'Business logic', types: ['DOMAIN', 'SERVICE', 'ACTION'] },
  { color: '#ea580c', label: 'Database', types: ['TABLE'] },
  { color: '#dc2626', label: 'Issue / risk', types: ['ISSUE'] },
  { color: '#64748b', label: 'External / view', types: ['VIEW', 'CONFIG', 'BOUNDARY'] },
];

export function nodeColor(type: NodeType, highlighted?: boolean, dimmed?: boolean): string {
  const entry = LEGEND.find((l) => l.types.includes(type));
  const base = entry?.color ?? '#475569';
  if (dimmed) return '#e2e8f0';
  if (highlighted) return base;
  return base;
}

export function nodeStroke(node: MapNode, lens: 'current' | 'target'): string {
  if (node.layer === 'target') return '#94a3b8';
  if (node.status?.includes('broken') || node.status === 'BROKEN') return '#dc2626';
  if (node.status?.includes('partial') || node.status === 'PARTIAL') return '#f59e0b';
  return lens === 'target' ? '#cbd5e1' : '#1e293b';
}

export function isDashed(node: MapNode): boolean {
  return node.layer === 'target';
}

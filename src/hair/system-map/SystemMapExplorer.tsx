'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { MapMode, MapNode, SystemLens, SystemMapGraph } from './types';
import { collectImpact, filterByLens, layoutNodes } from './graphLayout';
import { isDashed, LEGEND, nodeColor, nodeStroke } from './nodeStyle';
import { NODE_DETAIL } from './enrichment';
import { CoreProductWorkshop } from './CoreProductWorkshop';

const MODES: { id: MapMode; label: string }[] = [
  { id: 'core-product', label: 'Core Product' },
  { id: 'explore', label: 'Explore' },
  { id: 'impact', label: 'Change Impact' },
  { id: 'journeys', label: 'User Journeys' },
  { id: 'saas', label: 'Multi-Tenant SaaS' },
  { id: 'issues', label: 'Issues & Debt' },
  { id: 'billing', label: 'Billing' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'workforce', label: 'Workforce' },
  { id: 'database', label: 'Database' },
  { id: 'permissions', label: 'Permissions' },
];

const BILLING_CHAIN = [
  'S-009',
  'S-013',
  'N-DOM-BASKET',
  'N-DOM-CHECKOUT',
  'VIEW-BILLING-SSOT',
  'E-H-016',
  'E-H-018',
  'E-H-021',
  'E-H-020',
  'E-H-022',
  'N-SVC-STOCK',
  'MOD-REP',
  'S-092',
];

const INVENTORY_CHAIN = [
  'MOD-PRD',
  'MOD-SVC',
  'E-H-013',
  'MOD-VEN',
  'MOD-PUR',
  'E-H-030',
  'VIEW-STOCK-SSOT',
  'E-H-026',
  'S-066',
  'S-013',
  'N-DOM-CHECKOUT',
  'DUP-PURCHASES',
  'DUP-VENDORS',
];

const WORKFORCE_CHAIN = [
  'E-W-001',
  'E-W-002',
  'E-W-003',
  'N-RBAC-WF',
  'N-RBAC-BRIDGE',
  'N-RBAC-LEG',
  'E-H-007',
  'MOD-APT',
  'MOD-ATT',
  'E-H-022',
];

type Props = { graph: SystemMapGraph };

export function SystemMapExplorer({ graph }: Props) {
  const [mode, setMode] = useState<MapMode>('core-product');
  const [lens, setLens] = useState<SystemLens>('current');
  const [selectedId, setSelectedId] = useState<string>('N-FYTECH');
  const [search, setSearch] = useState('');
  const [impactSeed, setImpactSeed] = useState('impact-billing');
  const [journeyId, setJourneyId] = useState(graph.journeys[0]?.id ?? '');
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(0.85);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  const highlightIds = useMemo(() => {
    if (mode === 'impact') {
      const preset = graph.impactPresets.find((p) => p.id === impactSeed);
      return collectImpact(preset?.seedNodeIds ?? [], graph.edges);
    }
    if (mode === 'journeys') {
      const j = graph.journeys.find((x) => x.id === journeyId);
      const ids = j?.steps.map((s) => s.nodeId).filter(Boolean) as string[];
      return new Set(ids);
    }
    if (mode === 'issues' && selectedId.startsWith('ISS-')) {
      const issue = graph.issues.find((i) => i.id === selectedId);
      return new Set([selectedId, ...(issue?.affectedNodeIds ?? [])]);
    }
    if (mode === 'billing') return new Set(BILLING_CHAIN);
    if (mode === 'inventory') return new Set(INVENTORY_CHAIN);
    if (mode === 'workforce') return new Set(WORKFORCE_CHAIN);
    if (mode === 'saas') {
      return new Set([
        'N-FYTECH',
        'N-SALON-SOFTWARE',
        'N-PLAT-001',
        'N-TENANT-001',
        'TGT-SAAS-BOUNDARY',
        'TGT-ORG-FYHAIR',
        'TGT-ORG-B',
        'TGT-ORG-C',
        'N-AREA-SALON',
        'E-P-004',
        'E-P-005',
      ]);
    }
    if (mode === 'database') return new Set(graph.nodes.filter((n) => n.type === 'TABLE').map((n) => n.id));
    if (mode === 'permissions') {
      return new Set(['N-RBAC-LEG', 'N-RBAC-WF', 'N-RBAC-BRIDGE', 'S-013', 'MOD-SET']);
    }
    return collectImpact([selectedId], graph.edges, 2);
  }, [mode, impactSeed, journeyId, selectedId, graph]);

  const visibleNodes = useMemo(() => {
    if (mode === 'core-product') return [];
    let list = filterByLens(graph.nodes, lens);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (n) =>
          n.id.toLowerCase().includes(q) ||
          n.name.toLowerCase().includes(q) ||
          n.route?.toLowerCase().includes(q) ||
          n.table?.toLowerCase().includes(q) ||
          n.sourceFiles?.some((f) => f.toLowerCase().includes(q)),
      );
    } else if (mode === 'explore') {
      const keep = collectImpact([selectedId], graph.edges, 1);
      keep.add(selectedId);
      list = list.filter((n) => keep.has(n.id) || n.id.startsWith('N-FY') || n.id.startsWith('MOD-'));
      if (list.length > 80) {
        list = list.filter((n) => keep.has(n.id) || n.type !== 'SURFACE');
      }
    } else if (mode === 'database') {
      list = list.filter((n) => n.type === 'TABLE' || n.id.startsWith('DB-'));
    } else {
      list = list.filter((n) => highlightIds.has(n.id));
    }
    if (mode === 'saas' && lens === 'current') {
      list = [...list, ...graph.nodes.filter((n) => n.layer === 'target')];
    }
    return list;
  }, [graph.nodes, lens, search, mode, selectedId, highlightIds, graph.edges]);

  const layout = useMemo(
    () => layoutNodes(visibleNodes, graph.edges, mode === 'saas' ? 'N-SALON-SOFTWARE' : selectedId),
    [visibleNodes, graph.edges, selectedId, mode],
  );

  const layoutMap = useMemo(() => new Map(layout.map((l) => [l.id, l])), [layout]);

  const edgesDraw = useMemo(() => {
    const ids = new Set(visibleNodes.map((n) => n.id));
    return graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  }, [graph.edges, visibleNodes]);

  const selected = nodeById.get(selectedId);

  const onSearchPick = useCallback(
    (n: MapNode) => {
      setSelectedId(n.id);
      setSearch('');
    },
    [],
  );

  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return graph.nodes
      .filter(
        (n) =>
          n.id.toLowerCase().includes(q) ||
          n.name.toLowerCase().includes(q) ||
          n.table?.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [search, graph.nodes]);

  const incoming = graph.edges.filter((e) => e.to === selectedId);
  const outgoing = graph.edges.filter((e) => e.from === selectedId);
  const detail = NODE_DETAIL[selectedId];

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-[#0b0f17] text-slate-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Salon Software System Map</h1>
          <p className="text-xs text-slate-400">For Your Technologies · Salon Software architecture — internal only (FYHAIR = reference salon)</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-700 p-0.5 text-xs">
            <button
              type="button"
              className={`rounded-md px-2 py-1 ${lens === 'current' ? 'bg-slate-700' : ''}`}
              onClick={() => setLens('current')}
            >
              Current system
            </button>
            <button
              type="button"
              className={`rounded-md px-2 py-1 ${lens === 'target' ? 'bg-slate-700' : ''}`}
              onClick={() => setLens('target')}
            >
              Target SaaS
            </button>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nodes, routes, tables…"
            className="w-56 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm"
          />
        </div>
      </header>

      <div className="flex flex-wrap gap-1 border-b border-slate-800 px-2 py-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              mode === m.id ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {(mode === 'impact' || mode === 'journeys') && (
        <div className="border-b border-slate-800 px-4 py-2">
          {mode === 'impact' && (
            <select
              value={impactSeed}
              onChange={(e) => setImpactSeed(e.target.value)}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
            >
              {graph.impactPresets.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          {mode === 'journeys' && (
            <select
              value={journeyId}
              onChange={(e) => setJourneyId(e.target.value)}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
            >
              {graph.journeys.map((j) => (
                <option key={j.id} value={j.id}>{j.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {mode === 'saas' && (
        <>
          <div className="border-b border-amber-900/50 bg-amber-950/40 px-4 py-2 text-xs text-amber-200">
            TARGET Salon Software SaaS — NOT YET SAFE IN PRODUCTION. FYHAIR = Reference Salon / Current Implementation. Salon B & C = Future Tenants (illustrative; no real customer data).
          </div>
          <div className="border-b border-slate-800 bg-slate-950/80 px-4 py-3 font-mono text-[10px] leading-relaxed text-slate-300 sm:text-xs">
            <div className="text-center font-semibold tracking-wide text-slate-100">FOR YOUR TECHNOLOGIES</div>
            <div className="text-center text-slate-500">↓</div>
            <div className="text-center font-semibold text-violet-300">SALON SOFTWARE</div>
            <div className="text-center text-slate-500">↓</div>
            <div className="mx-auto mt-1 grid max-w-3xl grid-cols-3 gap-2 text-center">
              <div className="rounded border border-emerald-800/60 bg-emerald-950/30 px-2 py-2">
                <div className="font-semibold text-emerald-200">FYHAIR</div>
                <div className="mt-1 text-[9px] text-emerald-400/90">Reference Salon / Current Implementation</div>
              </div>
              <div className="rounded border border-slate-700 bg-slate-900/50 px-2 py-2">
                <div className="font-semibold text-slate-200">Salon B</div>
                <div className="mt-1 text-[9px] text-slate-500">Future Tenant</div>
              </div>
              <div className="rounded border border-slate-700 bg-slate-900/50 px-2 py-2">
                <div className="font-semibold text-slate-200">Salon C</div>
                <div className="mt-1 text-[9px] text-slate-500">Future Tenant</div>
              </div>
            </div>
          </div>
        </>
      )}

      {mode === 'core-product' ? (
        <CoreProductWorkshop graph={graph} lens={lens} />
      ) : (
      <div className="relative flex min-h-0 flex-1">
        {searchHits.length > 0 && (
          <div className="absolute left-4 top-2 z-20 max-h-64 w-72 overflow-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
            {searchHits.map((n) => (
              <button
                key={n.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-800"
                onClick={() => onSearchPick(n)}
              >
                <span className="font-mono text-violet-300">{n.id}</span> — {n.name}
              </button>
            ))}
          </div>
        )}

        <div
          className="relative min-w-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
          onWheel={(e) => {
            e.preventDefault();
            setZoom((z) => Math.min(2, Math.max(0.35, z - e.deltaY * 0.001)));
          }}
          onPointerDown={(e) => {
            dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!dragRef.current) return;
            setPan({
              x: dragRef.current.px + (e.clientX - dragRef.current.x),
              y: dragRef.current.py + (e.clientY - dragRef.current.y),
            });
          }}
          onPointerUp={() => {
            dragRef.current = null;
          }}
        >
          <svg className="h-full w-full" style={{ background: 'radial-gradient(circle at 30% 20%, #121826 0%, #0b0f17 55%)' }}>
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {edgesDraw.map((e) => {
                const a = layoutMap.get(e.from);
                const b = layoutMap.get(e.to);
                if (!a || !b) return null;
                const hi = highlightIds.has(e.from) && highlightIds.has(e.to);
                return (
                  <line
                    key={`${e.from}-${e.to}-${e.relation}`}
                    x1={a.x + 90}
                    y1={a.y + 28}
                    x2={b.x + 90}
                    y2={b.y + 28}
                    stroke={hi ? '#818cf8' : '#334155'}
                    strokeWidth={hi ? 2 : 1}
                    strokeOpacity={hi ? 0.9 : 0.45}
                  />
                );
              })}
              {layout.map(({ id, x, y, node }) => {
                const hi = highlightIds.has(id) || id === selectedId;
                const dim = highlightIds.size > 3 && !hi;
                return (
                  <g
                    key={id}
                    transform={`translate(${x},${y})`}
                    onClick={() => setSelectedId(id)}
                    className="cursor-pointer"
                  >
                    <rect
                      width={180}
                      height={56}
                      rx={10}
                      fill={dim ? '#1e293b' : '#111827'}
                      stroke={nodeStroke(node, lens)}
                      strokeWidth={hi ? 2.5 : 1}
                      strokeDasharray={isDashed(node) ? '6 4' : undefined}
                      opacity={dim ? 0.45 : 1}
                    />
                    <circle cx={14} cy={28} r={5} fill={nodeColor(node.type, hi, dim)} />
                    <text x={26} y={22} fill="#f1f5f9" fontSize={11} fontWeight={600}>
                      {node.name.length > 22 ? `${node.name.slice(0, 20)}…` : node.name}
                    </text>
                    <text x={26} y={38} fill="#94a3b8" fontSize={9} fontFamily="monospace">
                      {node.id}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          <div className="absolute bottom-3 left-3 rounded-lg border border-slate-700 bg-slate-900/90 p-3 text-[10px] text-slate-300">
            <p className="mb-1 font-semibold text-slate-200">Legend</p>
            {LEGEND.map((l) => (
              <p key={l.label} className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: l.color }} />
                {l.label}
              </p>
            ))}
            <p className="mt-1 text-slate-500">Dashed border = target/future · Pan drag · Scroll zoom</p>
          </div>
        </div>

        <aside className="w-full max-w-md shrink-0 overflow-y-auto border-l border-slate-800 bg-slate-950/80 p-4 md:w-96">
          {selected ? (
            <DetailPanel
              node={selected}
              incoming={incoming}
              outgoing={outgoing}
              detail={detail}
              issues={graph.issues}
              onSelect={setSelectedId}
            />
          ) : (
            <p className="text-sm text-slate-400">Select a node</p>
          )}
          {mode === 'issues' && (
            <div className="mt-6 border-t border-slate-800 pt-4">
              <h3 className="text-sm font-semibold">ISS-01 … ISS-25</h3>
              <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs">
                {graph.issues.map((i) => (
                  <li key={i.id}>
                    <button type="button" className="text-left text-violet-300 hover:underline" onClick={() => setSelectedId(i.id)}>
                      {i.id}: {i.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
      )}
    </div>
  );
}

function DetailPanel({
  node,
  incoming,
  outgoing,
  detail,
  issues,
  onSelect,
}: {
  node: MapNode;
  incoming: { from: string; relation: string; description?: string }[];
  outgoing: { to: string; relation: string; description?: string }[];
  detail?: (typeof NODE_DETAIL)[string];
  issues: SystemMapGraph['issues'];
  onSelect: (id: string) => void;
}) {
  const relatedIssues = issues.filter((i) => i.affectedNodeIds.includes(node.id) || i.id === node.id);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="font-mono text-xs text-violet-400">{node.id}</p>
        <h2 className="text-lg font-semibold">{node.name}</h2>
        <p className="text-xs text-slate-400">Type: {node.type} · Status: {node.status ?? '—'}</p>
      </div>
      {node.description && <p className="text-slate-300">{node.description}</p>}
      {node.route && <Row label="Route" value={node.route} mono />}
      {node.table && <Row label="Table" value={node.table} mono />}
      {node.role && <Row label="Roles" value={node.role} />}
      {detail?.permissions && <Row label="Permissions" value={detail.permissions.join(', ')} />}
      {detail?.businessRules && <Row label="Business rules" value={detail.businessRules.join(' · ')} />}
      {detail?.sourceFiles && (
        <div>
          <p className="text-xs font-medium text-slate-400">Source files</p>
          <ul className="mt-1 space-y-0.5 font-mono text-xs text-slate-300">
            {detail.sourceFiles.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      {detail?.tests && <Row label="Tests" value={detail.tests.join(', ')} />}
      {node.docRefs && (
        <div>
          <p className="text-xs font-medium text-slate-400">Documentation</p>
          <ul className="mt-1 text-xs text-blue-300">
            {node.docRefs.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      )}
      {relatedIssues.length > 0 && (
        <div>
          <p className="text-xs font-medium text-red-400">Known issues</p>
          <ul className="mt-1 space-y-2 text-xs">
            {relatedIssues.map((i) => (
              <li key={i.id} className="rounded border border-red-900/40 bg-red-950/20 p-2">
                <button type="button" className="font-mono text-red-300" onClick={() => onSelect(i.id)}>
                  {i.id}
                </button>
                <p>{i.title}</p>
                {i.knownFix && <p className="text-slate-400">Fix: {i.knownFix}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <p className="text-xs font-medium text-slate-400">Incoming</p>
        <ul className="mt-1 max-h-24 overflow-auto text-xs text-slate-300">
          {incoming.slice(0, 12).map((e) => (
            <li key={`${e.from}-${e.relation}`}>
              <button type="button" className="text-violet-300 hover:underline" onClick={() => onSelect(e.from)}>
                {e.from}
              </button>{' '}
              <span className="text-slate-500">{e.relation}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs font-medium text-slate-400">Outgoing</p>
        <ul className="mt-1 max-h-24 overflow-auto text-xs text-slate-300">
          {outgoing.slice(0, 12).map((e) => (
            <li key={`${e.to}-${e.relation}`}>
              <span className="text-slate-500">{e.relation}</span>{' '}
              <button type="button" className="text-violet-300 hover:underline" onClick={() => onSelect(e.to)}>
                {e.to}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={mono ? 'font-mono text-xs text-slate-200' : 'text-slate-200'}>{value}</p>
    </div>
  );
}

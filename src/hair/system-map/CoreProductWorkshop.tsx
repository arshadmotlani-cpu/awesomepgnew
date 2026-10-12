'use client';

import { useMemo, useState } from 'react';
import type { SystemLens, SystemMapGraph } from './types';
import {
  BUSINESS_DAY_STAGES,
  CONFIG_GROUPS,
  CORE_SPINE,
  DECISIONS_REQUIRED,
  INVOICE_BRANCHES,
  ORG_STACK_TARGET,
  PRODUCT_AREAS,
  PRODUCT_GAPS,
  ROLE_JOURNEYS,
  WORKFLOWS,
  type ConfigLevel,
  type ProductArea,
  type ProductBadge,
  type ProductBoundary,
  type WorkflowDetail,
} from './coreProduct/data';

type CoreSubview =
  | 'spine'
  | 'areas'
  | 'config'
  | 'roles'
  | 'day'
  | 'scale'
  | 'boundaries'
  | 'gaps'
  | 'decisions';

const SUBVIEWS: { id: CoreSubview; label: string }[] = [
  { id: 'spine', label: 'Core workflow' },
  { id: 'areas', label: '25 areas' },
  { id: 'day', label: 'Business day' },
  { id: 'roles', label: 'Roles' },
  { id: 'config', label: 'Configuration' },
  { id: 'boundaries', label: 'Boundaries' },
  { id: 'scale', label: '100+ salons' },
  { id: 'gaps', label: 'Product gaps' },
  { id: 'decisions', label: 'Decisions' },
];

const BOUNDARY_LABEL: Record<ProductBoundary, string> = {
  core: 'Core salon operations',
  platform: 'Platform / SaaS',
  advanced: 'Optional / advanced (discussion)',
};

const BADGE_STYLES: Record<ProductBadge, string> = {
  IMPLEMENTED: 'bg-emerald-900/50 text-emerald-200 border-emerald-700',
  PARTIAL: 'bg-amber-900/40 text-amber-200 border-amber-700',
  MISSING: 'bg-slate-800 text-slate-300 border-slate-600',
  UNSAFE: 'bg-red-950/60 text-red-200 border-red-700',
  TARGET: 'bg-violet-900/40 text-violet-200 border-violet-600',
  TO_BE_DEFINED: 'bg-slate-800 text-slate-400 border-slate-600 border-dashed',
};

const CONFIG_STYLES: Record<ConfigLevel, string> = {
  CURRENTLY_CONFIGURABLE: 'text-emerald-300',
  TARGET_CONFIGURABLE: 'text-violet-300',
  PLATFORM_CONTROLLED: 'text-sky-300',
  TO_BE_DEFINED: 'text-slate-500',
};

type Props = { graph: SystemMapGraph; lens: SystemLens };

export function CoreProductWorkshop({ graph, lens }: Props) {
  const [subview, setSubview] = useState<CoreSubview>('spine');
  const [selectedAreaId, setSelectedAreaId] = useState<string>('CP-10');
  const [roleId, setRoleId] = useState(0);
  const [areaFilter, setAreaFilter] = useState('');
  const [boundaryFilter, setBoundaryFilter] = useState<ProductBoundary | 'all'>('all');

  const areaById = useMemo(() => new Map(PRODUCT_AREAS.map((a) => [a.id, a])), []);
  const selectedArea = areaById.get(selectedAreaId) ?? PRODUCT_AREAS[0];

  const workflow = useMemo(() => resolveWorkflow(selectedArea), [selectedArea]);

  const filteredAreas = useMemo(() => {
    const q = areaFilter.trim().toLowerCase();
    return PRODUCT_AREAS.filter((a) => {
      if (boundaryFilter !== 'all' && a.boundary !== boundaryFilter) return false;
      if (!q) return true;
      return a.name.toLowerCase().includes(q) || a.slug.includes(q);
    });
  }, [areaFilter, boundaryFilter]);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <nav className="flex shrink-0 flex-wrap gap-1 border-b border-slate-800 bg-slate-950/50 px-3 py-2 lg:w-44 lg:flex-col lg:border-b-0 lg:border-r">
        <p className="hidden px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 lg:block">Core Product</p>
        {SUBVIEWS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSubview(s.id)}
            className={`rounded-lg px-3 py-2 text-left text-xs font-medium ${
              subview === s.id ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge label={lens === 'current' ? 'CURRENT FYHAIR' : 'TARGET SALON SOFTWARE'} tone={lens === 'current' ? 'current' : 'target'} />
          <span className="text-xs text-slate-500">KNOWN / INFERRED / TO BE DEFINED — from audit + code refs only</span>
        </div>

        {subview === 'spine' && (
          <SpineView
            selectedAreaId={selectedAreaId}
            onSelectArea={setSelectedAreaId}
          />
        )}
        {subview === 'areas' && (
          <AreasView
            areas={filteredAreas}
            selectedAreaId={selectedAreaId}
            onSelect={setSelectedAreaId}
            areaFilter={areaFilter}
            onFilter={setAreaFilter}
            boundaryFilter={boundaryFilter}
            onBoundary={setBoundaryFilter}
          />
        )}
        {subview === 'config' && <ConfigView />}
        {subview === 'roles' && (
          <RolesView roleIndex={roleId} onRole={setRoleId} />
        )}
        {subview === 'day' && (
          <DayView selectedAreaId={selectedAreaId} onSelectArea={setSelectedAreaId} />
        )}
        {subview === 'scale' && <ScaleView />}
        {subview === 'boundaries' && (
          <BoundariesView onSelectArea={setSelectedAreaId} onGoAreas={() => setSubview('areas')} />
        )}
        {subview === 'gaps' && <GapsView />}
        {subview === 'decisions' && <DecisionsView />}
      </div>

      <aside className="w-full shrink-0 overflow-y-auto border-t border-slate-800 bg-slate-950/90 p-4 lg:w-[22rem] lg:border-l lg:border-t-0">
        <AreaSummary area={selectedArea} workflow={workflow} lens={lens} graph={graph} />
        <FyhairReferencePanel area={selectedArea} workflow={workflow} />
        {workflow && <WorkflowCard workflow={workflow} area={selectedArea} lens={lens} />}
      </aside>
    </div>
  );
}

function resolveWorkflow(area: ProductArea): WorkflowDetail | undefined {
  if (WORKFLOWS[area.slug]) return WORKFLOWS[area.slug];
  return Object.values(WORKFLOWS).find((w) => w.areaIds.includes(area.id));
}

function SpineView({ selectedAreaId, onSelectArea }: { selectedAreaId: string; onSelectArea: (id: string) => void }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h2 className="text-xl font-semibold text-slate-50">Core salon workflow</h2>
        <p className="mt-1 text-sm text-slate-400">Primary spine — click a step to inspect FYHAIR vs target in the panel.</p>
      </header>
      <div className="flex flex-col items-center gap-1">
        {CORE_SPINE.map((step, i) => (
          <div key={step.id} className="flex w-full flex-col items-center">
            <button
              type="button"
              onClick={() => step.areaIds[0] && onSelectArea(step.areaIds[0])}
              className={`w-full max-w-md rounded-xl border px-4 py-3 text-center transition ${
                step.areaIds.includes(selectedAreaId)
                  ? 'border-violet-500 bg-violet-950/40 shadow-lg shadow-violet-900/20'
                  : 'border-slate-700 bg-slate-900/80 hover:border-slate-500'
              }`}
            >
              <p className="text-sm font-semibold text-slate-100">{step.label}</p>
              <p className="mt-1 text-[10px] text-slate-500">{step.areaIds.map((id) => areaByIdLabel(id)).join(' · ')}</p>
            </button>
            {i < CORE_SPINE.length - 1 && <span className="py-1 text-slate-600">↓</span>}
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">From invoice → business records</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {INVOICE_BRANCHES.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => b.areaIds[0] && onSelectArea(b.areaIds[0])}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-left text-xs hover:border-violet-600"
            >
              <span className="text-slate-200">├── {b.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function areaByIdLabel(id: string) {
  return PRODUCT_AREAS.find((a) => a.id === id)?.name ?? id;
}

function AreasView({
  areas,
  selectedAreaId,
  onSelect,
  areaFilter,
  onFilter,
  boundaryFilter,
  onBoundary,
}: {
  areas: ProductArea[];
  selectedAreaId: string;
  onSelect: (id: string) => void;
  areaFilter: string;
  onFilter: (v: string) => void;
  boundaryFilter: ProductBoundary | 'all';
  onBoundary: (v: ProductBoundary | 'all') => void;
}) {
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Product areas (25)</h2>
        <p className="text-sm text-slate-400">Relationships via connectsTo — not all areas are equal priority.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        <input
          value={areaFilter}
          onChange={(e) => onFilter(e.target.value)}
          placeholder="Search areas…"
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm"
        />
        <select
          value={boundaryFilter}
          onChange={(e) => onBoundary(e.target.value as ProductBoundary | 'all')}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm"
        >
          <option value="all">All boundaries</option>
          <option value="core">Core</option>
          <option value="platform">Platform</option>
          <option value="advanced">Advanced</option>
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {areas.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a.id)}
            className={`rounded-xl border p-3 text-left ${
              selectedAreaId === a.id ? 'border-violet-500 bg-violet-950/30' : 'border-slate-700 bg-slate-900/60 hover:border-slate-500'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-slate-100">{a.name}</p>
              {a.importance === 'primary' && (
                <span className="shrink-0 rounded bg-violet-900/50 px-1.5 py-0.5 text-[9px] text-violet-200">primary</span>
              )}
            </div>
            <p className="mt-1 text-[10px] text-slate-500">{BOUNDARY_LABEL[a.boundary]}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              <StatusBadge badge={a.currentBadge} prefix="FYHAIR" />
              <StatusBadge badge={a.targetBadge} prefix="Target" />
            </div>
            {a.connectsTo.length > 0 && (
              <p className="mt-2 text-[10px] text-slate-500">→ {a.connectsTo.slice(0, 4).map(areaByIdLabel).join(', ')}</p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConfigView() {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">What can each salon customize?</h2>
        <p className="text-sm text-slate-400">Levels from audit evidence — not a commitment for 100+ salons yet.</p>
      </header>
      {CONFIG_GROUPS.map((g) => (
        <section key={g.id} className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-violet-200">{g.label}</h3>
          <ul className="mt-3 space-y-2">
            {g.items.map((item) => (
              <li key={item.key} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-200">{item.label}</span>
                  <span className={`text-[10px] font-semibold uppercase ${CONFIG_STYLES[item.configLevel]}`}>
                    {item.configLevel.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="mt-1 text-slate-400">{item.notes}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function RolesView({ roleIndex, onRole }: { roleIndex: number; onRole: (i: number) => void }) {
  const journey = ROLE_JOURNEYS[roleIndex] ?? ROLE_JOURNEYS[0];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Role journeys</h2>
        <p className="text-sm text-slate-400">CURRENT paths from nav + RBAC audit. TARGET steps marked in data as TBD where applicable.</p>
      </header>
      <select
        value={roleIndex}
        onChange={(e) => onRole(Number(e.target.value))}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
      >
        {ROLE_JOURNEYS.map((r, i) => (
          <option key={r.role} value={i}>{r.role}</option>
        ))}
      </select>
      <div className="flex flex-col items-center gap-1">
        {journey.steps.map((step, i) => (
          <div key={i} className="flex w-full flex-col items-center">
            <div className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-center text-sm font-medium text-slate-100">
              {step.label}
            </div>
            {i < journey.steps.length - 1 && <span className="text-slate-600">↓</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayView({ selectedAreaId, onSelectArea }: { selectedAreaId: string; onSelectArea: (id: string) => void }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h2 className="text-xl font-semibold">A day in the salon</h2>
        <p className="text-sm text-slate-400">Click a stage to open connected modules in the detail panel.</p>
      </header>
      <div className="flex flex-col items-center gap-1">
        {BUSINESS_DAY_STAGES.map((stage, i) => (
          <div key={stage.id} className="flex w-full flex-col items-center">
            <button
              type="button"
              onClick={() => stage.areaIds[0] && onSelectArea(stage.areaIds[0])}
              className={`w-full rounded-xl border px-4 py-3 text-sm font-medium ${
                stage.areaIds.includes(selectedAreaId)
                  ? 'border-emerald-600 bg-emerald-950/30 text-emerald-100'
                  : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500'
              }`}
            >
              {stage.label}
            </button>
            {i < BUSINESS_DAY_STAGES.length - 1 && <span className="text-slate-600">↓</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScaleView() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
        TARGET ARCHITECTURE — NOT CURRENT PRODUCTION GUARANTEE (SAAS_READINESS, ISS-01)
      </div>
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 font-mono text-xs text-slate-300">
        <p className="text-center font-semibold text-slate-100">FOR YOUR TECHNOLOGIES</p>
        <p className="text-center text-slate-500">↓</p>
        <p className="text-center font-semibold text-violet-300">SALON SOFTWARE</p>
        <p className="text-center text-slate-500">↓</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded border border-emerald-800/60 p-2">
            <p className="font-semibold text-emerald-200">FYHAIR</p>
            <p className="text-[9px] text-emerald-400">Reference</p>
          </div>
          <div className="rounded border border-slate-600 p-2">
            <p>Salon B</p>
            <p className="text-[9px] text-slate-500">Future</p>
          </div>
          <div className="rounded border border-slate-600 p-2">
            <p>Salon C</p>
            <p className="text-[9px] text-slate-500">Future</p>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1 rounded-xl border border-slate-700 bg-slate-950 p-4">
        {ORG_STACK_TARGET.map((line, i) => (
          <div key={i} className="flex flex-col items-center">
            <p className="text-center text-sm text-slate-200">{line}</p>
            {i < ORG_STACK_TARGET.length - 1 && <span className="text-slate-600">↓</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function BoundariesView({ onSelectArea, onGoAreas }: { onSelectArea: (id: string) => void; onGoAreas: () => void }) {
  const groups: ProductBoundary[] = ['core', 'platform', 'advanced'];
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Product boundaries</h2>
        <p className="text-sm text-slate-400">Visual classification for discussion — not final product tiers.</p>
      </header>
      {groups.map((b) => (
        <section key={b}>
          <h3 className="text-sm font-semibold text-violet-200">{BOUNDARY_LABEL[b]}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRODUCT_AREAS.filter((a) => a.boundary === b).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelectArea(a.id)}
                className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1 text-xs hover:border-violet-500"
              >
                {a.name}
              </button>
            ))}
          </div>
        </section>
      ))}
      <button type="button" onClick={onGoAreas} className="text-sm text-violet-400 hover:underline">
        Open full 25-area map →
      </button>
    </div>
  );
}

function GapsView() {
  return (
    <div className="space-y-3">
      <header>
        <h2 className="text-xl font-semibold">Product gaps</h2>
        <p className="text-sm text-slate-400">CURRENT FYHAIR implementation vs TARGET Salon Software (audit ISS).</p>
      </header>
      <ul className="space-y-2">
        {PRODUCT_GAPS.map((g) => (
          <li key={g.id} className="rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-3">
            <p className="text-sm font-medium text-slate-100">{g.id}: {g.title}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge badge={g.currentBadge} prefix="Current" />
              <StatusBadge badge={g.targetBadge} prefix="Target" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DecisionsView() {
  return (
    <div className="space-y-3">
      <header>
        <h2 className="text-xl font-semibold">Decisions we need to make</h2>
        <p className="text-sm text-slate-400">Unresolved product questions from audit TBD register — not answered here.</p>
      </header>
      <ul className="space-y-2">
        {DECISIONS_REQUIRED.map((d) => (
          <li key={d.id} className="rounded-xl border border-dashed border-amber-800/60 bg-amber-950/20 px-4 py-3">
            <p className="text-xs font-mono text-amber-400">{d.id} · {d.status.replace(/_/g, ' ')}</p>
            <p className="mt-1 text-sm text-slate-100">{d.question}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AreaSummary({ area, workflow, lens, graph }: { area: ProductArea; workflow?: WorkflowDetail; lens: SystemLens; graph: SystemMapGraph }) {
  const linkedIssues = graph.issues.filter((i) =>
    area.graphNodeIds?.some((nid) => i.affectedNodeIds.includes(nid)),
  );
  return (
    <div className="mb-4 space-y-2 border-b border-slate-800 pb-4">
      <p className="font-mono text-[10px] text-violet-400">{area.id}</p>
      <h2 className="text-lg font-semibold text-slate-50">{area.name}</h2>
      <div className="flex flex-wrap gap-1">
        <StatusBadge badge={area.currentBadge} prefix="CURRENT FYHAIR" />
        <StatusBadge badge={area.targetBadge} prefix="TARGET" />
      </div>
      {area.tbd && area.tbd.length > 0 && (
        <div className="rounded-lg border border-dashed border-slate-600 bg-slate-900/50 p-2 text-xs text-slate-400">
          <p className="font-semibold text-slate-300">TO BE DEFINED</p>
          <ul className="mt-1 list-disc pl-4">
            {area.tbd.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {lens === 'target' && (
        <p className="text-xs text-violet-300/80">Target lens: multi-tenant configurable product — not production-safe yet.</p>
      )}
      {linkedIssues.length > 0 && (
        <p className="text-xs text-red-300">Linked issues: {linkedIssues.map((i) => i.id).join(', ')}</p>
      )}
      {!workflow && <p className="text-xs text-slate-500">Select an area with a documented workflow for the card below.</p>}
    </div>
  );
}

function FyhairReferencePanel({ area, workflow }: { area: ProductArea; workflow?: WorkflowDetail }) {
  const panel = buildFyhairPanel(area, workflow);
  return (
    <div className="mb-4 rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-3 text-xs">
      <h3 className="text-sm font-semibold text-emerald-200">FYHAIR — Reference Salon</h3>
      <dl className="mt-2 space-y-2 text-slate-300">
        <div>
          <dt className="text-[10px] uppercase text-slate-500">How FYHAIR operates today</dt>
          <dd className="mt-0.5">{panel.currentOps}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase text-slate-500">Reusable for Salon Software</dt>
          <dd className="mt-0.5">{panel.reusable}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase text-slate-500">FYHAIR-specific</dt>
          <dd className="mt-0.5">{panel.fyhairSpecific}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase text-slate-500">Currently missing / unsafe</dt>
          <dd className="mt-0.5">{panel.missing}</dd>
        </div>
      </dl>
    </div>
  );
}

function buildFyhairPanel(area: ProductArea, workflow?: WorkflowDetail) {
  const badge = area.currentBadge;
  const currentOps =
    badge === 'IMPLEMENTED'
      ? `Working in FYHAIR production for ${area.name} (see audit Part 2–3).`
      : badge === 'PARTIAL'
        ? `Partially live at FYHAIR — gaps documented in audit (badge PARTIAL).`
        : badge === 'UNSAFE'
          ? `Feature exists but unsafe for multi-tenant SaaS (e.g. ISS-02).`
          : `Limited or stubbed in FYHAIR reference deployment.`;

  const reusable =
    workflow?.evidence.length
      ? `Code paths cited in workshop: ${workflow.evidence.slice(0, 3).join(', ')}.`
      : `Patterns in src/hair/* and Hair DB tables — reuse after tenant isolation (ISS-01).`;

  const fyhairSpecific =
    'Single-org FYHAIR hosts (fyhair.* / foryourhair.*), legacy fyh_admin + workforce bridge, SOFT marketing brand — not product naming.';

  const missingParts = [
    ...(area.tbd ?? []),
    area.currentBadge === 'MISSING' ? 'Not implemented in reference tenant.' : '',
    area.currentBadge === 'UNSAFE' ? 'Must harden before other salons.' : '',
  ].filter(Boolean);

  return {
    currentOps,
    reusable,
    fyhairSpecific,
    missing: missingParts.length ? missingParts.join(' · ') : 'No extra gaps flagged beyond target SaaS readiness.',
  };
}

function WorkflowCard({ workflow, area, lens }: { workflow: WorkflowDetail; area: ProductArea; lens: SystemLens }) {
  const rows: { title: string; items: string[] }[] = [
    { title: 'WHO', items: workflow.who },
    { title: 'ACTION', items: workflow.action },
    { title: 'DATA', items: workflow.data },
    { title: 'BUSINESS RULE', items: workflow.rules },
    { title: 'RESULT', items: workflow.result },
    { title: 'SIDE EFFECTS', items: workflow.sideEffects },
    { title: 'REPORTING', items: workflow.reporting },
  ];
  return (
    <div className="space-y-3 text-xs">
      <h3 className="text-sm font-semibold text-slate-100">Workflow card</h3>
      <div className="flex flex-wrap gap-1">
        <StatusBadge badge={area.currentBadge} prefix="CURRENT FYHAIR" />
        <StatusBadge badge={area.targetBadge} prefix="TARGET SALON SOFTWARE" />
        {area.tbd && area.tbd.length > 0 && <StatusBadge badge="TO_BE_DEFINED" prefix="TBD" />}
      </div>
      {rows.map((row) => (
        <div key={row.title}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{row.title}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-300">
            {row.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          {row.title !== 'REPORTING' && <p className="text-center text-slate-600">↓</p>}
        </div>
      ))}
      <p className="text-[10px] text-slate-500">Evidence: {workflow.evidence.join(' · ')}</p>
      {lens === 'target' && (
        <p className="rounded border border-violet-800/40 bg-violet-950/30 p-2 text-violet-200">
          Target: org/location-scoped configuration and isolation — not guaranteed in production today.
        </p>
      )}
    </div>
  );
}

function StatusBadge({ badge, prefix }: { badge: ProductBadge; prefix: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${BADGE_STYLES[badge]}`}>
      <span className="opacity-70">{prefix}</span>
      {badge.replace(/_/g, ' ')}
    </span>
  );
}

function Badge({ label, tone }: { label: string; tone: 'current' | 'target' }) {
  const cls =
    tone === 'current'
      ? 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
      : 'border-violet-600 bg-violet-950/40 text-violet-200';
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${cls}`}>{label}</span>;
}

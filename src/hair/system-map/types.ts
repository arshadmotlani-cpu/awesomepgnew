export type NodeType =
  | 'ROOT'
  | 'PRODUCT'
  | 'MODULE'
  | 'SURFACE'
  | 'FEATURE'
  | 'DOMAIN'
  | 'SERVICE'
  | 'ACTION'
  | 'TABLE'
  | 'ISSUE'
  | 'CONFIG'
  | 'JOURNEY'
  | 'VIEW'
  | 'ROLE'
  | 'PERMISSION'
  | 'BOUNDARY';

export type ImplStatus =
  | 'working'
  | 'partial'
  | 'placeholder'
  | 'broken'
  | 'open'
  | 'missing'
  | 'unsafe'
  | 'tbd'
  | 'target'
  | 'schema'
  | 'implemented'
  | 'unknown';

export type GraphLayer = 'current' | 'target' | 'both';

export interface MapNode {
  id: string;
  type: NodeType;
  name: string;
  description?: string;
  parent?: string;
  route?: string;
  table?: string;
  role?: string;
  status?: string;
  layer?: GraphLayer;
  sourceFiles?: string[];
  docRefs?: string[];
  tests?: string[];
  businessRules?: string[];
  permissions?: string[];
  knownIssues?: string[];
  fixes?: string[];
  risks?: string[];
}

export interface MapEdge {
  from: string;
  to: string;
  relation: string;
  description?: string;
  sourceFile?: string;
}

export interface IssueDetail {
  id: string;
  title: string;
  status: string;
  severity: string;
  rootCause?: string;
  currentState?: string;
  knownFix?: string;
  remainingRisk?: string;
  affectedNodeIds: string[];
}

export interface JourneyStep {
  id: string;
  label: string;
  nodeId?: string;
}

export interface UserJourney {
  id: string;
  name: string;
  steps: JourneyStep[];
}

export interface ImpactPreset {
  id: string;
  name: string;
  seedNodeIds: string[];
}

export interface SystemMapGraph {
  nodes: MapNode[];
  edges: MapEdge[];
  issues: IssueDetail[];
  journeys: UserJourney[];
  impactPresets: ImpactPreset[];
  meta: {
    generatedAt: string;
    sourceDocs: string[];
    discrepancies: string[];
  };
}

export type MapMode =
  | 'core-product'
  | 'explore'
  | 'impact'
  | 'journeys'
  | 'saas'
  | 'issues'
  | 'billing'
  | 'inventory'
  | 'workforce'
  | 'database'
  | 'permissions';

export type SystemLens = 'current' | 'target';

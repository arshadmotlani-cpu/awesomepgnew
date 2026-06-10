const GLOBAL_KEY = '__awesomepgDeployTracker' as const;

export type DeployTrackerState = {
  latestDeploymentId: string | null;
  lastStableDeploymentId: string | null;
  status: 'idle' | 'checking' | 'stable' | 'failed' | 'rolling_back';
  rolledBackDeploymentIds: string[];
};

function defaultState(): DeployTrackerState {
  return {
    latestDeploymentId: null,
    lastStableDeploymentId: null,
    status: 'idle',
    rolledBackDeploymentIds: [],
  };
}

function trackerGlobal(): { state: DeployTrackerState } {
  const g = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: { state: DeployTrackerState };
  };
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = { state: defaultState() };
  return g[GLOBAL_KEY];
}

export function getDeployTrackerState(): DeployTrackerState {
  const s = trackerGlobal().state;
  return { ...s, rolledBackDeploymentIds: [...s.rolledBackDeploymentIds] };
}

export function patchDeployTracker(patch: Partial<DeployTrackerState>): DeployTrackerState {
  const global = trackerGlobal();
  global.state = { ...global.state, ...patch };
  return getDeployTrackerState();
}

export function hasRolledBackDeployment(deploymentId: string): boolean {
  return trackerGlobal().state.rolledBackDeploymentIds.includes(deploymentId);
}

export function markRolledBack(deploymentId: string): void {
  const global = trackerGlobal();
  if (!global.state.rolledBackDeploymentIds.includes(deploymentId)) {
    global.state.rolledBackDeploymentIds.push(deploymentId);
  }
}

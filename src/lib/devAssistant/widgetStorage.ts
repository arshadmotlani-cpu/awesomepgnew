const UI_KEY = 'apg-dev-assistant-ui';

export type DevAssistantUiState = {
  minimized: boolean;
  open: boolean;
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  conversationId: string | null;
  mode: 'ask' | 'plan' | 'agent';
  panel: 'workspace' | 'tasks';
};

const DEFAULT: DevAssistantUiState = {
  minimized: false,
  open: false,
  width: 480,
  height: 640,
  x: null,
  y: null,
  conversationId: null,
  mode: 'ask',
  panel: 'workspace',
};

export function loadDevAssistantUiState(): DevAssistantUiState {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...(JSON.parse(raw) as Partial<DevAssistantUiState>) };
  } catch {
    return DEFAULT;
  }
}

export function saveDevAssistantUiState(partial: Partial<DevAssistantUiState>) {
  if (typeof window === 'undefined') return;
  try {
    const next = { ...loadDevAssistantUiState(), ...partial };
    localStorage.setItem(UI_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

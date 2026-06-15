const UI_KEY = 'apg-dev-assistant-ui';

export type DevAssistantUiState = {
  minimized: boolean;
  open: boolean;
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  conversationId: string | null;
};

const DEFAULT: DevAssistantUiState = {
  minimized: false,
  open: false,
  width: 420,
  height: 560,
  x: null,
  y: null,
  conversationId: null,
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

/** Dev assistant modes — Cursor-style workflow. */
export type DevAssistantMode = 'ask' | 'plan' | 'agent';

export type DevAssistantTaskStatus =
  | 'analyzing'
  | 'planning'
  | 'implementing'
  | 'testing'
  | 'deploying'
  | 'completed'
  | 'failed'
  | 'cancelled';

export const TASK_STATUS_ORDER: DevAssistantTaskStatus[] = [
  'analyzing',
  'planning',
  'implementing',
  'testing',
  'deploying',
  'completed',
];

export type DevAssistantCapturedError = {
  message: string;
  source?: string;
  stack?: string;
  type: 'console' | 'unhandled' | 'react' | 'api' | 'network';
  at: string;
};

export type DevAssistantFailedRequest = {
  url: string;
  method: string;
  status: number;
  statusText?: string;
  at: string;
  bodySnippet?: string;
};

/** Client-collected debug context. */
export type DevAssistantDebugContext = {
  url: string;
  pathname: string;
  pageName: string;
  pageTitle: string;
  admin: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
  entity: {
    pgId?: string;
    pgName?: string;
    residentId?: string;
    residentName?: string;
    bedId?: string;
    bedCode?: string;
    roomId?: string;
    roomNumber?: string;
    bookingId?: string;
  };
  filters: Record<string, string>;
  searchQuery?: string;
  browser: {
    userAgent: string;
    language: string;
    platform: string;
  };
  viewport: {
    width: number;
    height: number;
    deviceType: 'mobile' | 'tablet' | 'desktop';
  };
  timestamp: string;
  recentErrors: DevAssistantCapturedError[];
  recentFailedRequests: DevAssistantFailedRequest[];
  sentry?: {
    lastEventId: string | null;
    recentEvents: Array<{ eventId: string; message?: string; route?: string }>;
  };
  pageHints?: Record<string, unknown>;
};

/** Server-enriched context for ASK / PLAN / AGENT. */
export type DevAssistantEnrichedContext = DevAssistantDebugContext & {
  deployment: {
    latestDeploymentId: string | null;
    lastStableDeploymentId: string | null;
    trackerStatus: string;
    vercelLatestUrl: string | null;
    vercelLatestState: string | null;
    recentEvents: Array<{ status: string; deploymentId: string; at: string }>;
  };
  git: {
    branch: string | null;
    lastCommit: string | null;
    pendingChanges: number;
    dirty: boolean;
  };
  logs: {
    recentErrors: Array<{ message: string; route: string | null; at: string }>;
    errorCountToday: number;
  };
  codebase: Array<{ path: string; excerpt: string; reason: string }>;
  database: Record<string, unknown>;
};

export type DevAssistantMessageMetadata = {
  planMarkdown?: string;
  suggestedFix?: string;
  canHandoffToAgent?: boolean;
  canImplementPlan?: boolean;
  relatedTaskId?: string;
  issueSummary?: string;
};

export type DevAssistantWorkspaceMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  mode: DevAssistantMode;
  content: string;
  createdAt: string;
  metadata?: DevAssistantMessageMetadata | null;
  screenshotDataUrl?: string | null;
};

export type DevAssistantTaskSummary = {
  id: string;
  title: string;
  status: DevAssistantTaskStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  deploymentVersion: string | null;
  resultSummary: string | null;
  errorMessage: string | null;
};

export type DevAssistantTaskDetail = DevAssistantTaskSummary & {
  instruction: string;
  planMarkdown: string | null;
  implementationNotes: string | null;
  deploymentId: string | null;
  events: Array<{
    id: string;
    status: DevAssistantTaskStatus;
    message: string;
    createdAt: string;
  }>;
};

export type DevAssistantWorkspaceState = {
  conversationId: string;
  activeMode: DevAssistantMode;
  messages: DevAssistantWorkspaceMessage[];
  activeTask: DevAssistantTaskDetail | null;
};

export type DevAssistantConversationSummary = {
  id: string;
  title: string;
  activeMode: DevAssistantMode;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  group: 'today' | 'yesterday' | 'older';
};

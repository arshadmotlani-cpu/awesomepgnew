'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  DevAssistantMode,
  DevAssistantTaskDetail,
  DevAssistantTaskStatus,
  DevAssistantTaskSummary,
  DevAssistantWorkspaceMessage,
} from '@/src/lib/devAssistant/types';
import { TASK_STATUS_ORDER } from '@/src/lib/devAssistant/types';
import { MODE_DESCRIPTIONS, MODE_LABELS } from '@/src/lib/devAssistant/modes/prompts';
import { collectDevAssistantContext } from '@/src/lib/devAssistant/collectContext';
import { formatDebugContextForClipboard } from '@/src/lib/devAssistant/contextBuilder';
import {
  loadDevAssistantUiState,
  saveDevAssistantUiState,
} from '@/src/lib/devAssistant/widgetStorage';
import { installDevAssistantErrorCollector } from '@/src/lib/devAssistant/errorCollector';
import { trackNavigation } from '@/src/lib/devAssistant/recentActions';

export type DevAssistantWidgetProps = {
  admin: { id: string; email: string; fullName: string; role: string };
};

const MODES: DevAssistantMode[] = ['ask', 'plan', 'agent'];

function statusLabel(s: DevAssistantTaskStatus): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function DevAssistantWidget({ admin }: DevAssistantWidgetProps) {
  const [ui, setUi] = useState(loadDevAssistantUiState);
  const [mode, setMode] = useState<DevAssistantMode>(ui.mode ?? 'ask');
  const [messages, setMessages] = useState<DevAssistantWorkspaceMessage[]>([]);
  const [tasks, setTasks] = useState<DevAssistantTaskSummary[]>([]);
  const [activeTask, setActiveTask] = useState<DevAssistantTaskDetail | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    installDevAssistantErrorCollector();
  }, []);

  useEffect(() => {
    trackNavigation(pathname);
  }, [pathname]);

  const persistUi = useCallback((partial: Partial<typeof ui>) => {
    setUi((prev) => {
      const next = { ...prev, ...partial };
      saveDevAssistantUiState(next);
      return next;
    });
  }, []);

  const loadWorkspace = useCallback(async () => {
    const q = ui.conversationId ? `?conversationId=${ui.conversationId}` : '';
    const res = await fetch(`/api/admin/dev-assistant/chat${q}`);
    if (!res.ok) return;
    const json = (await res.json()) as {
      ok: boolean;
      data?: {
        conversationId: string;
        activeMode: DevAssistantMode;
        messages: DevAssistantWorkspaceMessage[];
        activeTask: DevAssistantTaskDetail | null;
      };
    };
    if (json.ok && json.data) {
      persistUi({ conversationId: json.data.conversationId });
      setMessages(json.data.messages);
      setMode(json.data.activeMode);
      setActiveTask(json.data.activeTask);
    }
  }, [ui.conversationId, persistUi]);

  const loadTasks = useCallback(async () => {
    const res = await fetch('/api/admin/dev-assistant/tasks');
    if (!res.ok) return;
    const json = (await res.json()) as {
      ok: boolean;
      data?: { tasks: DevAssistantTaskSummary[] };
    };
    if (json.ok && json.data) setTasks(json.data.tasks);
  }, []);

  const pollActiveTask = useCallback(async () => {
    if (!activeTask?.id) return;
    const res = await fetch(`/api/admin/dev-assistant/tasks?taskId=${activeTask.id}`);
    if (!res.ok) return;
    const json = (await res.json()) as { ok: boolean; data?: DevAssistantTaskDetail };
    if (json.ok && json.data) {
      setActiveTask(json.data);
      if (['completed', 'failed', 'cancelled'].includes(json.data.status)) {
        void loadTasks();
      }
    }
  }, [activeTask?.id, loadTasks]);

  useEffect(() => {
    if (ui.open) {
      void loadWorkspace();
      void loadTasks();
    }
  }, [ui.open, loadWorkspace, loadTasks]);

  useEffect(() => {
    if (!activeTask || ['completed', 'failed', 'cancelled'].includes(activeTask.status)) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(() => void pollActiveTask(), 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeTask, pollActiveTask]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, activeTask?.events.length, loading]);

  const submit = async () => {
    const content = input.trim();
    if (!content || loading) return;

    const context = collectDevAssistantContext(admin);
    setInput('');
    setLoading(true);

    if (mode === 'agent') {
      persistUi({ panel: 'workspace' });
    }

    try {
      const res = await fetch('/api/admin/dev-assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          mode,
          conversationId: ui.conversationId,
          context,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: {
          conversationId: string;
          activeTask?: DevAssistantTaskDetail | null;
        };
      };
      if (json.ok && json.data) {
        persistUi({ conversationId: json.data.conversationId, mode });
        await loadWorkspace();
        if (json.data.activeTask) setActiveTask(json.data.activeTask);
        void loadTasks();
      }
    } finally {
      setLoading(false);
    }
  };

  const handoff = async (
    sourceMessageId: string,
    kind: 'implement_plan' | 'fix_automatically',
  ) => {
    setLoading(true);
    setMode('agent');
    persistUi({ mode: 'agent', panel: 'workspace' });
    try {
      const res = await fetch('/api/admin/dev-assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'handoff',
          conversationId: ui.conversationId,
          sourceMessageId,
          handoffKind: kind,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { activeTask: DevAssistantTaskDetail };
      };
      if (json.ok && json.data?.activeTask) {
        setActiveTask(json.data.activeTask);
        void loadTasks();
        void loadWorkspace();
      }
    } finally {
      setLoading(false);
    }
  };

  const copyContext = async () => {
    await navigator.clipboard.writeText(formatDebugContextForClipboard(collectDevAssistantContext(admin)));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const panelStyle: React.CSSProperties = {
    width: ui.width,
    height: ui.height,
    ...(ui.x != null && ui.y != null ? { left: ui.x, top: ui.y, right: 'auto', bottom: 'auto' } : {}),
  };

  return (
    <div className="apg-dev-assistant-root pointer-events-none fixed inset-0 z-[200]">
      <AnimatePresence>
        {ui.open && !ui.minimized && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            style={panelStyle}
            className="pointer-events-auto fixed bottom-20 right-5 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0d1117] font-mono text-[13px] shadow-2xl shadow-black/60"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#161b22] px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold tracking-wide text-white/90">Dev Assistant</span>
                <span className="rounded bg-[#FF5A1F]/20 px-1.5 py-0.5 text-[9px] uppercase text-[#FF5A1F]">
                  {MODE_LABELS[mode]}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <TabBtn active={ui.panel === 'workspace'} onClick={() => persistUi({ panel: 'workspace' })}>
                  Workspace
                </TabBtn>
                <TabBtn active={ui.panel === 'tasks'} onClick={() => persistUi({ panel: 'tasks' })}>
                  Tasks
                </TabBtn>
                <IconBtn onClick={() => persistUi({ minimized: true })}>—</IconBtn>
                <IconBtn onClick={() => persistUi({ open: false })}>✕</IconBtn>
              </div>
            </header>

            <div className="flex shrink-0 gap-1 border-b border-white/10 bg-[#0d1117] p-2">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    persistUi({ mode: m });
                  }}
                  className={
                    'flex-1 rounded-md py-1.5 text-[10px] font-bold tracking-wider transition ' +
                    (mode === m
                      ? 'bg-[#FF5A1F] text-white'
                      : 'border border-white/10 text-white/50 hover:border-white/20 hover:text-white/80')
                  }
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
            <p className="shrink-0 border-b border-white/5 px-3 py-1 text-[10px] text-white/40">
              {MODE_DESCRIPTIONS[mode]}
            </p>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3">
              {ui.panel === 'tasks' ? (
                <TaskHistoryPanel
                  tasks={tasks}
                  onOpen={(t) => {
                    void (async () => {
                      const res = await fetch(`/api/admin/dev-assistant/tasks?taskId=${t.id}`);
                      const json = (await res.json()) as { ok: boolean; data?: DevAssistantTaskDetail };
                      if (json.ok && json.data) {
                        setActiveTask(json.data);
                        persistUi({ panel: 'workspace' });
                      }
                    })();
                  }}
                />
              ) : (
                <>
                  {activeTask && !['completed', 'failed'].includes(activeTask.status) ? (
                    <TaskProgressCard task={activeTask} />
                  ) : null}

                  {activeTask && ['completed', 'failed'].includes(activeTask.status) ? (
                    <TaskResultCard task={activeTask} onDismiss={() => setActiveTask(null)} />
                  ) : null}

                  {messages.length === 0 && !activeTask ? (
                    <EmptyWorkspace mode={mode} pathname={pathname} />
                  ) : (
                    messages.map((m) => (
                      <WorkspaceBlock
                        key={m.id}
                        message={m}
                        onImplementPlan={() => void handoff(m.id, 'implement_plan')}
                        onFixAutomatically={() => void handoff(m.id, 'fix_automatically')}
                        loading={loading}
                      />
                    ))
                  )}
                  {loading ? <p className="mt-2 text-[10px] text-white/40">Processing…</p> : null}
                </>
              )}
            </div>

            <div className="shrink-0 border-t border-white/10 bg-[#161b22] p-2">
              <div className="mb-2 flex flex-wrap gap-1">
                <SmallBtn onClick={() => void copyContext()}>{copied ? '✓ Copied' : 'Context'}</SmallBtn>
                <SmallBtn
                  onClick={() => {
                    persistUi({ conversationId: null });
                    setMessages([]);
                    setActiveTask(null);
                  }}
                >
                  New workspace
                </SmallBtn>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
                className="flex gap-2"
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    mode === 'ask'
                      ? 'Ask about this page, data, or error…'
                      : mode === 'plan'
                        ? 'Describe what you want to build or redesign…'
                        : 'Describe the task to execute…'
                  }
                  rows={2}
                  className="min-w-0 flex-1 resize-none rounded-lg border border-white/10 bg-[#0d1117] px-2 py-1.5 text-xs text-white placeholder:text-white/30 outline-none focus:border-[#FF5A1F]/40"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="self-end rounded-lg bg-[#FF5A1F] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white disabled:opacity-40"
                >
                  {mode === 'agent' ? 'Run' : 'Send'}
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="pointer-events-auto fixed bottom-5 right-5"
        style={{ marginBottom: 'env(safe-area-inset-bottom)', marginRight: 'env(safe-area-inset-right)' }}
      >
        <motion.button
          type="button"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            if (ui.open && !ui.minimized) persistUi({ minimized: true });
            else persistUi({ open: true, minimized: false });
          }}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-[#161b22] text-xl shadow-lg shadow-black/50"
          aria-label="Dev Assistant"
        >
          ⚡
        </motion.button>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded px-2 py-0.5 text-[10px] ' +
        (active ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70')
      }
    >
      {children}
    </button>
  );
}

function IconBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded px-1.5 text-xs text-white/50 hover:text-white">
      {children}
    </button>
  );
}

function SmallBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-white/60 hover:bg-white/5 hover:text-white"
    >
      {children}
    </button>
  );
}

function EmptyWorkspace({ mode, pathname }: { mode: DevAssistantMode; pathname: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 p-4 text-white/50">
      <p className="text-xs text-white/70">{MODE_LABELS[mode]} mode</p>
      <p className="mt-2 text-[11px] leading-relaxed">
        Context: <span className="text-[#FF5A1F]">{pathname}</span>
        <br />
        Errors, Sentry, logs, git & deploy state attach automatically.
      </p>
    </div>
  );
}

function WorkspaceBlock({
  message,
  onImplementPlan,
  onFixAutomatically,
  loading,
}: {
  message: DevAssistantWorkspaceMessage;
  onImplementPlan: () => void;
  onFixAutomatically: () => void;
  loading: boolean;
}) {
  const isUser = message.role === 'user';
  const meta = message.metadata;

  return (
    <div
      className={
        'mb-3 rounded-lg border ' +
        (isUser ? 'border-[#FF5A1F]/30 bg-[#FF5A1F]/5' : 'border-white/10 bg-[#161b22]')
      }
    >
      <div className="flex items-center gap-2 border-b border-white/5 px-2 py-1">
        <span className="text-[9px] uppercase tracking-wider text-white/40">
          {isUser ? 'You' : 'Assistant'} · {MODE_LABELS[message.mode]}
        </span>
      </div>
      <pre className="whitespace-pre-wrap p-2 text-[11px] leading-relaxed text-white/85">{message.content}</pre>
      {!isUser && meta?.canImplementPlan ? (
        <div className="border-t border-white/5 p-2">
          <HandoffBtn disabled={loading} onClick={onImplementPlan}>
            ▶ Implement plan
          </HandoffBtn>
        </div>
      ) : null}
      {!isUser && meta?.canHandoffToAgent ? (
        <div className="border-t border-white/5 p-2">
          <HandoffBtn disabled={loading} onClick={onFixAutomatically}>
            ⚡ Fix automatically
          </HandoffBtn>
        </div>
      ) : null}
    </div>
  );
}

function HandoffBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-md bg-emerald-600/20 py-1.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function TaskProgressCard({ task }: { task: DevAssistantTaskDetail }) {
  const currentIdx = TASK_STATUS_ORDER.indexOf(task.status);

  return (
    <div className="mb-4 rounded-lg border border-[#FF5A1F]/40 bg-[#FF5A1F]/5 p-3">
      <p className="text-[10px] uppercase tracking-wide text-[#FF5A1F]">Agent task</p>
      <p className="mt-1 text-sm font-semibold text-white">{task.title}</p>
      <div className="mt-3 space-y-1">
        {TASK_STATUS_ORDER.filter((s) => s !== 'completed').map((s, i) => {
          const done = i < currentIdx;
          const active = s === task.status;
          return (
            <div
              key={s}
              className={
                'flex items-center gap-2 text-[10px] ' +
                (active ? 'text-white' : done ? 'text-emerald-400/80' : 'text-white/30')
              }
            >
              <span>{done ? '✓' : active ? '●' : '○'}</span>
              <span>{statusLabel(s)}</span>
            </div>
          );
        })}
      </div>
      {task.events.length > 0 ? (
        <div className="mt-3 max-h-24 overflow-y-auto border-t border-white/10 pt-2">
          {task.events.slice(-4).map((e) => (
            <p key={e.id} className="text-[10px] text-white/50">
              {e.message}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TaskResultCard({ task, onDismiss }: { task: DevAssistantTaskDetail; onDismiss: () => void }) {
  return (
    <div
      className={
        'mb-4 rounded-lg border p-3 ' +
        (task.status === 'completed'
          ? 'border-emerald-500/40 bg-emerald-500/5'
          : 'border-rose-500/40 bg-rose-500/5')
      }
    >
      <p className="text-xs font-semibold text-white">{task.title}</p>
      <p className="mt-1 text-[10px] text-white/60">{task.resultSummary ?? task.errorMessage}</p>
      {task.deploymentVersion ? (
        <p className="mt-1 text-[10px] text-white/40">Deploy: {task.deploymentVersion}</p>
      ) : null}
      <button type="button" onClick={onDismiss} className="mt-2 text-[10px] text-white/40 hover:text-white">
        Dismiss
      </button>
    </div>
  );
}

function TaskHistoryPanel({
  tasks,
  onOpen,
}: {
  tasks: DevAssistantTaskSummary[];
  onOpen: (t: DevAssistantTaskSummary) => void;
}) {
  if (tasks.length === 0) {
    return <p className="text-[11px] text-white/40">No agent tasks yet.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wide text-white/40">Task history</p>
      {tasks.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onOpen(t)}
          className="w-full rounded-lg border border-white/10 bg-[#161b22] p-2 text-left hover:border-white/20"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-white">{t.title}</span>
            <StatusPill status={t.status} />
          </div>
          <p className="mt-1 text-[10px] text-white/40">
            {new Date(t.createdAt).toLocaleString()}
            {t.durationMs ? ` · ${Math.round(t.durationMs / 1000)}s` : ''}
            {t.deploymentVersion ? ` · ${t.deploymentVersion}` : ''}
          </p>
        </button>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: DevAssistantTaskStatus }) {
  const colors: Record<string, string> = {
    completed: 'bg-emerald-500/20 text-emerald-300',
    failed: 'bg-rose-500/20 text-rose-300',
    cancelled: 'bg-white/10 text-white/40',
  };
  return (
    <span
      className={
        'shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase ' +
        (colors[status] ?? 'bg-[#FF5A1F]/20 text-[#FF5A1F]')
      }
    >
      {status}
    </span>
  );
}

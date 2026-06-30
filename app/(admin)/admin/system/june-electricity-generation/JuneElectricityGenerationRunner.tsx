'use client';

import { useCallback, useRef, useState } from 'react';

export function JuneElectricityGenerationRunner() {
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    setOutput('');
    setCompleted(false);

    try {
      const res = await fetch('/api/admin/system/june-electricity-generation', {
        method: 'POST',
        credentials: 'same-origin',
      });

      if (!res.ok && !res.body) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      if (!res.body) {
        throw new Error('No response body');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        setOutput(buffer);
        outputRef.current?.scrollTo(0, outputRef.current.scrollHeight);
      }

      buffer += decoder.decode();
      setOutput(buffer);

      if (!res.ok) {
        throw new Error(buffer.trim() || `HTTP ${res.status}`);
      }

      if (buffer.includes('✓ Locked')) {
        setCompleted(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [running]);

  return (
    <div className="space-y-4">
      {!completed ? (
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="rounded-lg bg-[#FF5A1F] px-5 py-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          {running ? 'Running… (do not close this tab)' : 'Run June Electricity Generation'}
        </button>
      ) : (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Completed successfully. This page is now locked — refresh to confirm.
        </div>
      )}

      {error ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {(output || running) && (
        <pre
          ref={outputRef}
          className="max-h-[70vh] overflow-auto rounded-xl border border-white/10 bg-[#0E1116] p-4 font-mono text-xs leading-relaxed text-emerald-100 whitespace-pre-wrap"
        >
          {output || (running ? 'Starting…\n' : '')}
        </pre>
      )}
    </div>
  );
}

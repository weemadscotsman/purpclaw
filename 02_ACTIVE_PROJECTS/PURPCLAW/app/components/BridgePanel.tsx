'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * PurpClaw Bridge — Dual AI chat panes that share a single engine.
 *
 * Both panes call the same /api/bridge route. The only difference is the
 * `provider`/`model` in the body — so there is ONE engine, two faces,
 * exactly per the "one brain, many faces" rule.
 *
 * Modes:
 *   - Manual: type to A, send to B (or vice versa)
 *   - Debate: A argues for, B argues against, A critiques B, B critiques A, summary
 *   - Critique: one critiques the other's last output
 *   - Merge: combine both outputs into one final answer
 *   - Auto: let them talk for N turns (capped at 5)
 */

type Provider = 'nvidia' | 'openai' | 'ollama' | 'custom' | 'purpclaw';

interface PaneConfig {
  provider: Provider;
  model: string;
  baseUrl?: string;
  systemPrompt?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'bridge';
  content: string;
  ts: number;
  from?: 'A' | 'B' | 'bridge';
  meta?: string;
}

const PROVIDER_DEFAULTS: Record<Provider, { label: string; models: string[]; needsKey: boolean; settingKey?: string }> = {
  nvidia: {
    label: 'NVIDIA NIM',
    needsKey: true,
    // FIX 2026-06-22: map to the namespaced settings-registry key, not
    // the raw env-var name. /api/settings only accepts registry keys.
    settingKey: 'providers.nvidiaKey',
    models: [
      'meta/llama-3.3-70b-instruct',
      'meta/llama-1.8b-instruct',
      'nvidia/nvidia-nemotron-nano-9b-v2',
      'qwen/qwen3-coder-480b-a35b-instruct',
    ],
  },
  ollama: {
    label: 'Ollama (Local)',
    needsKey: false,
    models: ['qwen2.5:3b', 'llama-3.2-3b', 'phi-4-mini', 'gemma-2-2b'],
  },
  purpclaw: {
    label: 'PurpClaw (Local :7780)',
    needsKey: false,
    models: ['agent-loop (tools + memory)'],
  },
  openai: {
    label: 'OpenAI',
    needsKey: true,
    // No dedicated providers.openaiKey in the catalog yet — the bridge
    // shares the same primary key slot. Until a dedicated key is added,
    // saving here updates the same place the rest of the stack reads.
    settingKey: 'providers.llmKey',
    models: ['gpt-4o-mini', 'gpt-4o', 'o1-mini'],
  },
  custom: {
    label: 'Custom (OpenAI-compatible)',
    needsKey: false,
    models: ['custom-model'],
  },
};

const DEFAULT_A: PaneConfig = {
  provider: 'nvidia',
  model: 'meta/llama-3.3-70b-instruct',
  systemPrompt: 'You are Side A (Builder). Be specific, action-oriented, and pragmatic.',
};

const DEFAULT_B: PaneConfig = {
  provider: 'ollama',
  model: 'qwen2.5:3b',
  systemPrompt: 'You are Side B (Auditor). Be critical, find flaws, and demand evidence.',
};

interface BridgePanelProps {
  initialA?: PaneConfig;
  initialB?: PaneConfig;
}

export default function BridgePanel({ initialA, initialB }: BridgePanelProps) {
  const [configA, setConfigA] = useState<PaneConfig>(initialA || DEFAULT_A);
  const [configB, setConfigB] = useState<PaneConfig>(initialB || DEFAULT_B);
  const [historyA, setHistoryA] = useState<ChatMessage[]>([]);
  const [historyB, setHistoryB] = useState<ChatMessage[]>([]);
  const [bridgeLog, setBridgeLog] = useState<ChatMessage[]>([]);
  const [inputA, setInputA] = useState('');
  const [inputB, setInputB] = useState('');
  const [busy, setBusy] = useState<'A' | 'B' | 'bridge' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId] = useState(() => 'bridge-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8));
  const [spend, setSpend] = useState({ turns: 0, tokens: 0 });
  const stoppedRef = useRef(false);

  // FIX 2026-06-22: clickable "needs key" affordance.
  // The badge used to be a static span; now it opens an Add-Key modal that
  // POSTs to /api/settings and persists into the user keychain. After save
  // the local "key set" map flips so the badge updates without a refresh.
  const [keyModal, setKeyModal] = useState<{ open: boolean; side: 'A' | 'B' | null; provider: Provider | null }>({ open: false, side: null, provider: null });
  const [keyValue, setKeyValue] = useState('');
  const [keySaving, setKeySaving] = useState(false);
  const [keyMsg, setKeyMsg] = useState<string | null>(null);
  // Track which providers have a key set locally so the badge flips after save.
  // Loaded from /api/settings on mount and updated after a successful save.
  const [keysSet, setKeysSet] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Probe /api/settings to learn which provider keys are already set.
    // The settings endpoint masks secrets, so we just check the .set flag.
    (async () => {
      try {
        const r = await fetch('/api/settings?load=1', { cache: 'no-store' });
        const d = await r.json();
        const out: Record<string, boolean> = {};
        const all = Array.isArray(d.settings) ? d.settings : Object.values(d.settings || {}).flat() as Array<{ key: string; set?: boolean }>;
        for (const s of all) {
          if (s && typeof s.key === 'string' && s.set) out[s.key] = true;
        }
        setKeysSet(out);
      } catch { /* ignore — keysSet stays empty, badge stays yellow */ }
    })();
  }, []);

  const openKeyModal = (side: 'A' | 'B', provider: Provider) => {
    setKeyModal({ open: true, side, provider });
    setKeyValue('');
    setKeyMsg(null);
  };
  const closeKeyModal = () => {
    if (keySaving) return;
    setKeyModal({ open: false, side: null, provider: null });
    setKeyValue('');
    setKeyMsg(null);
  };
  const saveKey = async () => {
    if (!keyModal.provider || !keyValue.trim() || keySaving) return;
    const providerDef = PROVIDER_DEFAULTS[keyModal.provider];
    const settingKey = providerDef.settingKey;
    if (!settingKey) {
      setKeyMsg('This provider does not need a key.');
      return;
    }
    setKeySaving(true);
    setKeyMsg(null);
    try {
      const r = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: settingKey, value: keyValue.trim() }),
      });
      const d = await r.json();
      if (d.ok) {
        setKeysSet(prev => ({ ...prev, [settingKey]: true }));
        setKeyMsg(`✓ ${settingKey} saved. You can close this and start chatting.`);
        setKeyValue('');
        // Auto-close after a moment so the user lands back in the chat.
        setTimeout(() => { if (keyModal.open) closeKeyModal(); }, 1400);
      } else {
        setKeyMsg(`Save failed: ${d.error || r.status}`);
      }
    } catch (e) {
      setKeyMsg(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setKeySaving(false);
    }
  };

  // Call /api/bridge with given config + messages
  const callTurn = useCallback(async (config: PaneConfig, messages: any[]) => {
    const r = await fetch('/api/bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'turn', provider: config.provider, model: config.model, baseUrl: config.baseUrl, messages }),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j;
  }, []);

  // Send a message in pane A
  const sendA = useCallback(async () => {
    if (!inputA.trim() || busy) return;
    const userMsg: ChatMessage = { role: 'user', content: inputA, ts: Date.now() };
    const newHistory = [...historyA, userMsg];
    setHistoryA(newHistory);
    setInputA('');
    setBusy('A');
    setError(null);
    try {
      const messages = [
        ...(configA.systemPrompt ? [{ role: 'system', content: configA.systemPrompt }] : []),
        ...newHistory.filter(m => m.role !== 'bridge').map(m => ({ role: m.role, content: m.content })),
      ];
      const r = await callTurn(configA, messages);
      setHistoryA(h => [...h, { role: 'assistant', content: r.reply || '(no reply)', ts: Date.now(), meta: r.model }]);
      setSpend(s => ({ turns: s.turns + 1, tokens: s.tokens + (r.reply?.length || 0) }));
    } catch (e: any) {
      setError(`A: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }, [inputA, historyA, configA, busy, callTurn]);

  // Send a message in pane B
  const sendB = useCallback(async () => {
    if (!inputB.trim() || busy) return;
    const userMsg: ChatMessage = { role: 'user', content: inputB, ts: Date.now() };
    const newHistory = [...historyB, userMsg];
    setHistoryB(newHistory);
    setInputB('');
    setBusy('B');
    setError(null);
    try {
      const messages = [
        ...(configB.systemPrompt ? [{ role: 'system', content: configB.systemPrompt }] : []),
        ...newHistory.filter(m => m.role !== 'bridge').map(m => ({ role: m.role, content: m.content })),
      ];
      const r = await callTurn(configB, messages);
      setHistoryB(h => [...h, { role: 'assistant', content: r.reply || '(no reply)', ts: Date.now(), meta: r.model }]);
      setSpend(s => ({ turns: s.turns + 1, tokens: s.tokens + (r.reply?.length || 0) }));
    } catch (e: any) {
      setError(`B: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }, [inputB, historyB, configB, busy, callTurn]);

  // A → B handoff
  const sendAtoB = useCallback(async () => {
    const lastA = [...historyA].reverse().find(m => m.role === 'assistant');
    if (!lastA) {
      setError('A has no response yet — send a message first.');
      return;
    }
    setBusy('bridge');
    setError(null);
    try {
      const r = await fetch('/api/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'send',
          sessionId,
          from: 'A', to: 'B',
          fromConfig: configA,
          toConfig: configB,
          message: lastA.content,
        }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      const bridgeMsg: ChatMessage = { role: 'bridge', content: `A→B: ${lastA.content.substring(0, 100)}...`, ts: Date.now(), from: 'A' };
      const replyMsg: ChatMessage = { role: 'assistant', content: j.reply || '(no reply)', ts: Date.now(), meta: j.model, from: 'A' };
      setBridgeLog(l => [...l, bridgeMsg, { ...replyMsg, role: 'user' as const }]);
      setHistoryB(h => [...h, { role: 'user', content: `(A→B) ${lastA.content}`, ts: Date.now() }, { role: 'assistant', content: j.reply || '(no reply)', ts: Date.now(), meta: j.model }]);
      setSpend(s => ({ turns: s.turns + 1, tokens: s.tokens + (j.reply?.length || 0) }));
    } catch (e: any) {
      setError(`A→B: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }, [historyA, configA, configB, sessionId]);

  // B → A handoff
  const sendBtoA = useCallback(async () => {
    const lastB = [...historyB].reverse().find(m => m.role === 'assistant');
    if (!lastB) {
      setError('B has no response yet — send a message first.');
      return;
    }
    setBusy('bridge');
    setError(null);
    try {
      const r = await fetch('/api/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'send',
          sessionId,
          from: 'B', to: 'A',
          fromConfig: configB,
          toConfig: configA,
          message: lastB.content,
        }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setBridgeLog(l => [...l, { role: 'bridge', content: `B→A: ${lastB.content.substring(0, 100)}...`, ts: Date.now(), from: 'B' }]);
      setHistoryA(h => [...h, { role: 'user', content: `(B→A) ${lastB.content}`, ts: Date.now() }, { role: 'assistant', content: j.reply || '(no reply)', ts: Date.now(), meta: j.model }]);
      setSpend(s => ({ turns: s.turns + 1, tokens: s.tokens + (j.reply?.length || 0) }));
    } catch (e: any) {
      setError(`B→A: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }, [historyB, configA, configB, sessionId]);

  // Debate: A argues for, B argues against, both critique, summary
  const runDebate = useCallback(async (prompt: string) => {
    if (!prompt.trim() || busy) return;
    setBusy('bridge');
    setError(null);
    setBridgeLog(l => [...l, { role: 'bridge', content: `DEBATE: ${prompt}`, ts: Date.now() }]);
    try {
      const r = await fetch('/api/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'debate', sessionId, aConfig: configA, bConfig: configB, prompt, maxTurns: 3 }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      const transcript: ChatMessage[] = (j.transcript || []).map((t: any, i: number) => ({
        role: 'bridge' as const,
        content: `[${t.side}/${t.role}]: ${t.content || t.error || '(no reply)'}`,
        ts: Date.now() + i,
        from: t.side === 'merge' ? 'bridge' : (t.side as 'A' | 'B'),
        meta: t.error ? 'error' : undefined,
      }));
      setBridgeLog(l => [...l, ...transcript]);
      setSpend(s => ({ turns: s.turns + (j.transcript?.length || 0), tokens: s.tokens + (j.transcript || []).reduce((sum: number, t: any) => sum + (t.content?.length || 0), 0) }));
    } catch (e: any) {
      setError(`Debate: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }, [configA, configB, sessionId, busy]);

  // Merge: combine last outputs of A and B
  const runMerge = useCallback(async () => {
    const lastA = [...historyA].reverse().find(m => m.role === 'assistant');
    const lastB = [...historyB].reverse().find(m => m.role === 'assistant');
    if (!lastA || !lastB) {
      setError('Both panes need an assistant response before merging.');
      return;
    }
    setBusy('bridge');
    setError(null);
    try {
      const r = await fetch('/api/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'merge', sessionId, mergerConfig: configA, aOutput: lastA.content, bOutput: lastB.content }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setBridgeLog(l => [...l, { role: 'bridge', content: `MERGED: ${j.reply}`, ts: Date.now() }]);
      setSpend(s => ({ turns: s.turns + 1, tokens: s.tokens + (j.reply?.length || 0) }));
    } catch (e: any) {
      setError(`Merge: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }, [historyA, historyB, configA, sessionId]);

  // Auto: multi-turn loop
  const runAuto = useCallback(async (turns: number, prompt: string) => {
    if (!prompt.trim() || busy) return;
    setBusy('bridge');
    setError(null);
    stoppedRef.current = false;
    setBridgeLog(l => [...l, { role: 'bridge', content: `AUTO x${turns}: ${prompt}`, ts: Date.now() }]);
    try {
      const r = await fetch('/api/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'auto', sessionId, aConfig: configA, bConfig: configB, prompt, maxTurns: Math.min(turns, 5) }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      const transcript: ChatMessage[] = (j.transcript || []).map((t: any, i: number) => ({
        role: 'bridge' as const,
        content: `[${t.side} turn ${t.turn}]: ${t.content || t.error || '(no reply)'}`,
        ts: Date.now() + i,
        from: t.side as 'A' | 'B',
      }));
      setBridgeLog(l => [...l, ...transcript]);
      setSpend(s => ({ turns: s.turns + (j.transcript?.length || 0), tokens: s.tokens + (j.transcript || []).reduce((sum: number, t: any) => sum + (t.content?.length || 0), 0) }));
    } catch (e: any) {
      setError(`Auto: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }, [configA, configB, sessionId, busy]);

  // Stop any in-flight bridge loop
  const stopBridge = useCallback(async () => {
    stoppedRef.current = true;
    try {
      await fetch('/api/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'stop', sessionId }),
      });
    } catch {}
    setBusy(null);
  }, [sessionId]);

  // Clear all history
  const clearAll = useCallback(() => {
    setHistoryA([]);
    setHistoryB([]);
    setBridgeLog([]);
    setSpend({ turns: 0, tokens: 0 });
  }, []);

  // Render a single pane
  const renderPane = (side: 'A' | 'B', config: PaneConfig, setConfig: (c: PaneConfig) => void, history: ChatMessage[], input: string, setInput: (s: string) => void, send: () => void) => {
    const providerDef = PROVIDER_DEFAULTS[config.provider];
    const keyAlreadySet = providerDef.settingKey ? keysSet[providerDef.settingKey] === true : false;
    return (
      <div className="flex flex-col h-full bg-zinc-900/40 border border-zinc-800 rounded-lg overflow-hidden">
        {/* Header: provider/model/agent selector */}
        <div className="p-3 border-b border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-cyan-400 font-mono text-sm font-bold">Side {side}</span>
            {/* FIX 2026-06-22: clickable needs-key badge.
                When the provider needs an API key, this is a button that
                opens the Add-Key modal so the user can paste + save the key
                without leaving the bridge. */}
            {providerDef.needsKey && !keyAlreadySet && (
              <button
                onClick={() => openKeyModal(side, config.provider)}
                className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 hover:text-yellow-200 transition-colors"
                title={`Click to add ${providerDef.settingKey} (saves to /api/settings)`}
              >
                needs key ⚠
              </button>
            )}
            {providerDef.needsKey && keyAlreadySet && (
              <span
                className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 cursor-pointer hover:bg-emerald-500/30"
                onClick={() => openKeyModal(side, config.provider)}
                title={`${providerDef.settingKey} set — click to replace`}
              >
                key set ✓
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={config.provider}
              onChange={e => {
                const p = e.target.value as Provider;
                setConfig({ ...config, provider: p, model: PROVIDER_DEFAULTS[p].models[0] });
              }}
              className="bg-zinc-800 text-zinc-200 text-xs px-2 py-1 rounded border border-zinc-700"
            >
              {Object.entries(PROVIDER_DEFAULTS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select
              value={config.model}
              onChange={e => setConfig({ ...config, model: e.target.value })}
              className="bg-zinc-800 text-zinc-200 text-xs px-2 py-1 rounded border border-zinc-700"
            >
              {providerDef.models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {config.provider === 'custom' && (
            <input
              type="text"
              placeholder="Custom baseUrl (https://...)"
              value={config.baseUrl || ''}
              onChange={e => setConfig({ ...config, baseUrl: e.target.value })}
              className="mt-2 w-full bg-zinc-800 text-zinc-200 text-xs px-2 py-1 rounded border border-zinc-700"
            />
          )}
          <textarea
            placeholder="System prompt (optional)"
            value={config.systemPrompt || ''}
            onChange={e => setConfig({ ...config, systemPrompt: e.target.value })}
            className="mt-2 w-full bg-zinc-800/50 text-zinc-300 text-xs px-2 py-1 rounded border border-zinc-700 h-12 resize-none"
          />
        </div>
        {/* History */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {history.length === 0 && (
            <div className="text-zinc-500 text-xs text-center py-8">
              Side {side} idle. Type a message to start.
            </div>
          )}
          {history.map((m, i) => (
            <div key={i} className={`text-xs rounded p-2 ${
              m.role === 'user'
                ? 'bg-cyan-900/30 text-cyan-100'
                : m.role === 'bridge'
                ? 'bg-purple-900/30 text-purple-100 italic'
                : 'bg-zinc-800/50 text-zinc-200'
            }`}>
              <div className="text-zinc-500 text-[10px] mb-1">
                {m.role} {m.meta && `· ${m.meta}`}
              </div>
              <div className="whitespace-pre-wrap break-words">{m.content}</div>
            </div>
          ))}
        </div>
        {/* Input */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-900/60">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={`Message Side ${side}… (Enter to send, Shift+Enter for newline)`}
              className="flex-1 bg-zinc-800 text-zinc-100 text-xs px-2 py-1.5 rounded border border-zinc-700 h-16 resize-none"
            />
            <button
              onClick={send}
              disabled={busy !== null || !input.trim()}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-medium rounded self-end"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
    <div className="flex flex-col h-full p-4 gap-3">
      {/* Header / status bar */}
      <div className="flex items-center gap-3 text-xs">
        <span className="text-cyan-400 font-bold">🟣 PurpClaw Bridge</span>
        <span className="text-zinc-500">session: <code className="text-zinc-400">{sessionId}</code></span>
        <span className="text-zinc-500">turns: {spend.turns}</span>
        <span className="text-zinc-500">tokens: {spend.tokens}</span>
        {busy && <span className="text-yellow-400 animate-pulse">⏳ {busy}…</span>}
        <div className="flex-1" />
        <button
          onClick={clearAll}
          className="px-2 py-1 text-zinc-400 hover:text-zinc-100 text-xs"
        >
          Clear
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-900/30 border border-red-800 text-red-300 text-xs rounded">
          {error}
        </div>
      )}

      {/* Two panes side by side */}
      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
        {renderPane('A', configA, setConfigA, historyA, inputA, setInputA, sendA)}
        {renderPane('B', configB, setConfigB, historyB, inputB, setInputB, sendB)}
      </div>

      {/* Bridge controls + bridge log */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-3">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-cyan-400 font-mono text-xs font-bold">Bridge</span>
          <button onClick={sendAtoB} disabled={busy !== null} className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded border border-zinc-700">
            A → B
          </button>
          <button onClick={sendBtoA} disabled={busy !== null} className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded border border-zinc-700">
            B → A
          </button>
          <button
            onClick={() => {
              const p = window.prompt('Debate prompt:');
              if (p) runDebate(p);
            }}
            disabled={busy !== null}
            className="px-2 py-1 bg-purple-700 hover:bg-purple-600 text-white text-xs rounded"
          >
            Debate
          </button>
          <button onClick={runMerge} disabled={busy !== null} className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 text-white text-xs rounded">
            Merge
          </button>
          <button
            onClick={() => {
              const p = window.prompt('Auto-bridge prompt:');
              const n = parseInt(window.prompt('How many turns? (1-5)') || '3', 10);
              if (p) runAuto(Math.min(Math.max(1, n), 5), p);
            }}
            disabled={busy !== null}
            className="px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white text-xs rounded"
          >
            Auto
          </button>
          <button
            onClick={stopBridge}
            disabled={!busy}
            className="px-2 py-1 bg-red-700 hover:bg-red-600 text-white text-xs rounded disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            Stop
          </button>
        </div>
        {bridgeLog.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-1 border-t border-zinc-800 pt-2 mt-2">
            {bridgeLog.map((m, i) => (
              <div key={i} className="text-[11px] text-purple-200 bg-purple-900/20 rounded px-2 py-1 whitespace-pre-wrap break-words">
                {m.content}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

    {/* FIX 2026-06-22: Add-Key modal — opened by clicking the "needs key" badge
        on either Side A or Side B. Save POSTs to /api/settings which persists
        the key into the user keychain. Modal is fully controlled: parent owns
        keyModal / keyValue / keySaving / keyMsg. */}
    {keyModal.open && keyModal.provider && (
      <div
        role="dialog"
        aria-label={`Add ${PROVIDER_DEFAULTS[keyModal.provider].settingKey || 'API key'}`}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          zIndex: 1200, display: 'grid', placeItems: 'center', padding: 20,
        }}
        onClick={closeKeyModal}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: 'min(520px, 96vw)',
            background: 'linear-gradient(180deg, rgba(18,10,31,0.98), rgba(10,6,18,1))',
            border: '1px solid rgba(217,70,239,0.4)',
            borderRadius: 8,
            boxShadow: '0 20px 70px rgba(0,0,0,0.55)',
            padding: 16,
            color: '#f5f0ff',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>
                Add key for Side {keyModal.side} · {PROVIDER_DEFAULTS[keyModal.provider].label}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 4 }}>
                {PROVIDER_DEFAULTS[keyModal.provider].settingKey}
              </div>
            </div>
            <button
              type="button"
              onClick={closeKeyModal}
              disabled={keySaving}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#f5f0ff', borderRadius: 4, padding: '5px 9px', cursor: keySaving ? 'not-allowed' : 'pointer',
              }}
            >close</button>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.58)', fontSize: 11, lineHeight: 1.5, marginTop: 10 }}>
            Paste your {PROVIDER_DEFAULTS[keyModal.provider].label} API key. It is written
            to local settings storage and the badge will flip to <em>key set ✓</em>
            without a page refresh.
          </div>
          <input
            autoFocus
            value={keyValue}
            onChange={e => setKeyValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveKey(); if (e.key === 'Escape') closeKeyModal(); }}
            type="password"
            placeholder="paste key here"
            style={{
              marginTop: 14, width: '100%', boxSizing: 'border-box',
              padding: '10px 12px', background: '#0a0612',
              border: '1px solid var(--border-strong)', borderRadius: 5,
              color: '#f5f0ff', fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
            }}
          />
          {keyMsg && (
            <div style={{
              marginTop: 10, padding: '6px 10px', borderRadius: 4, fontSize: 11,
              background: keyMsg.startsWith('✓') ? 'rgba(52,211,153,0.10)' : 'rgba(251,113,133,0.10)',
              border: `1px solid ${keyMsg.startsWith('✓') ? 'rgba(52,211,153,0.35)' : 'rgba(251,113,133,0.35)'}`,
              color: keyMsg.startsWith('✓') ? '#34d399' : '#fb7185',
            }}>{keyMsg}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button
              type="button"
              onClick={closeKeyModal}
              disabled={keySaving}
              style={{
                padding: '7px 12px', background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.65)',
                borderRadius: 4, cursor: keySaving ? 'not-allowed' : 'pointer',
              }}
            >Cancel</button>
            <button
              type="button"
              onClick={saveKey}
              disabled={!keyValue.trim() || keySaving}
              style={{
                padding: '7px 14px',
                background: keyValue.trim() ? 'rgba(217,70,239,0.22)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${keyValue.trim() ? 'rgba(217,70,239,0.5)' : 'rgba(255,255,255,0.08)'}`,
                color: keyValue.trim() ? '#d946ef' : 'rgba(255,255,255,0.35)',
                borderRadius: 4,
                cursor: keyValue.trim() && !keySaving ? 'pointer' : 'not-allowed',
                fontWeight: 800,
              }}
            >{keySaving ? 'Saving…' : 'Save Key'}</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

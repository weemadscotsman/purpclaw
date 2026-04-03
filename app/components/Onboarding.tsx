'use client';

import React, { useEffect, useState } from 'react';
import type { MissionData } from '../hooks/useMissionData';

export const ONBOARD_KEY = 'purpclaw_onboarded_v1';

type SetupKey = {
  key: string; label: string; group: string; secret: boolean; help: string;
  placeholder?: string; options?: string[]; set: boolean; display: string;
};
type SetupStatus = { ok: boolean; envExists: boolean; provider: string; ready: boolean; keys: SetupKey[] };

const LENSES: { code: string; title: string; what: string }[] = [
  { code: 'MS', title: 'Mission Spine', what: 'Start here. Whole-system glance: what is live, who is working, what is delegated.' },
  { code: 'CM', title: 'Control Room', what: 'Talk to the stack: chat, kernel jobs, missions, group chat, research rooms.' },
  { code: 'HX', title: 'Execution Harness', what: 'Run autonomous missions with decomposition + validation gates.' },
  { code: 'AG', title: 'Agent Workforce', what: 'Every specialist agent, what it is doing, where work is stuck.' },
  { code: 'TW', title: 'Tower State', what: 'Spawn / kill agents and watch the runtime that executes assignments.' },
  { code: 'DG', title: 'Delegation Graph', what: 'Who got the work, what happened, what failed — and on which model.' },
  { code: 'WF', title: 'Workflow Flow', what: 'Follow workflow state from queued → active → archived.' },
  { code: 'EV', title: 'Event Lens', what: 'Exact runtime event timeline when you need ground truth.' },
  { code: 'CG', title: 'Cognitive Mesh', what: 'Memory, rules, diagnostics, and reasoning lenses.' },
  { code: 'SE', title: 'Self-Evolution', what: 'The human-steers / harness-builds / loop-improves learning cycle.' },
  { code: 'GK', title: 'Risk Gate', what: 'Safety gates and approvals — risky operations stop here first.' },
  { code: 'AS', title: 'Asher', what: 'Your companion + live narrator over every event, job, and agent.' },
];

function Dot({ on }: { on: boolean }) {
  return <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: on ? '#34d399' : '#475569', boxShadow: on ? '0 0 8px rgba(52,211,153,0.6)' : 'none' }} />;
}

export function Onboarding({ data, onClose }: { data: MissionData; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({}); // key -> note

  const loadStatus = async () => {
    try {
      const r = await fetch('/api/setup');
      if (r.ok) setStatus(await r.json());
    } catch {}
  };
  useEffect(() => { loadStatus(); }, []);

  const saveKey = async (key: string) => {
    const value = draft[key];
    if (value == null || value === '') return;
    setSaving(key);
    try {
      const r = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      const j = await r.json();
      if (j.ok) {
        setSaved(s => ({ ...s, [key]: (j.notes && j.notes.length ? j.notes.join(', ') : 'saved') }));
        setDraft(d => ({ ...d, [key]: '' }));
        loadStatus();
      } else {
        setSaved(s => ({ ...s, [key]: `error: ${j.error}` }));
      }
    } catch (e: any) {
      setSaved(s => ({ ...s, [key]: `error: ${e?.message || 'failed'}` }));
    } finally {
      setSaving(null);
    }
  };

  const finish = () => {
    try { localStorage.setItem(ONBOARD_KEY, new Date().toISOString()); } catch {}
    onClose();
  };

  const agents = data.agents || [];
  const divisions = new Set(agents.map(a => a.division).filter(Boolean)).size;
  // Core-only count — matches the header's "X/5" so the onboarding tile
  // agrees with the lens rail. Optional services (no-spaghett, thringlets,
  // harness, etc.) are tracked separately and shouldn't pad the live count.
  const allServices    = data.services || [];
  const coreServices   = allServices.filter(s => !s.optional);
  const onlineSvc      = coreServices.filter(s => s.status === 'online' || s.status === 'degraded').length;
  const optionalOnline = allServices.filter(s => s.optional && (s.status === 'online' || s.status === 'degraded')).length;

  const steps = ['Welcome', 'Connect keys', 'The lenses', 'How it works'];
  const coreKeys = (status?.keys || []).filter(k => k.group === 'core');
  const otherKeys = (status?.keys || []).filter(k => k.group !== 'core');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-3xl max-h-[88vh] overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#05080d] shadow-[0_0_80px_rgba(34,211,238,0.18)] flex flex-col">
        {/* Header / progress */}
        <div className="flex items-center justify-between border-b border-white/8 bg-black/40 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-black tracking-[0.3em] text-cyan-300" style={{ textShadow: '0 0 10px rgba(34,211,238,0.4)' }}>PURPCLAW</span>
            <span className="text-[10px] uppercase tracking-[0.22em] text-white/35 font-mono">onboarding</span>
          </div>
          <button onClick={finish} className="text-[11px] font-mono text-white/35 hover:text-white/70">Skip →</button>
        </div>
        <div className="flex gap-1 px-5 pt-3">
          {steps.map((s, i) => (
            <div key={s} className="flex-1">
              <div className="h-1 rounded-full" style={{ background: i <= step ? '#22d3ee' : 'rgba(255,255,255,0.08)' }} />
              <div className={`mt-1 text-[8px] uppercase tracking-wider font-mono ${i === step ? 'text-cyan-300' : 'text-white/25'}`}>{s}</div>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 0 && (
            <div className="space-y-4">
              <h1 className="text-3xl font-black text-white">Welcome to your stack.</h1>
              <p className="text-sm leading-6 text-white/60">
                PURPCLAW is one mission runtime with many lenses — a governed operations kernel with memory,
                delegation, real tools, execution environments, and scheduled work. Not a chat wrapper.
              </p>
              <div className="grid grid-cols-3 gap-3 pt-2">
                <Stat label="services live" value={`${onlineSvc}/${coreServices.length}`} />
                {optionalOnline > 0 && (
                  <Stat label="optional up" value={`${optionalOnline}`} subtle />
                )}
                <Stat label="agents" value={agents.length || '44'} />
                <Stat label="divisions" value={divisions || 9} />
              </div>
              <p className="text-[11px] text-white/35 font-mono pt-2">Three things to set up: a model key, a quick tour, and you are live. ~2 minutes.</p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-black text-white">Connect a model.</h2>
                <p className="text-sm text-white/55 mt-1">Pasted keys are auto-sanitised (quotes, whitespace, doubled paste). Keys are written to <code className="text-cyan-300/70">.env</code> and never shown back in full.</p>
              </div>
              {!status && <div className="text-white/30 text-xs font-mono">Loading config…</div>}
              {coreKeys.map(k => <KeyRow key={k.key} spec={k} draft={draft} setDraft={setDraft} saving={saving} saved={saved} onSave={saveKey} />)}
              <details className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <summary className="cursor-pointer text-[11px] uppercase tracking-wider font-mono text-white/40">Optional providers & tools ({otherKeys.length})</summary>
                <div className="mt-3 space-y-3">
                  {otherKeys.map(k => <KeyRow key={k.key} spec={k} draft={draft} setDraft={setDraft} saving={saving} saved={saved} onSave={saveKey} />)}
                </div>
              </details>
              {status && (
                <div className="text-[11px] font-mono flex items-center gap-2">
                  <Dot on={status.ready} />
                  <span className={status.ready ? 'text-emerald-300/80' : 'text-amber-300/80'}>
                    {status.ready ? `Ready — provider: ${status.provider}` : 'Set a provider + primary key to go live.'}
                  </span>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div>
                <h2 className="text-xl font-black text-white">The lenses.</h2>
                <p className="text-sm text-white/55 mt-1">Every tab is a view onto the same runtime — same memory, same router. Open them from the rail on the right edge.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {LENSES.map(l => (
                  <div key={l.code} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-cyan-300/20 bg-black/40 px-1.5 py-0.5 text-[9px] font-mono text-cyan-100/65">{l.code}</span>
                      <span className="text-[12px] font-bold text-white/85">{l.title}</span>
                    </div>
                    <div className="mt-1 text-[11px] leading-4 text-white/45">{l.what}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-black text-white">How the stack handles work.</h2>
              <Flow n="1" title="You give it a job" body="Type in Control Room. Routing picks chat, a kernel job, a mission, the swarm, or a research room." />
              <Flow n="2" title="It delegates" body="The coordinator decomposes the goal and assigns parts to specialist agents across divisions — visible in the Delegation Graph." />
              <Flow n="3" title="Gates check the work" body="Risky steps stop at the Risk Gate for approval; validation gates verify subtasks before they count as done." />
              <Flow n="4" title="It learns" body="Outcomes, lessons, and scores feed memory; when idle it can run self-evolution loops to harden its own harness." />
              <p className="text-[11px] text-white/35 font-mono pt-1">You can reopen this anytime from the header.</p>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between border-t border-white/8 bg-black/40 px-5 py-3">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-1.5 text-[11px] font-mono text-white/50 disabled:opacity-30 hover:text-white/80"
          >← Back</button>
          {step < steps.length - 1 ? (
            <button onClick={() => setStep(s => s + 1)} className="rounded-lg border border-cyan-300/30 bg-cyan-300/12 px-5 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200 hover:bg-cyan-300/20">Next →</button>
          ) : (
            <button onClick={finish} className="rounded-lg border border-emerald-300/30 bg-emerald-300/12 px-5 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-200 hover:bg-emerald-300/20">Enter the stack →</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, subtle = false }: { label: string; value: string | number; subtle?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-3 text-center ${subtle ? 'border-white/6 bg-white/[0.02]' : 'border-white/10 bg-white/[0.04]'}`}>
      <div className={`text-2xl font-black font-mono ${subtle ? 'text-white/45' : 'text-cyan-300'}`}>{value}</div>
      <div className="mt-1 text-[9px] uppercase tracking-wider text-white/35 font-mono">{label}</div>
    </div>
  );
}

function Flow({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/10 text-[11px] font-mono text-cyan-200">{n}</span>
      <div>
        <div className="text-[13px] font-bold text-white/85">{title}</div>
        <div className="text-[11px] leading-4 text-white/50 mt-0.5">{body}</div>
      </div>
    </div>
  );
}

function KeyRow({ spec, draft, setDraft, saving, saved, onSave }: {
  spec: SetupKey;
  draft: Record<string, string>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  saving: string | null;
  saved: Record<string, string>;
  onSave: (key: string) => void;
}) {
  const note = saved[spec.key];
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <Dot on={spec.set} />
          <span className="text-[12px] font-bold text-white/80">{spec.label}</span>
          <span className="text-[9px] font-mono text-white/25">{spec.key}</span>
        </div>
        {spec.set && <span className="text-[10px] font-mono text-emerald-300/60">{spec.display || 'set'}</span>}
      </div>
      <div className="text-[10px] text-white/40 mb-2">{spec.help}</div>
      <div className="flex gap-2">
        {spec.options ? (
          <select
            value={draft[spec.key] ?? ''}
            onChange={e => setDraft(d => ({ ...d, [spec.key]: e.target.value }))}
            className="flex-1 rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white/80 outline-none focus:border-cyan-300/40"
          >
            <option value="">{spec.set ? `current: ${spec.display}` : 'choose…'}</option>
            {spec.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input
            type={spec.secret ? 'password' : 'text'}
            value={draft[spec.key] ?? ''}
            onChange={e => setDraft(d => ({ ...d, [spec.key]: e.target.value }))}
            placeholder={spec.set ? '•••• (set — paste to replace)' : (spec.placeholder || (spec.secret ? 'paste key…' : 'value…'))}
            className="flex-1 rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white/80 placeholder:text-white/20 outline-none focus:border-cyan-300/40 font-mono"
          />
        )}
        <button
          onClick={() => onSave(spec.key)}
          disabled={saving === spec.key || !(draft[spec.key] ?? '')}
          className="rounded-lg border border-emerald-300/30 bg-emerald-300/12 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-200 disabled:opacity-30 hover:bg-emerald-300/20"
        >
          {saving === spec.key ? '…' : 'Save'}
        </button>
      </div>
      {note && <div className={`mt-1.5 text-[10px] font-mono ${note.startsWith('error') ? 'text-rose-300/70' : 'text-emerald-300/60'}`}>{note}</div>}
    </div>
  );
}

export default Onboarding;

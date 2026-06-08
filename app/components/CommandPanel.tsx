'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { MissionData } from '../hooks/useMissionData';
import { ComposerInput } from './composer';
import ToolCallBadge from './ToolCallBadge';

// ── Mochi Narrator ────────────────────────────────────────────────────────────

interface NarratorLine {
  id: string;
  ts: string;
  text: string;
  mood: 'happy' | 'alert' | 'curious' | 'proud' | 'worried' | 'chill';
}

// Map raw event types → Asher's narration (imperious dragon, occasionally tender)
function narrateEvent(type: string, data: any): { text: string; mood: NarratorLine['mood'] } | null {
  const t = type?.toLowerCase() || '';

  if (t.includes('chat') && t.includes('delegat')) return { text: `chat came in — routing it through the kernel. watch.`, mood: 'curious' };
  if (t === 'chat_answered' || t === 'chat.answered') return { text: `answered. ${data?.provider || 'minimax'} handled it.`, mood: 'chill' };

  if (t.includes('kernel') && t.includes('accept')) return { text: `job accepted. ${data?.route || 'swarm'} has it.`, mood: 'happy' };
  if (t.includes('kernel') && t.includes('start')) return { text: `kernel job started — route: ${data?.route || '?'}`, mood: 'curious' };
  if (t.includes('kernel') && t.includes('complet')) return { text: `job done. ${data?.successCount || ''} ${data?.memberCount ? `${data.successCount}/${data.memberCount} models answered` : 'completed cleanly'}.`, mood: 'proud' };
  if (t.includes('kernel') && t.includes('fail')) return { text: `job failed. ${data?.error || 'check the kernel jobs panel.'} not pleased.`, mood: 'worried' };
  if (t.includes('kernel') && t.includes('block')) return { text: `blocked. repair governor says no. fix the gaps first.`, mood: 'alert' };

  if (t.includes('research') && t.includes('start')) return { text: `research room open — sources gathering...`, mood: 'curious' };
  if (t.includes('research') && t.includes('source')) return { text: `fetching sources. ${data?.query ? `"${String(data.query).slice(0, 40)}"` : ''}`, mood: 'curious' };
  if (t.includes('research') && t.includes('complet')) return { text: `research done. ${data?.successCount || '?'} models answered, synthesis ready.`, mood: 'proud' };
  if (t.includes('research') && t.includes('fail')) return { text: `research failed. ${data?.error || 'models silent.'}`, mood: 'worried' };

  if (t.includes('swarm') && t.includes('start')) return { text: `swarm mission open. decomposing...`, mood: 'curious' };
  if (t.includes('swarm') && t.includes('subtask') && t.includes('complet')) return { text: `${data?.subtask?.agent || 'agent'} finished their slice.`, mood: 'happy' };
  if (t.includes('swarm') && t.includes('synth')) return { text: `agents done. synthesizing now.`, mood: 'curious' };
  if (t.includes('swarm') && t.includes('complet')) return { text: `swarm mission complete. ${data?.metrics?.completedSubtasks || '?'} subtasks done.`, mood: 'proud' };
  if (t.includes('swarm') && t.includes('fail')) return { text: `swarm hit trouble. ${data?.error || 'check delegation graph.'}`, mood: 'worried' };

  if (t.includes('agent') && t.includes('spawn')) return { text: `${data?.agentName || 'an agent'} spawned. it's working.`, mood: 'happy' };
  if (t.includes('agent') && t.includes('complet')) return { text: `${data?.agentName || 'agent'} done (exit ${data?.code ?? 0}).`, mood: data?.code === 0 ? 'proud' : 'worried' };
  if (t.includes('agent') && t.includes('kill')) return { text: `${data?.agentName || 'agent'} terminated. intentional.`, mood: 'alert' };

  if (t.includes('evolution') && t.includes('tick')) return { text: `self-research tick complete. ${data?.modelsAnswered || '?'} models. memory ingested.`, mood: 'proud' };
  if (t.includes('harness') && t.includes('bench')) return { text: `benchmark ran. ${data?.passRate || '?'} pass rate.`, mood: data?.passRate === '100%' ? 'proud' : 'alert' };

  if (t.includes('orchestrator') && t.includes('start')) return { text: `orchestrator workflow opened.`, mood: 'chill' };
  if (t.includes('orchestrator') && t.includes('fail')) return { text: `orchestrator workflow failed. ${data?.error || ''}`, mood: 'worried' };

  return null;
}

const MOOD_GLOW: Record<NarratorLine['mood'], string> = {
  happy:   '0 0 8px rgba(52,211,153,0.6)',
  alert:   '0 0 8px rgba(251,191,36,0.7)',
  curious: '0 0 8px rgba(34,211,238,0.6)',
  proud:   '0 0 10px rgba(167,139,250,0.7)',
  worried: '0 0 8px rgba(251,113,133,0.6)',
  chill:   '0 0 6px rgba(148,163,184,0.4)',
};
const MOOD_COLOR: Record<NarratorLine['mood'], string> = {
  happy: '#34d399', alert: '#fbbf24', curious: '#22d3ee',
  proud: '#a78bfa', worried: '#fb7185', chill: '#94a3b8',
};

function serviceReachable(status?: string) {
  return status === 'online' || status === 'degraded';
}

function coreServices(services: MissionData['services']) {
  return (services || []).filter(service => !service.optional);
}

function serviceCountLabel(services: MissionData['services']) {
  const core = coreServices(services);
  const online = core.filter(service => serviceReachable(service.status)).length;
  return { online, total: core.length };
}

type MochiAction = 'feed' | 'play' | 'clean' | 'sleep' | 'pet';
type MochiCompanion = {
  hatched?: boolean;
  hint?: string;
  name?: string;
  species?: string;
  eye?: string;
  hat?: string;
  rarity?: string;
  shiny?: boolean;
  tone?: string;
  verb?: string;
  interactions?: number;
  bond?: number;
  lastFedAt?: string | null;
  lastPlayedAt?: string | null;
  lastCleanedAt?: string | null;
  lastSleptAt?: string | null;
  mood?: string;
};

type MochiNeeds = {
  FOOD: number;
  JOY: number;
  CLEAN: number;
  REST: number;
  BORED: number;
  BOND: number;
};

const MOCHI_FACE_BUILDERS: Record<string, (eye: string, mouth: string, accent: string) => string> = {
  duck: (eye, mouth, accent) => `(${eye}${mouth}>${accent}`,
  goose: (eye, mouth, accent) => `(${eye}${mouth}>${accent}`,
  blob: (eye, mouth, accent) => `(${eye}${mouth}${eye})${accent}`,
  cat: (eye, mouth, accent) => `=${eye}${mouth}${eye}=${accent}`,
  dragon: (eye, mouth, accent) => `<${eye}${mouth}${eye}>${accent}`,
  octopus: (eye, mouth, accent) => `~(${eye}${mouth}${eye})~${accent}`,
  owl: (eye, mouth, accent) => `(${eye})${mouth}(${eye})${accent}`,
  penguin: (eye, mouth, accent) => `(${eye}${mouth}>)${accent}`,
  turtle: (eye, mouth, accent) => `[${eye}${mouth}${eye}]${accent}`,
  snail: (eye, mouth, accent) => `${eye}${mouth}(@)${accent}`,
  ghost: (eye, mouth, accent) => `(${eye}${mouth}${eye})~${accent}`,
  rabbit: (eye, mouth, accent) => `(${eye}${mouth}${eye})/${accent}`,
  fox: (eye, mouth, accent) => `>${eye}${mouth}${eye}<${accent}`,
  default: (eye, mouth, accent) => `(${eye}${mouth}${eye})${accent}`,
};

const MOCHI_EYES_BY_MOOD: Record<string, string[]> = {
  alert: ['!', '^', 'o', '*'],
  working: ['*', '+', 'o', '^'],
  focused: ['*', '+', 'o', 'x'],
  worried: ['o', 'x', '!', '-'],
  hungry: ['o', '.', '-'],
  dirty: ['x', '.', '~'],
  tired: ['-', '_', '~'],
  bored: ['-', '.', 'o'],
  loved: ['^', '*', '+'],
  happy: ['^', '*', '+'],
  chill: ['-', '.', '^'],
};

const MOCHI_MOUTHS_BY_MOOD: Record<string, string[]> = {
  alert: ['!', '^', '~'],
  working: ['~', '^', '='],
  focused: ['~', '=', '_'],
  worried: ['_', '~', '.'],
  hungry: ['_', '.', '~'],
  dirty: ['_', 'x', '~'],
  tired: ['_', '-', '.'],
  bored: ['_', '-', '.'],
  loved: ['w', '^', '~'],
  happy: ['w', '^', '~'],
  chill: ['~', '-', '.'],
};

const MOCHI_ACCENTS = ['', '.', "'", '`', '*', '+', '~', ''];
const MOCHI_ACTION_FACE: Record<MochiAction, string> = {
  feed: '(^w^)',
  play: '(*w*)',
  clean: '(*~*)',
  sleep: '(-_-)',
  pet: '(^~^)',
};

function clampPct(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function decayedPercent(value: string | null | undefined, windowMs: number, fallback = 20) {
  if (!value) return fallback;
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return fallback;
  return clampPct(100 * (1 - (Date.now() - then) / windowMs));
}

function computeMissionMochiNeeds(mochi: MochiCompanion | null): MochiNeeds {
  const bond = clampPct(mochi?.bond ?? Math.min(100, (mochi?.interactions || 0) * 8));
  const recentPlay = decayedPercent(mochi?.lastPlayedAt, 2 * 3600_000, 0);
  return {
    FOOD: decayedPercent(mochi?.lastFedAt, 4 * 3600_000, 35),
    JOY: clampPct(Math.min(100, bond * 0.55 + recentPlay * 0.45 + Math.min(30, (mochi?.interactions || 0) * 2))),
    CLEAN: decayedPercent(mochi?.lastCleanedAt, 6 * 3600_000, 45),
    REST: decayedPercent(mochi?.lastSleptAt, 8 * 3600_000, 55),
    BORED: clampPct(100 - recentPlay),
    BOND: bond,
  };
}

function mochiMoodFromReality(data: MissionData, needs: MochiNeeds): string {
  const jobs = data.kernelJobs || [];
  const agents = data.agents || [];
  const failedJob = jobs.some(job => String(job.state || '').toLowerCase() === 'failed');
  const activeJob = jobs.some(job => ['queued', 'delegated', 'running', 'started', 'synthesizing'].includes(String(job.state || '').toLowerCase()));
  const working = agents.some(agent => agent.status === 'working');
  const errorAgent = agents.some(agent => agent.status === 'error');
  const checkedServices = coreServices(data.services || []).filter(service => service.status !== 'checking');
  const darkServices = checkedServices.filter(service => !serviceReachable(service.status)).length;

  if (failedJob || errorAgent || darkServices > Math.max(2, checkedServices.length / 2)) return 'alert';
  if (needs.FOOD < 25) return 'hungry';
  if (needs.CLEAN < 25) return 'dirty';
  if (needs.REST < 25) return 'tired';
  if (needs.BORED > 78) return 'bored';
  if (activeJob || working) return 'working';
  if (needs.JOY > 70 || needs.BOND > 70) return 'happy';
  return 'chill';
}

function narratorMoodFromMochi(mochiMood: string): NarratorLine['mood'] {
  if (mochiMood === 'alert' || mochiMood === 'dirty') return 'alert';
  if (mochiMood === 'hungry' || mochiMood === 'tired') return 'worried';
  if (mochiMood === 'working' || mochiMood === 'focused') return 'curious';
  if (mochiMood === 'happy' || mochiMood === 'loved') return 'happy';
  return 'chill';
}

function pickCombo(seed: string, count: number) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % Math.max(1, count);
}

function renderMissionMochiFace(mochi: MochiCompanion | null, mochiMood: string, frame: number, blink: boolean, action: MochiAction | null) {
  if (action) return MOCHI_ACTION_FACE[action];
  if (!mochi?.hatched) return '(._.)';
  const species = mochi.species || 'default';
  const builder = MOCHI_FACE_BUILDERS[species] || MOCHI_FACE_BUILDERS.default;
  if (blink) {
    const mouth = (MOCHI_MOUTHS_BY_MOOD[mochiMood] || MOCHI_MOUTHS_BY_MOOD.chill)[0];
    return builder('-', mouth, '');
  }

  const eyes = MOCHI_EYES_BY_MOOD[mochiMood] || MOCHI_EYES_BY_MOOD.chill;
  const mouths = MOCHI_MOUTHS_BY_MOOD[mochiMood] || MOCHI_MOUTHS_BY_MOOD.chill;
  const seed = `${mochi.name || 'mochi'}:${species}:${mochi.eye || ''}:${mochi.rarity || ''}:${mochi.interactions || 0}:${mochiMood}:${frame}`;
  const eye = eyes[pickCombo(`${seed}:eye`, eyes.length)] || mochi.eye || '.';
  const mouth = mouths[pickCombo(`${seed}:mouth`, mouths.length)] || '~';
  const accent = MOCHI_ACCENTS[pickCombo(`${seed}:accent`, MOCHI_ACCENTS.length)] || '';
  return builder(eye, mouth, accent);
}

function mochiNeedLine(data: MissionData, needs: MochiNeeds, mochiMood: string) {
  const active = (data.kernelJobs || []).find(job => ['queued', 'delegated', 'running', 'started', 'synthesizing'].includes(String(job.state || '').toLowerCase()));
  const workingAgents = (data.agents || []).filter(agent => agent.status === 'working');
  const hotDivisions = new Set(workingAgents.map(agent => cleanDivisionName(agent.division)));

  if (mochiMood === 'alert') return 'Something needs attention. I am watching failed jobs, dark services, and error agents.';
  if (needs.FOOD < 25) return 'I need food soon, but I am still watching the command spine.';
  if (needs.CLEAN < 25) return 'I need a clean-up soon. Stack telemetry is still live.';
  if (needs.REST < 25) return 'I am tired. A sleep action will bring my focus back up.';
  if (needs.BORED > 78) return 'I need play or a pet. No fake busywork, just real care state.';
  if (active) return `Working: ${compact(active.goal || active.id, 54)} via ${active.route || 'kernel'}.`;
  if (workingAgents.length) return `${workingAgents.length} agents active across ${hotDivisions.size} divisions.`;
  return 'Standing by with memory warm and the stack under watch.';
}

export function MochiNarrator({ data, onNarratorReady }: { data: MissionData; onNarratorReady?: (react: (text: string, mood: NarratorLine['mood']) => void) => void }) {
  const [lines, setLines]     = useState<NarratorLine[]>([]);
  const [face, setFace]       = useState('<✦~✦>');
  const [mood, setMood]       = useState<NarratorLine['mood']>('chill');
  const [mochi, setMochi]     = useState<MochiCompanion | null>(null);
  const [frame, setFrame]     = useState(0);
  const [blink, setBlink]     = useState(false);
  const [action, setAction]   = useState<MochiAction | null>(null);
  const [stuckJobs, setStuckJobs] = useState<string[]>([]);
  const lastAnnouncedOnlineRef = useRef<number | null>(null);

  const push = useCallback((text: string, m: NarratorLine['mood']) => {
    const line: NarratorLine = {
      id: Math.random().toString(36).slice(2),
      ts: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      text, mood: m,
    };
    setLines(prev => [line, ...prev].slice(0, 12));
    setMood(m);
  }, []);

  // Expose `push` to the parent so the chat composer can fire reactions
  // directly (e.g. "going!" when user hits Send, "done in 1.2s!" when
  // the LLM answers, "alert" when the route is in supervised mode and
  // the action is risky). This is what makes Mochi a live reactor
  // instead of a passive narrator.
  useEffect(() => {
    if (onNarratorReady) onNarratorReady(push);
  }, [onNarratorReady, push]);

  const refreshMochi = useCallback(async () => {
    try {
      const res = await fetch('/api/mochi', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setMochi(json);
    } catch {}
  }, []);

  useEffect(() => {
    refreshMochi();
    const t = window.setInterval(refreshMochi, 10_000);
    return () => window.clearInterval(t);
  }, [refreshMochi]);

  useEffect(() => {
    const t = window.setInterval(() => setFrame(f => f + 1), 650);
    return () => window.clearInterval(t);
  }, []);

  // Face animation — blinks periodically, but the FACE itself is now driven
  // PURELY by renderMissionMochiFace (mood + needs + action). The previous
  // version randomly swapped faces every 1.1s, which fought with the
  // mood-based face and made Mochi look like it was just glitching. Now the
  // only randomization is the blink, which is what a real companion does.
  useEffect(() => {
    const t = setInterval(() => setBlink(b => !b), 1100);
    return () => clearInterval(t);
  }, []);

  // Watch data.logs for new events (useMissionData polls every 3s)
  const seenEvents = useRef(new Set<string>());
  useEffect(() => {
    const logs: any[] = data.logs || [];
    logs.slice(0, 15).forEach(log => {
      const key = `${log.type || log.event}:${log.timestamp || log.ts || log.at || ''}`;
      if (seenEvents.current.has(key)) return;
      seenEvents.current.add(key);
      const type = log.type || log.event || '';
      const narration = narrateEvent(type, log);
      if (narration) push(narration.text, narration.mood);
    });
  }, [data.logs, push]);

  // Watch kernel jobs for state changes
  const seenJobStates = useRef<Record<string, string>>({});
  useEffect(() => {
    const jobs: any[] = data.kernelJobs || [];
    jobs.forEach(job => {
      const prev = seenJobStates.current[job.id];
      if (prev !== job.state) {
        seenJobStates.current[job.id] = job.state;
        if (prev) { // only narrate state changes, not initial load
          const narration = narrateEvent(`kernel_${job.state}`, { route: job.route, goal: job.goal, ...job.researchRun });
          if (narration) push(narration.text, narration.mood);
        }
      }
    });
  }, [data.kernelJobs, push]);

  // Watch kernel jobs for stuck/pending jobs
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/service-proxy?port=7780&path=%2Fapi%2Fkernel%2Fjobs%3Flimit%3D10');
        const raw = await res.json();
        const jobs: any[] = raw.data?.jobs || raw.jobs || [];
        const now = Date.now();
        const stuck = jobs.filter(j =>
          ['queued', 'delegated', 'running'].includes(j.state) &&
          j.startedAt && (now - j.startedAt) > 45_000
        );
        if (stuck.length > 0) {
          const newStuck = stuck.map((j: any) => j.id).filter((id: string) => !stuckJobs.includes(id));
          if (newStuck.length > 0) {
            push(`${stuck.length} job${stuck.length > 1 ? 's' : ''} stuck over 45s — ${stuck[0].goal?.slice(0, 40) || stuck[0].id}. needs attention.`, 'alert');
            setStuckJobs(prev => [...prev, ...newStuck]);
          }
        } else {
          setStuckJobs([]);
        }
      } catch {}
    }, 15_000);
    return () => clearInterval(interval);
  }, [push, stuckJobs]);

  // Narrate system state from the SAME core-service count the header uses.
  // Fix for the "0/5 dark" split-brain: never latch on the first poll (boot shows
  // everything offline before the first successful probe), and re-announce only
  // when the count actually changes — so a transient boot state can't stick.
  useEffect(() => {
    if (data.services.some(s => s.status === 'checking')) return;
    const { online, total } = serviceCountLabel(data.services);
    // Suppress the boot-window all-dark cry until at least one real probe lands.
    if (lastAnnouncedOnlineRef.current === null && online === 0) return;
    if (lastAnnouncedOnlineRef.current === online) return;
    lastAnnouncedOnlineRef.current = online;
    const timer = window.setTimeout(() => {
      if (online === total) push(`all ${total} services up. stack is clean.`, 'happy');
      else push(`${online}/${total} services up. ${total - online} dark.`, online > total / 2 ? 'chill' : 'alert');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [data.services, push]);

  const needs = useMemo(() => computeMissionMochiNeeds(mochi), [mochi]);
  const mochiMood = mochiMoodFromReality(data, needs);
  const liveMood = narratorMoodFromMochi(mochiMood);
  const currentColor = MOOD_COLOR[liveMood || mood];
  const currentGlow  = MOOD_GLOW[liveMood || mood];
  const displayFace = renderMissionMochiFace(mochi, mochiMood, frame, blink, action) || face;
  const buddyLine = mochiNeedLine(data, needs, mochiMood);
  const bob = Math.sin(frame / 2) * (action ? 2.5 : 1.25);
  const tilt = Math.sin(frame / 3) * (action ? 3.5 : 1.5);

  const runAction = useCallback(async (nextAction: MochiAction) => {
    if (action || !mochi?.hatched) return;
    setAction(nextAction);
    try {
      const res = await fetch('/api/mochi', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: nextAction }),
      });
      if (res.ok) {
        await refreshMochi();
        push(`${nextAction} registered. bond and needs updated.`, nextAction === 'pet' ? 'happy' : 'chill');
      } else {
        push('mochi action failed. pet state API did not answer.', 'worried');
      }
    } catch {
      push('mochi action failed. pet state API did not answer.', 'worried');
    } finally {
      window.setTimeout(() => setAction(null), 900);
    }
  }, [action, mochi?.hatched, push, refreshMochi]);

  const needBars = [
    { key: 'FOOD', label: 'food', value: needs.FOOD, action: 'feed' as MochiAction },
    { key: 'JOY', label: 'joy', value: needs.JOY, action: 'play' as MochiAction },
    { key: 'CLEAN', label: 'clean', value: needs.CLEAN, action: 'clean' as MochiAction },
    { key: 'REST', label: 'rest', value: needs.REST, action: 'sleep' as MochiAction },
  ];

  return (
    <div className="flex flex-col gap-2">
      {/* Live Mochi companion */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-2xl font-mono transition-all duration-300" style={{ color: currentColor, textShadow: currentGlow, transform: `translateY(${bob}px) rotate(${tilt}deg)` }}>
          {displayFace}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-white/75">{mochi?.name || 'Mochi'}</span>
            <span className="text-[7px] font-mono text-white/20">{mochi?.species || 'unhatched'}</span>
          </div>
          <div className="text-[7px] font-mono uppercase tracking-[0.18em]" style={{ color: currentColor, opacity: 0.7 }}>{mochiMood}</div>
        </div>
        <a href="/mochi" className="ml-auto text-[7px] font-mono text-white/20 hover:text-fuchsia-300 transition-colors">full →</a>
      </div>

      <div className="rounded-lg border border-white/8 bg-black/25 px-2 py-1.5 text-[9px] font-mono leading-relaxed text-white/62">
        {mochi?.hatched ? buddyLine : (mochi?.hint || 'Run purpclaw mochi hatch to hatch a companion.')}
      </div>

      {mochi?.hatched && (
        <div className="rounded-xl border border-white/8 bg-white/[0.025] p-2">
          <div className="grid grid-cols-2 gap-1.5">
            {needBars.map(item => {
              const low = item.key === 'JOY' ? item.value < 35 : item.value < 28;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => runAction(item.action)}
                  disabled={!!action}
                  className={`rounded-lg border bg-black/25 p-1.5 text-left transition-colors ${low ? 'border-amber-300/28 hover:bg-amber-300/10' : 'border-white/8 hover:bg-white/[0.05]'} disabled:opacity-60`}
                  title={`${item.label}: ${item.value}%`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[7px] font-mono uppercase tracking-[0.14em] text-white/35">{item.label}</span>
                    <span className="text-[7px] font-mono text-white/45">{item.value}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full ${low ? 'bg-amber-300' : 'bg-emerald-300'}`} style={{ width: `${item.value}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <button type="button" onClick={() => runAction('pet')} disabled={!!action} className="flex-1 rounded-lg border border-fuchsia-300/18 bg-fuchsia-300/[0.06] px-2 py-1 text-[8px] font-mono uppercase tracking-wider text-fuchsia-100/70 hover:bg-fuchsia-300/12 disabled:opacity-60">
              pet
            </button>
            <div className="rounded-lg border border-white/8 bg-black/25 px-2 py-1 text-[8px] font-mono text-white/35">
              bond {needs.BOND}
            </div>
          </div>
        </div>
      )}

      {/* Narrator feed */}
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {lines.length === 0 && (
          <div className="text-[9px] font-mono text-white/20 italic px-1">watching the stack...</div>
        )}
        {lines.map((line, i) => (
          <div key={line.id} className={`rounded border px-2 py-1 transition-all ${i === 0 ? 'border-opacity-30' : 'border-opacity-10'}`}
            style={{ borderColor: MOOD_COLOR[line.mood], backgroundColor: `${MOOD_COLOR[line.mood]}08` }}
            >
            <div className="flex items-start gap-1.5">
              <span className="text-[7px] font-mono shrink-0 mt-0.5" style={{ color: MOOD_COLOR[line.mood], opacity: 0.6 }}>{line.ts}</span>
              <span className="text-[9px] font-mono text-white/65 leading-relaxed">{line.text}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Stuck job alert */}
      {stuckJobs.length > 0 && (
        <div className="rounded border border-amber-400/30 bg-amber-400/8 px-2 py-1.5">
          <div className="text-[9px] font-mono text-amber-300">⚠ {stuckJobs.length} job{stuckJobs.length > 1 ? 's' : ''} need attention</div>
        </div>
      )}
    </div>
  );
}

type Route = 'chat' | 'plan' | 'kernel' | 'swarm' | 'research' | 'groupchat' | 'mission';
type ComposerMode = 'chat' | 'plan' | 'execute' | 'swarm';
type AccessMode = 'readOnly' | 'review' | 'agentActions' | 'fullSystem';
type MemoryMode = 'off' | 'session' | 'project' | 'persistent';
type ComposerSpeed = 'fast' | 'balanced' | 'deep';
type IntelligenceLevel = 'low' | 'medium' | 'high' | 'extreme';
type ProviderId = 'auto' | 'openai' | 'claude' | 'gemini' | 'deepseek' | 'kimi' | 'qwen' | 'local';
type WorkspaceId = 'dreamforge' | 'omnicode' | 'gotham' | 'openclaw' | 'current' | 'custom';
type AgentId = 'planner' | 'researcher' | 'builder' | 'security' | 'designer' | 'video' | 'audio' | 'custom';
type OperatorContext = {
  composerMode: ComposerMode;
  accessMode: AccessMode;
  memoryMode: MemoryMode;
  workspace: WorkspaceId;
  enabledAgents: AgentId[];
  quickChips: string[];
  modelControl: {
    speed: ComposerSpeed;
    intelligence: IntelligenceLevel;
    provider: ProviderId;
  };
  attachments: { name: string; path: string; kind: string; size: number }[];
  activeContext: { label: string; detail?: string; kind: string }[];
  estimatedTokens: number;
};
type RouteOptions = {
  selectedModels?: string[];
  modelCount?: number;
  fullExecution?: boolean;
  operatorContext?: OperatorContext;
};

interface Msg {
  id: string;
  role: 'user' | 'system' | 'assistant' | 'error';
  route?: Route;
  // For multi-model group chats / research rooms, each model's reply is
  // its own bubble. `model` and `avatar` override the route header so the
  // bubble reads as "<model-name>: <reply>" instead of "<route-name>: <reply>".
  model?: string;
  avatar?: string;
  content: string;
  meta?: string;
  ts: string;
  jobId?: string;
  pending?: boolean;
  // Plan-then-act: when the route is 'plan', the LLM returns a structured
  // plan of steps. We render an approve/reject UI for them. Each step has
  // {index, title, command, route, expected}. The state field tracks
  // approval: 'pending' (default), 'approved' (dispatched), 'rejected'.
  plan?: PlanStep[];
  planState?: 'pending' | 'approved' | 'rejected' | 'executing' | 'done';
  planGoal?: string;
  planStepResults?: { step: PlanStep; ok: boolean; summary: string }[];
  // Tool calls performed by the agent while producing this reply.
  // Rendered as animated ToolCallBadges in the chat bubble.
  toolCalls?: { tool: string; args?: any; status: 'running' | 'success' | 'failure'; result?: string; error?: string; durationMs?: number }[];
}

interface PlanStep {
  index: number;
  title: string;
  command: string;
  route: Route | 'services' | 'training' | 'autoresearch' | 'code';
  expected: string;
}

// Ordered fast→slow — defaults pick top 3 (fastest)
const FREE_MODELS = [
  { id: 'openai/gpt-oss-20b:free',                           name: 'OpenAI gpt-oss-20b',         ctx: '131K', fast: true },
  { id: 'google/gemma-4-26b-a4b-it:free',                    name: 'Google Gemma 4 26B',         ctx: '262K', fast: true },
  { id: 'z-ai/glm-4.5-air:free',                             name: 'Z.ai GLM 4.5 Air',           ctx: '131K', fast: true },
  { id: 'openrouter/owl-alpha',                               name: 'OpenRouter Owl Alpha',       ctx: '131K', fast: true },
  { id: 'moonshotai/kimi-k2.6:free',                         name: 'Kimi K2.6',                  ctx: '262K', fast: false },
  { id: 'google/gemma-4-31b-it:free',                        name: 'Google Gemma 4 31B',         ctx: '262K', fast: false },
  { id: 'poolside/laguna-xs.2:free',                         name: 'Poolside Laguna XS.2',       ctx: '262K', fast: false },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free',               name: 'NVIDIA Nemotron 3 Nano',     ctx: '256K', fast: false },
  { id: 'openrouter/fusion',                                  name: 'OpenRouter Fusion',          ctx: '131K', fast: false },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',name: 'NVIDIA Nemotron Omni',       ctx: '256K', fast: false },
  { id: 'openai/gpt-oss-120b:free',                          name: 'OpenAI gpt-oss-120b',        ctx: '131K', fast: false },
  { id: 'poolside/laguna-m.1:free',                          name: 'Poolside Laguna M.1',        ctx: '262K', fast: false },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free',            name: 'NVIDIA Nemotron 3 Super',    ctx: '1M',   fast: false },
];

const ROUTES: { id: Route; label: string; color: string; api: string; body: (t: string, opts?: RouteOptions) => object }[] = [
  { id: 'chat',      label: 'Chat',         color: 'cyan',    api: '/api/chat',               body: t => ({ message: t, spawnAgents: false, forceDelegate: false, source: 'mission-control' }) },
  { id: 'plan',      label: 'Plan',         color: 'orange',  api: '/api/llm/plan',           body: t => ({ goal: t, modelLimit: 5, source: 'mission-control-plan' }) },
  { id: 'kernel',    label: 'Kernel+Swarm', color: 'violet',  api: '/api/kernel/jobs',        body: t => ({ goal: t, route: 'swarm-coordinator', source: 'chat-room' }) },
  { id: 'groupchat', label: 'Group Chat',   color: 'fuchsia', api: '/api/research/group',     body: (t, opts) => ({ query: t, depth: 1, modelLimit: opts?.modelCount || 5, selectedModels: opts?.selectedModels, kernelJob: true }) },
  { id: 'research',  label: 'Research',     color: 'amber',   api: '/api/research/group',     body: (t, opts) => ({ query: t, kernelJob: true, depth: 2, modelLimit: opts?.modelCount || 6, selectedModels: opts?.selectedModels }) },
  { id: 'swarm',     label: 'Swarm',        color: 'emerald', api: '/api/harness/coordinate', body: t => ({ task: t }) },
  { id: 'mission',   label: 'Mission',      color: 'blue',    api: '/api/orchestrate',        body: t => ({ task: t }) },
];

const C: Record<string, { pill: string; dot: string; text: string; border: string }> = {
  cyan:    { pill: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100',    dot: 'bg-cyan-400',    text: 'text-cyan-300',    border: 'border-cyan-500/40' },
  violet:  { pill: 'border-violet-500/30 bg-violet-500/10 text-violet-100', dot: 'bg-violet-400', text: 'text-violet-300', border: 'border-violet-500/40' },
  fuchsia: { pill: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-100', dot: 'bg-fuchsia-400', text: 'text-fuchsia-300', border: 'border-fuchsia-500/40' },
  amber:   { pill: 'border-amber-500/30 bg-amber-500/10 text-amber-100',  dot: 'bg-amber-400',   text: 'text-amber-300',   border: 'border-amber-500/40' },
  emerald: { pill: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100', dot: 'bg-emerald-400', text: 'text-emerald-300', border: 'border-emerald-500/40' },
  blue:    { pill: 'border-blue-500/30 bg-blue-500/10 text-blue-100',     dot: 'bg-blue-400',    text: 'text-blue-300',    border: 'border-blue-500/40' },
};

const COMPOSER_MODES: { id: ComposerMode; label: string; route: Route; color: string }[] = [
  { id: 'chat', label: 'Chat', route: 'chat', color: 'cyan' },
  { id: 'plan', label: 'Plan', route: 'plan', color: 'amber' },
  { id: 'execute', label: 'Execute', route: 'kernel', color: 'violet' },
  { id: 'swarm', label: 'Swarm', route: 'swarm', color: 'emerald' },
];

const AGENT_TOGGLES: { id: AgentId; label: string }[] = [
  { id: 'planner', label: 'Planner' },
  { id: 'researcher', label: 'Research' },
  { id: 'builder', label: 'Builder' },
  { id: 'security', label: 'Security' },
  { id: 'designer', label: 'Designer' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'custom', label: 'Custom' },
];

const WORKSPACES: { id: WorkspaceId; label: string }[] = [
  { id: 'dreamforge', label: 'DreamForge' },
  { id: 'omnicode', label: 'OmniCode' },
  { id: 'gotham', label: 'Gotham' },
  { id: 'openclaw', label: 'OpenClaw' },
  { id: 'current', label: 'Current Folder' },
  { id: 'custom', label: 'Custom Project' },
];

const QUICK_CHIPS = ['Search', 'Think', 'Research', 'Code', 'Explain', 'Design', 'Debug', 'Write', 'Market', 'Legal', 'OSINT', 'Voice', 'Video', 'Image'];
const SPEEDS: { id: ComposerSpeed; label: string }[] = [{ id: 'fast', label: 'Fast' }, { id: 'balanced', label: 'Balanced' }, { id: 'deep', label: 'Deep' }];
const INTELLIGENCE_LEVELS: { id: IntelligenceLevel; label: string }[] = [{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' }, { id: 'extreme', label: 'Extreme' }];
const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'claude', label: 'Claude' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'kimi', label: 'Kimi' },
  { id: 'qwen', label: 'Qwen' },
  { id: 'local', label: 'Local' },
];

const ACCESS_MODES: { id: AccessMode; label: string; tone: string }[] = [
  { id: 'readOnly', label: 'Read Only', tone: 'border-emerald-500/30 bg-emerald-500/8 text-emerald-200' },
  { id: 'review', label: 'Review', tone: 'border-yellow-500/30 bg-yellow-500/8 text-yellow-200' },
  { id: 'agentActions', label: 'Agent Actions', tone: 'border-orange-500/35 bg-orange-500/10 text-orange-200' },
  { id: 'fullSystem', label: 'Full System', tone: 'border-rose-500/35 bg-rose-500/12 text-rose-200' },
];

const MEMORY_MODES: { id: MemoryMode; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'session', label: 'Session' },
  { id: 'project', label: 'Project' },
  { id: 'persistent', label: 'Persistent' },
];

const DIVISION_COLORS: Record<string, string> = {
  ENGINEERING: '#22d3ee',
  SECURITY: '#fb7185',
  INTELLIGENCE: '#a78bfa',
  INFRASTRUCTURE: '#38bdf8',
  MEDIA_OPS: '#f472b6',
  MANAGEMENT: '#fbbf24',
  SCIENCE: '#34d399',
  CREATIVE: '#fb923c',
  OPERATIONS: '#60a5fa',
  UNASSIGNED: '#94a3b8',
};

function uid()   { return Math.random().toString(36).slice(2, 9); }
function stamp() { return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

function cleanDivisionName(value?: string) {
  return String(value || 'UNASSIGNED').trim().toUpperCase() || 'UNASSIGNED';
}

function compact(value: unknown, max = 64) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function MissionStackGlance({ data }: { data: MissionData }) {
  const liveJobs = (data.kernelJobs || []).slice(0, 5);
  const activeJobs = liveJobs.filter(job => ['queued', 'delegated', 'running', 'started', 'synthesizing'].includes(String(job.state || '').toLowerCase()));
  const latestJob = liveJobs[0] || null;
  const visibleAgents = data.agents || [];
  const divisions = Object.entries(
    visibleAgents.reduce<Record<string, typeof visibleAgents>>((map, agent) => {
      const key = cleanDivisionName(agent.division);
      map[key] = map[key] || [];
      map[key].push(agent);
      return map;
    }, {})
  )
    .map(([division, list]) => ({
      division,
      agents: list,
      working: list.filter(agent => agent.status === 'working').length,
      errors: list.filter(agent => agent.status === 'error').length,
      completed: list.filter(agent => agent.status === 'completed').length,
      color: DIVISION_COLORS[division] || '#94a3b8',
    }))
    .sort((a, b) => b.working - a.working || b.errors - a.errors || b.agents.length - a.agents.length)
    .slice(0, 9);

  const provider = data.llmStatus?.provider;
  const swarm = data.llmStatus?.swarm;
  const fallback = data.llmStatus?.fallback;
  const minimaxReserved = data.llmStatus?.minimax?.reserved;
  const openRouterReady = Boolean(data.researchStatus?.hasKey);
  const researchActive = data.researchStatus?.active || 0;
  const providerSteps = [
    { label: 'Operator', value: activeJobs.length ? `${activeJobs.length} live` : 'waiting', active: activeJobs.length > 0 },
    { label: 'Bus', value: latestJob?.id ? String(latestJob.id).slice(-8) : 'ready', active: Boolean(latestJob) },
    { label: 'Kernel', value: latestJob?.state || 'idle', active: Boolean(latestJob && latestJob.state !== 'completed') },
    { label: 'Router', value: latestJob?.route || 'standing by', active: Boolean(latestJob?.route) },
    { label: 'Divisions', value: `${divisions.filter(d => d.working).length}/${divisions.length}`, active: divisions.some(d => d.working) },
    { label: 'Validate', value: latestJob?.state === 'completed' ? 'passed' : latestJob?.state === 'failed' ? 'failed' : 'armed', active: latestJob?.state === 'completed' },
  ];

  return (
    <section className="sticky top-0 z-20 rounded-2xl border border-cyan-300/10 bg-black/90 p-3 shadow-[0_0_38px_rgba(34,211,238,0.08)] backdrop-blur-xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[8px] font-mono uppercase tracking-[0.26em] text-cyan-300/45">mission spine live</div>
          <div className="mt-1 text-sm font-black tracking-[0.08em] text-white/85">Stack Movement At A Glance</div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[8px] font-mono uppercase tracking-wider">
          <span className={`rounded border px-2 py-1 ${minimaxReserved ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200' : 'border-amber-300/25 bg-amber-300/10 text-amber-200'}`}>
            MiniMax {minimaxReserved ? 'reserved' : 'open'}
          </span>
          <span className={`rounded border px-2 py-1 ${openRouterReady ? 'border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-200' : 'border-amber-300/25 bg-amber-300/10 text-amber-200'}`}>
            OpenRouter {openRouterReady ? `${researchActive} active` : 'not keyed'}
          </span>
          <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-white/35">
            {provider?.provider || 'provider'} → {fallback?.provider || 'fallback'}
          </span>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_1.5fr_1fr]">
        <div className="min-w-0">
          <div className="mb-2 text-[8px] font-mono uppercase tracking-[0.2em] text-white/30">command path</div>
          <div className="grid grid-cols-2 gap-1.5">
            {providerSteps.map(step => (
              <div key={step.label} className={`rounded-lg border px-2 py-1.5 ${step.active ? 'border-cyan-300/25 bg-cyan-300/10' : 'border-white/8 bg-white/[0.025]'}`}>
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${step.active ? 'bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.75)]' : 'bg-white/18'}`} />
                  <span className="text-[8px] font-mono uppercase tracking-wider text-white/35">{step.label}</span>
                </div>
                <div className="mt-1 truncate text-[10px] font-mono text-white/70">{step.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[8px] font-mono uppercase tracking-[0.2em] text-white/30">division load</div>
            <div className="text-[8px] font-mono text-white/25">{visibleAgents.filter(a => a.status === 'working').length} working / {visibleAgents.length} known</div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-3">
            {divisions.map(item => {
              const pct = Math.max(4, Math.round((item.working / Math.max(item.agents.length, 1)) * 100));
              const activeNames = item.agents.filter(agent => agent.status === 'working').slice(0, 2).map(agent => agent.name).join(', ');
              return (
                <div key={item.division} className="rounded-lg border border-white/8 bg-white/[0.025] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-[8px] font-mono uppercase tracking-[0.14em]" style={{ color: item.color }}>{item.division}</div>
                    <div className="text-[9px] font-mono text-white/40">{item.working}/{item.agents.length}</div>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/8">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: item.working ? '#34d399' : item.color }} />
                  </div>
                  <div className="mt-1 truncate text-[8px] font-mono text-white/25">
                    {activeNames || (item.errors ? `${item.errors} errors` : item.completed ? `${item.completed} done` : 'standby')}
                  </div>
                </div>
              );
            })}
            {!divisions.length && <div className="col-span-full rounded-lg border border-white/8 bg-white/[0.025] p-3 text-[10px] text-white/35">No division telemetry yet.</div>}
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 text-[8px] font-mono uppercase tracking-[0.2em] text-white/30">delegation lanes</div>
          <div className="space-y-1.5">
            {liveJobs.slice(0, 4).map(job => {
              const research = job.researchRun;
              const state = String(job.state || 'queued').toLowerCase();
              const tone = state === 'failed' ? 'border-rose-300/25 bg-rose-300/8 text-rose-200' : state === 'completed' ? 'border-emerald-300/25 bg-emerald-300/8 text-emerald-200' : 'border-cyan-300/25 bg-cyan-300/8 text-cyan-200';
              return (
                <div key={job.id} className={`rounded-lg border px-2 py-1.5 ${tone}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[9px] font-mono font-bold">{compact(job.goal || job.id, 44)}</span>
                    <span className="shrink-0 text-[8px] font-mono uppercase">{job.state}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 text-[8px] font-mono text-white/35">
                    <span>{job.route || 'route?'}</span>
                    {job.linkedMissionId && <span>mission {String(job.linkedMissionId).slice(-6)}</span>}
                    {research && <span>OpenRouter {research.successCount || 0}/{research.memberCount || 0}</span>}
                  </div>
                </div>
              );
            })}
            {!liveJobs.length && (
              <div className="rounded-lg border border-white/8 bg-white/[0.025] p-3 text-[10px] text-white/35">
                No kernel delegations yet. Send a kernel, swarm, research, or full chat job to light this up.
              </div>
            )}
            <div className="rounded-lg border border-white/8 bg-white/[0.025] px-2 py-1.5 text-[8px] font-mono text-white/35">
              swarm: {swarm?.provider || 'n/a'}:{swarm?.model || '?'} / research: {data.researchStatus?.provider || 'openrouter'}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ActiveWorkBoard({ data }: { data: MissionData }) {
  const allAgents = data.agents || [];
  const workingAgents = allAgents.filter(agent => agent.status === 'working');
  const errorAgents = allAgents.filter(agent => agent.status === 'error');
  const activeJobs = (data.kernelJobs || [])
    .filter(job => ['queued', 'delegated', 'running', 'started', 'synthesizing'].includes(String(job.state || '').toLowerCase()))
    .slice(0, 4);
  const recentJobs = activeJobs.length ? activeJobs : (data.kernelJobs || []).slice(0, 3);
  const recentAgentEvents = (data.logs || [])
    .filter(log => {
      const text = `${log.type || ''} ${log.source || ''} ${log.message || ''}`.toLowerCase();
      return text.includes('agent.spawned') || text.includes('agent spawned') || text.includes('spawned');
    })
    .slice(0, 5);
  const divisionRows = Object.entries(
    allAgents.reduce<Record<string, typeof allAgents>>((map, agent) => {
      const key = cleanDivisionName(agent.division);
      map[key] = map[key] || [];
      map[key].push(agent);
      return map;
    }, {})
  )
    .map(([division, list]) => ({
      division,
      list,
      working: list.filter(agent => agent.status === 'working'),
      errors: list.filter(agent => agent.status === 'error'),
      completed: list.filter(agent => agent.status === 'completed'),
      color: DIVISION_COLORS[division] || '#94a3b8',
    }))
    .sort((a, b) => b.working.length - a.working.length || b.errors.length - a.errors.length || b.list.length - a.list.length)
    .slice(0, 8);
  const handoffs = (data.delegationStatus?.missions || []).slice(0, 5);
  const activeHandoffs = handoffs.filter(item => item.status !== 'result-posted');
  const latest = recentJobs[0] || null;
  const activityCount = workingAgents.length + activeJobs.length + recentAgentEvents.length + activeHandoffs.length;
  const hotDivisions = divisionRows.filter(row => row.working.length || row.errors.length).slice(0, 3);
  const standbyDivisions = divisionRows.filter(row => !row.working.length && !row.errors.length).slice(0, 4);
  const visibleDivisions = hotDivisions.length ? hotDivisions : standbyDivisions;
  const statusLabel = errorAgents.length ? 'ATTENTION' : activityCount ? 'MOVING' : 'STANDBY';
  const statusTone = errorAgents.length
    ? 'border-rose-300/35 bg-rose-300/12 text-rose-100'
    : activityCount
      ? 'border-emerald-300/35 bg-emerald-300/12 text-emerald-100'
      : 'border-white/10 bg-white/[0.03] text-white/45';

  return (
    <section className={`rounded-xl border p-2 ${statusTone}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[7px] font-mono uppercase tracking-[0.2em] opacity-55">work radar</div>
          <div className="mt-0.5 truncate text-sm font-black tracking-[0.08em]">{statusLabel}</div>
        </div>
        <span className={`h-3 w-3 rounded-full ${activityCount || errorAgents.length ? 'bg-current shadow-[0_0_12px_currentColor]' : 'bg-white/20'}`} />
      </div>

      <div className="mb-2 grid grid-cols-3 gap-1.5">
        <div className="rounded-lg border border-white/10 bg-black/30 p-2 text-center">
          <div className="text-xl font-black leading-none text-white">{workingAgents.length}</div>
          <div className="mt-1 text-[7px] font-mono uppercase tracking-wider text-white/35">working</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/30 p-2 text-center">
          <div className="text-xl font-black leading-none text-white">{visibleDivisions.filter(row => row.working.length || row.errors.length).length}</div>
          <div className="mt-1 text-[7px] font-mono uppercase tracking-wider text-white/35">hot divs</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/30 p-2 text-center">
          <div className="text-xl font-black leading-none text-white">{activeJobs.length}</div>
          <div className="mt-1 text-[7px] font-mono uppercase tracking-wider text-white/35">jobs</div>
        </div>
      </div>

      {latest && (
        <div className="mb-2 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[9px] font-mono font-bold text-cyan-100">{compact(latest.goal || latest.id, 36)}</span>
            <span className="shrink-0 rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[7px] font-mono uppercase text-white/45">{latest.state}</span>
          </div>
          <div className="mt-0.5 truncate text-[7px] font-mono text-white/25">{latest.route || 'route pending'} {latest.linkedMissionId ? `/ mission ${String(latest.linkedMissionId).slice(-6)}` : ''}</div>
        </div>
      )}

      <div className="space-y-2">
        <div>
          <div className="mb-1 text-[7px] font-mono uppercase tracking-[0.18em] text-white/28">departments</div>
          <div className="grid grid-cols-2 gap-1.5">
            {visibleDivisions.map(row => {
              const percent = Math.max(5, Math.round((row.working.length / Math.max(row.list.length, 1)) * 100));
              const tone = row.errors.length ? '#fb7185' : row.working.length ? '#34d399' : row.color;
              return (
                <div key={row.division} className="rounded-lg border border-white/8 bg-black/25 p-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[7px] font-mono uppercase tracking-[0.1em]" style={{ color: tone }}>{row.division}</span>
                    <span className="text-[7px] font-mono text-white/35">{row.working.length}/{row.list.length}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: tone }} />
                  </div>
                </div>
              );
            })}
          </div>
          {workingAgents.slice(0, 3).map(agent => (
            <div key={agent.id} className="mt-1.5 rounded border border-emerald-300/12 bg-emerald-300/[0.04] px-2 py-1">
              <div className="truncate text-[8px] font-mono text-emerald-100/75">{agent.name}</div>
              <div className="truncate text-[7px] font-mono text-white/25">{cleanDivisionName(agent.division)} / {compact(agent.task || agent.role || 'working', 32)}</div>
            </div>
          ))}
        </div>

        {!divisionRows.length && (
          <div className="rounded-lg border border-white/8 bg-white/[0.025] p-2 text-[8px] font-mono text-white/35">
            No division telemetry yet. Agent spawn events will populate this area.
          </div>
        )}

        {!!recentAgentEvents.length && (
          <div className="space-y-1 border-t border-white/6 pt-2">
            <div className="text-[7px] font-mono uppercase tracking-[0.18em] text-white/25">agent pulses</div>
            {recentAgentEvents.slice(0, 2).map(event => (
              <div key={event.id} className="rounded border border-cyan-300/10 bg-cyan-300/[0.035] px-2 py-1">
                <div className="truncate text-[7px] font-mono text-cyan-100/55">{compact(event.message || event.type, 38)}</div>
                <div className="mt-0.5 text-[7px] font-mono text-white/20">{event.source || 'bus'} / {event.timestamp}</div>
              </div>
            ))}
          </div>
        )}

        {!!handoffs.length && (
          <div className="space-y-1 border-t border-white/6 pt-2">
            <div className="text-[7px] font-mono uppercase tracking-[0.18em] text-white/25">owners</div>
            {handoffs.slice(0, 3).map(item => (
              <div key={item.id} className="rounded border border-violet-300/10 bg-violet-300/[0.035] px-2 py-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[7px] font-mono text-violet-100/60">{compact(item.title || item.id, 30)}</span>
                  <span className="shrink-0 text-[7px] font-mono text-white/30">{item.owner}</span>
                </div>
                <div className="mt-0.5 text-[7px] font-mono text-white/22">{item.status}</div>
              </div>
            ))}
          </div>
        )}

        {!!recentJobs.length && (
          <div className="space-y-1 border-t border-white/6 pt-2">
            <div className="text-[7px] font-mono uppercase tracking-[0.18em] text-white/25">delegation queue</div>
            {recentJobs.slice(0, 3).map(job => (
              <div key={job.id} className="flex items-center justify-between gap-2 rounded border border-white/6 bg-black/25 px-2 py-1">
                <span className="truncate text-[7px] font-mono text-white/40">{compact(job.goal || job.id, 28)}</span>
                <span className="shrink-0 text-[7px] font-mono text-white/25">{String(job.state || '').slice(0, 8)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// Auto-router: pick the right mode from what the user actually asked, so the
// stack just begins the work instead of refusing "wrong mode". Order matters —
// most specific intent wins.
function classifyRoute(text: string): Route {
  const t = text.toLowerCase();
  // Acting on its OWN code / stack / files / systems → real tool-using agent
  // (kernel → swarm → tower → OpenClaude with filesystem access). This is the
  // "just go do it" path — catches "go look into ur files", "learn about your
  // systems", "inspect the code", etc. Checked FIRST so self-action never falls
  // through to a plain chat refusal.
  const selfTarget = /\b(your|ur|my|the|its|this|all)\b[\s\S]{0,30}\b(files?|code|codebase|stack|repo(sitory)?|systems?|module|service|directory|folder|logs?|brains?|body)\b/.test(t);
  const actionVerb = /\b(look (into|at|through)|go (look|check|find|read|learn|explore|dig|see)|inspect|read|scan|explore|examine|go through|learn about|map( out)?|trace|review|analy[sz]e|check( out)?|dig into|investigate|understand|audit)\b/.test(t);
  if (selfTarget && actionVerb) return 'kernel';
  if (/\b(group ?chat|ask the (models|room)|debate|panel|consensus|poll the models|what do the models)\b/.test(t)) return 'groupchat';
  if (/\b(mission|orchestrate|end[- ]to[- ]end|full build|ship it|deploy|release)\b/.test(t)) return 'mission';
  if (/\b(swarm|whole team|all (the )?agents|divide and conquer|parallel(ize)?|multi[- ]?agent)\b/.test(t)) return 'swarm';
  if (/\b(build|implement|fix|refactor|create|add (a |the )?feature|write (the )?code|audit|run tests?|debug|wire|patch|optimi[sz]e|migrate)\b/.test(t)) return 'kernel';
  // Web/topic research (only when NOT about its own stack)
  if (!selfTarget && /\b(research|look ?up|find out|sources?|cite|latest on|news on|deep[- ]?dive)\b/.test(t)) return 'research';
  // Generic action verb with no clear target still goes to the executor, not chat
  if (actionVerb) return 'kernel';
  return 'chat';
}

export function CommandPanel({ data }: { data: MissionData }) {
  const [route, setRoute]   = useState<Route>('chat');
  const [autoRoute, setAutoRoute] = useState(true); // auto-pick mode from the request
  const selectedRouteRef = useRef<Route>('chat');
  selectedRouteRef.current = route;
  const [input, setInput]   = useState('');
  const [drafts, setDrafts] = useState<Record<Route, string>>({ chat: '', plan: '', kernel: '', swarm: '', research: '', groupchat: '', mission: '' });
  const [busy,  setBusy]    = useState(false);
  const [fullExecution, setFullExecution] = useState(true);
  const [governanceMode, setGovernanceMode] = useState<'supervised' | 'autonomous'>('supervised');
  const [composerMode, setComposerModeState] = useState<ComposerMode>('chat');
  const [accessMode, setAccessMode] = useState<AccessMode>('agentActions');
  const [memoryMode, setMemoryMode] = useState<MemoryMode>('project');
  const [workspace, setWorkspace] = useState<WorkspaceId>('current');
  const [composerSpeed, setComposerSpeed] = useState<ComposerSpeed>('balanced');
  const [intelligence, setIntelligence] = useState<IntelligenceLevel>('high');
  const [provider, setProvider] = useState<ProviderId>('auto');
  const [enabledAgents, setEnabledAgents] = useState<AgentId[]>(['planner', 'builder']);
  const [quickChips, setQuickChips] = useState<string[]>([]);
  const [launcherOpen, setLauncherOpen] = useState(false);
  // Group chat model selector — up to 6 models + the user
  // Default to 3 fastest models
  const [selectedModels, setSelectedModels] = useState<string[]>(FREE_MODELS.filter(m => m.fast).slice(0, 3).map(m => m.id));
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const mochiReactRef = useRef<((text: string, mood: 'happy' | 'alert' | 'curious' | 'proud' | 'worried' | 'chill') => void) | null>(null);
  const setMochiReact = useCallback((react: (text: string, mood: 'happy' | 'alert' | 'curious' | 'proud' | 'worried' | 'chill') => void) => {
    mochiReactRef.current = react;
  }, []);
  const mochiReact = useCallback((text: string, mood: 'happy' | 'alert' | 'curious' | 'proud' | 'worried' | 'chill') => {
    if (mochiReactRef.current) mochiReactRef.current(text, mood);
  }, []);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textRef   = useRef<HTMLTextAreaElement>(null);

  // ── Drag-and-drop attachments — any file type. Dropped bytes are uploaded to
  // agent_work/uploads (inside the agent-mounted god folder) so chat/swarm/
  // group-chat/agents can all read them by absolute path.
  type Attachment = { name: string; path: string; kind: string; size: number; preview?: string };
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const uploadFiles = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    if (!arr.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of arr) fd.append('files', f);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const j = await res.json();
      if (j.ok) {
        const ok = (j.files || []).filter((f: any) => f.ok);
        setAttachments(prev => [...prev, ...ok.map((f: any) => ({ name: f.name, path: f.path, kind: f.kind, size: f.size, preview: f.preview || '' }))]);
      }
    } catch {} finally { setUploading(false); }
  };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files); };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); if (!dragging) setDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); };

  // ── Persist + restore: every message is logged, every draft is per-mode.
  // Two localStorage keys: messages (append-only log, survives refresh)
  // and drafts (one input draft per route, so switching modes never loses
  // what the user was typing). All writes are best-effort and silent.
  const LS_KEY_MESSAGES = 'purpclaw.chat.messages.v1';
  const LS_KEY_DRAFTS   = 'purpclaw.chat.drafts.v1';
  const LS_KEY_SETTINGS = 'purpclaw.chat.settings.v1';

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_KEY_MESSAGES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {}
    try {
      const raw = window.localStorage.getItem(LS_KEY_DRAFTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') setDrafts(d => ({ ...d, ...parsed }));
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(LS_KEY_MESSAGES, JSON.stringify(messages.slice(-500))); } catch {}
  }, [messages, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(LS_KEY_DRAFTS, JSON.stringify(drafts)); } catch {}
  }, [drafts, hydrated]);

  // Switching mode: pull that mode's draft into the textarea, save what was
  // there back into the previous mode's slot. The user never loses typing.
  const switchRoute = (next: Route) => {
    setAutoRoute(false); // picking a mode explicitly turns off auto-routing
    if (next === route) return;
    setDrafts(d => ({ ...d, [route]: input }));
    const restored = drafts[next] ?? '';
    setInput(restored);
    setRoute(next);
    setTimeout(() => textRef.current?.focus(), 60);
  };

  const setComposerMode = (next: ComposerMode) => {
    const config = COMPOSER_MODES.find(m => m.id === next);
    setComposerModeState(next);
    if (config) switchRoute(config.route);
  };

  const toggleAgent = (id: AgentId) => {
    setEnabledAgents(prev => prev.includes(id) ? prev.filter(agent => agent !== id) : [...prev, id]);
  };

  const toggleQuickChip = (label: string) => {
    setQuickChips(prev => prev.includes(label) ? prev.filter(chip => chip !== label) : [...prev, label]);
    const lower = label.toLowerCase();
    if (lower === 'research' || lower === 'osint') switchRoute('research');
    if (lower === 'code' || lower === 'debug') switchRoute('kernel');
    if (lower === 'design' || lower === 'image' || lower === 'video') setEnabledAgents(prev => prev.includes('designer') ? prev : [...prev, 'designer']);
    if (lower === 'voice' || lower === 'audio') setEnabledAgents(prev => prev.includes('audio') ? prev : [...prev, 'audio']);
  };

  const chooseLauncherAction = (kind: 'file' | 'folder' | 'image' | 'audio' | 'video' | 'url' | 'clipboard' | 'recent' | 'workspace' | 'project' | 'document' | 'saved' | 'agent' | 'skill' | 'action' | 'repo' | 'web' | 'research' | 'genImage' | 'genVideo' | 'genAudio') => {
    if (kind === 'repo') toggleQuickChip('Search');
    if (kind === 'web') toggleQuickChip('Search');
    if (kind === 'research') toggleQuickChip('Research');
    if (kind === 'genImage') toggleQuickChip('Image');
    if (kind === 'genVideo') toggleQuickChip('Video');
    if (kind === 'genAudio') toggleQuickChip('Audio');
    if (kind === 'agent') setEnabledAgents(prev => prev.includes('custom') ? prev : [...prev, 'custom']);
    if (kind === 'workspace') setWorkspace('current');
    if (kind === 'project') setMemoryMode('project');
    if (kind === 'saved') setMemoryMode('persistent');
    if (kind === 'action') setComposerMode('execute');
    setLauncherOpen(false);
    setTimeout(() => textRef.current?.focus(), 60);
  };

  const setInputForRoute = (val: string) => {
    setInput(val);
    setDrafts(d => ({ ...d, [route]: val }));
  };

  const exportLog = () => {
    try {
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), messages }, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `purpclaw-chat-${Date.now()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {}
  };

  const clearHistory = () => {
    if (!window.confirm(`Clear ${messages.length} messages from this chat log? This cannot be undone.`)) return;
    setMessages([]);
    try { window.localStorage.removeItem(LS_KEY_MESSAGES); } catch {}
  };

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('purpclaw.executionMode');
      if (saved === 'chat-only') setFullExecution(false);
      if (saved === 'full') setFullExecution(true);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('purpclaw.executionMode', fullExecution ? 'full' : 'chat-only');
    } catch {}
  }, [fullExecution]);

  useEffect(() => {
    fetch('/api/service-proxy?port=7780&path=%2Fapi%2Fgovernance%2Fpolicy')
      .then(r => r.ok ? r.json() : null)
      .then(raw => {
        const mode = raw?.data?.policy?.mode || raw?.policy?.mode;
        if (mode === 'supervised' || mode === 'autonomous') setGovernanceMode(mode);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Robust auto-scroll: scroll the container directly, not the last child.
    // scrollIntoView on a child is unreliable in flex layouts with overflow
    // containers — the parent sometimes doesn't scroll. Setting
    // scrollTop = scrollHeight works in every case. Use 'auto' (not smooth)
    // so streaming messages don't queue up smooth-scrolls behind each other.
    const el = scrollContainerRef.current;
    if (!el) return;
    // Only auto-scroll if user is near the bottom (within 120px) so we
    // don't yank the viewport when the user has scrolled up to read history.
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 120) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, busy]);

  useEffect(() => {
    // While a job is streaming, the busy indicator or pending message
    // grows in place. Track those mutations separately so the auto-scroll
    // still catches them even if the user is reading.
    if (!busy) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 240) el.scrollTop = el.scrollHeight;
  }, [busy]);

  // Detect when user scrolls up — show a "jump to latest" pill so they can
  // come back without losing the message they were reading.
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowJumpToLatest(dist > 240);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  const jumpToLatest = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const push = useCallback((msg: Omit<Msg, 'id' | 'ts'>) => {
    setMessages(prev => [...prev, { ...msg, id: uid(), ts: stamp() }]);
  }, []);

  const updateMsg = useCallback((id: string, patch: Partial<Msg>) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  }, []);

  // ── PLAN: execute / reject ────────────────────────────────────────────────
  // Map a step's route to the API endpoint + body shape. The body shape
  // matches what `send()` builds for that route.
  const PLAN_ROUTE_TO_API: Record<string, { api: string; buildBody: (cmd: string) => object }> = {
    chat:        { api: '/api/chat',             buildBody: cmd => ({ message: cmd, spawnAgents: false, source: 'plan-step' }) },
    kernel:      { api: '/api/kernel/jobs',      buildBody: cmd => ({ goal: cmd, route: 'swarm-coordinator', source: 'plan-step' }) },
    groupchat:   { api: '/api/research/group',   buildBody: cmd => ({ query: cmd, depth: 1, modelLimit: 5, kernelJob: true, source: 'plan-step' }) },
    research:    { api: '/api/research/group',   buildBody: cmd => ({ query: cmd, kernelJob: true, depth: 2, modelLimit: 6, source: 'plan-step' }) },
    swarm:       { api: '/api/harness/coordinate', buildBody: cmd => ({ task: cmd, source: 'plan-step' }) },
    mission:     { api: '/api/orchestrate',      buildBody: cmd => ({ task: cmd, source: 'plan-step' }) },
    // "Shell" routes — talk to the kernel/tooling directly, not the LLM chat.
    code:        { api: '/api/proxy',            buildBody: cmd => ({ tool: 'code.search', args: { query: cmd }, source: 'plan-step' }) },
    services:    { api: '/api/services/registry',buildBody: cmd => ({ filter: cmd, source: 'plan-step' }) },
    training:    { api: '/api/proxy',            buildBody: cmd => ({ tool: 'training.export', args: { format: cmd || 'jsonl' }, source: 'plan-step' }) },
    autoresearch:{ api: '/api/proxy',            buildBody: cmd => ({ tool: 'autoresearch.run', args: { goal: cmd }, source: 'plan-step' }) },
  };

  const rejectPlan = useCallback((msgId: string) => {
    updateMsg(msgId, { planState: 'rejected' });
  }, [updateMsg]);

  // SSE swarm stream. POSTs to /api/chat/swarm with Accept: text/event-stream.
  // Each agent gets its own bubble; synthesis gets its own bubble; a
  // final summary bubble marks completion.
  const streamSwarmSend = useCallback(async (msgId: string, body: any) => {
    const setMeta = (m: string) => updateMsg(msgId, { meta: m });
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    try {
      const res = await fetch('http://localhost:7780/api/chat/swarm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({ message: body.message || body.goal || '', agents: body.agents }),
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => '');
        updateMsg(msgId, { meta: `error: HTTP ${res.status}: ${txt.slice(0, 200)}` });
        return;
      }
      reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const agentBubbles = new Map<string, string>();
      const tokenBodies: Record<string, string> = {};
      let synthesisMsgId: string | null = null;
      setMeta('🧬 spawning agents…');

      const onEvent = (ev: string, data: any) => {
        if (ev === 'phase') {
          if (data.phase === 'received')         setMeta(`🧬 received · ${data.agentCount} agents`);
          else if (data.phase === 'spawning')   setMeta('🧬 agents starting in parallel…');
          else if (data.phase === 'synthesizing') setMeta(`🧬 synthesizing (${data.succeeded}/${data.total} agents succeeded)…`);
          else if (data.phase === 'done')         setMeta('✓ swarm done');
        } else if (ev === 'agent') {
          if (!agentBubbles.has(data.id)) {
            const newId = uid();
            agentBubbles.set(data.id, newId);
            setMessages(prev => [...prev, {
              id: newId, role: 'assistant', route: 'swarm',
              model: data.role || data.id, avatar: '🧬',
              content: '', meta: `${data.role} · started`, ts: stamp(), pending: true,
            }]);
          }
        } else if (ev === 'token') {
          const agentId = data.agentId;
          const isSyn = agentId === 'synthesizer';
          if (isSyn && !synthesisMsgId) {
            const newId = uid();
            synthesisMsgId = newId;
            setMessages(prev => [...prev, {
              id: newId, role: 'assistant', route: 'swarm',
              model: 'Synthesis', avatar: '🧠',
              content: '', meta: 'synthesizer', ts: stamp(), pending: true,
            }]);
          }
          const targetId = isSyn ? synthesisMsgId : agentBubbles.get(agentId);
          if (targetId) {
            const prev = tokenBodies[agentId] || '';
            const next = prev + (data.content || '');
            tokenBodies[agentId] = next;
            updateMsg(targetId, { content: next });
          }
        } else if (ev === 'agent_done') {
          const id = agentBubbles.get(data.id);
          if (id) {
            updateMsg(id, {
              meta: `${data.role} · ${data.ok ? '✓ done' : '✗ ' + (data.error || 'error')} · ${data.elapsed}ms`,
              pending: false,
            });
          }
        } else if (ev === 'synthesis') {
          if (!synthesisMsgId) {
            const newId = uid();
            synthesisMsgId = newId;
            setMessages(prev => [...prev, {
              id: newId, role: 'assistant', route: 'swarm',
              model: 'Synthesis', avatar: '🧠',
              content: data.content || '', meta: 'synthesis', ts: stamp(),
            }]);
          } else {
            updateMsg(synthesisMsgId, { content: data.content || '', pending: false });
          }
        } else if (ev === 'done') {
          const successCount = (data.agents || []).filter((a: any) => a.ok).length;
          setMessages(prev => [...prev, {
            id: uid(), role: 'system', route: 'swarm',
            avatar: successCount > 0 ? '✅' : '⚠️',
            content: `Swarm finished: ${successCount}/${(data.agents||[]).length} agents succeeded.`,
            meta: `total ${data.totalElapsed}ms · judge: ${data.synthesis?.model || 'self'}`,
            ts: stamp(),
          }]);
        } else if (ev === 'error') {
          setMeta('error: ' + (data.error || 'unknown'));
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
          if (block.startsWith(':')) continue;
          let ev = 'message', data = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) ev = line.slice(6).trim();
            else if (line.startsWith('data:')) data += (data ? '\n' : '') + line.slice(5).trim();
          }
          if (!data) continue;
          try { onEvent(ev, JSON.parse(data)); } catch { /* skip */ }
        }
      }
    } catch (e: any) {
      setMeta('error: ' + (e?.message || 'stream failed'));
    } finally {
      try { if (reader) await reader.cancel(); } catch {}
    }
  }, [updateMsg, setMessages, uid, stamp]);

  const streamPlanSend = useCallback(async (msgId: string, body: any) => {
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    try {
      const res = await fetch('/api/llm/plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({ ...body, mode: body.mode || 'single' }),
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => '');
        updateMsg(msgId, { meta: `error: HTTP ${res.status}: ${txt.slice(0, 200)}` });
        return;
      }
      reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let liveTokens = '';
      const onEvent = (event: string, data: any) => {
        if (event === 'phase') {
          if (data.phase === 'search')      updateMsg(msgId, { meta: '🔍 searching codebase…' });
          else if (data.phase === 'propose') updateMsg(msgId, { meta: '🧠 proposing plan…' });
          else if (data.phase === 'merge')   updateMsg(msgId, { meta: `🧬 merging (judge: ${data.judge || '?'})…` });
          else if (data.phase === 'fanout')  updateMsg(msgId, { meta: `📡 fan-out to ${(data.candidates || []).length} models…` });
        } else if (event === 'context') {
          const n = data.count || 0;
          updateMsg(msgId, { meta: `🔍 found ${n} relevant files · thinking…` });
        } else if (event === 'token') {
          liveTokens += data.content;
          updateMsg(msgId, { content: `Planning: "${(body.message || '').slice(0, 200)}"\n\n${liveTokens.slice(-600)}` });
        } else if (event === 'proposal') {
          const okMark = data.ok ? '✓' : '✗';
          updateMsg(msgId, { meta: `📡 ${data.model}: ${okMark} ${data.elapsed || 0}ms` });
        } else if (event === 'merged') {
          updateMsg(msgId, {
            plan: data.steps,
            planState: 'pending',
            planGoal: body.message,
            meta: `${data.steps?.length || 0} steps · judge: ${data.judge || 'self'}`,
          });
        } else if (event === 'done') {
          updateMsg(msgId, { meta: `✓ plan complete · ${data.stepCount} steps` });
        } else if (event === 'error') {
          updateMsg(msgId, { meta: 'error: ' + (data.error || 'unknown') });
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // Parse SSE: events are `event: <name>\ndata: <json>\n\n`
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          // Handle SSE comments (lines starting with `:`)
          if (block.startsWith(':')) continue;
          let ev = 'message';
          let data = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) ev = line.slice(6).trim();
            else if (line.startsWith('data:')) data += (data ? '\n' : '') + line.slice(5).trim();
          }
          if (!data) continue;
          try { onEvent(ev, JSON.parse(data)); }
          catch { /* malformed line — skip */ }
        }
      }
    } catch (e: any) {
      updateMsg(msgId, { meta: 'error: ' + (e?.message || 'stream failed') });
    } finally {
      try { if (reader) await reader.cancel(); } catch {}
    }
  }, [updateMsg]);

  // SSE reader helper — used by both streamPlanSend and streamChatSend.
  const streamReadSSE = useCallback(async (res: Response, onEvent: (ev: string, data: any) => void) => {
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
          if (block.startsWith(':')) continue;
          let ev = 'message', data = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) ev = line.slice(6).trim();
            else if (line.startsWith('data:')) data += (data ? '\n' : '') + line.slice(5).trim();
          }
          if (!data) continue;
          try { onEvent(ev, JSON.parse(data)); } catch { /* skip */ }
        }
      }
    } finally {
      try { await reader.cancel(); } catch {}
    }
  }, []);

  // Streaming chat send. POSTs to the unified_api directly on port 7780
  // (bypassing the service-proxy, which buffers responses). Backend
  // emits: phase, token, done, error.
  const streamChatSend = useCallback(async (msgId: string, apiPath: string, body: any) => {
    const res = await fetch(`http://127.0.0.1:7780${apiPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => '');
      updateMsg(msgId, { content: `error: HTTP ${res.status}: ${txt.slice(0, 200)}`, meta: 'stream failed', pending: false });
      return;
    }
    let fullReply = '';
    let model = '';
    await streamReadSSE(res, (ev, data) => {
      if (ev === 'phase') {
        if (data.phase === 'thinking')   updateMsg(msgId, { meta: '🧠 thinking…' });
        else if (data.phase === 'done')   updateMsg(msgId, { meta: '✓ done' });
        else if (data.phase === 'error')  updateMsg(msgId, { meta: 'error', pending: false });
      } else if (ev === 'token') {
        fullReply += data.content || '';
        model = data.model || model;
        updateMsg(msgId, { content: fullReply, meta: `streaming · ${model}`, pending: true });
      } else if (ev === 'tool-call') {
        // Animate a new tool badge in
        const tc = {
          tool: data.tool,
          args: data.args,
          status: 'running' as const,
        };
        const existing = (messages.find(m => m.id === msgId)?.toolCalls) || [];
        updateMsg(msgId, { toolCalls: [...existing, tc] });
      } else if (ev === 'tool-result') {
        // Mark the last running call as success/failure
        const current = messages.find(m => m.id === msgId)?.toolCalls || [];
        const updated = current.map((c, i) => i === current.length - 1
          ? { ...c, status: data.ok ? 'success' as const : 'failure' as const, result: data.content, error: data.error, durationMs: data.durationMs }
          : c);
        updateMsg(msgId, { toolCalls: updated });
      } else if (ev === 'done') {
        const reply = (data && data.reply) || fullReply;
        const toolCalls = (data && data.tool_calls) || [];
        updateMsg(msgId, {
          content: reply,
          model: (data && data.model) || model || 'Quill',
          meta: [data?.providerStatus, data?.model].filter(Boolean).join(' · '),
          pending: false,
          toolCalls: toolCalls.length > 0
            ? toolCalls.map((tc: any) => ({
                tool: tc.tool,
                args: tc.args,
                status: 'success' as const,
                result: tc.content,
              }))
            : undefined,
        });
      } else if (ev === 'error') {
        updateMsg(msgId, { content: 'error: ' + (data?.error || 'unknown'), meta: 'stream error', pending: false });
      }
    });
  }, [updateMsg, streamReadSSE]);

  const executePlan = useCallback(async (msgId: string, steps: PlanStep[]) => {
    updateMsg(msgId, { planState: 'executing', planStepResults: [] });
    const results: { step: PlanStep; ok: boolean; summary: string }[] = [];
    for (const step of steps) {
      const mapping = PLAN_ROUTE_TO_API[step.route];
      if (!mapping) {
        results.push({ step, ok: false, summary: `no API mapping for route "${step.route}"` });
        updateMsg(msgId, { planStepResults: [...results] });
        continue;
      }
      try {
        const res = await fetch(mapping.api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mapping.buildBody(step.command)),
        });
        const json = await res.json().catch(() => ({}));
        const ok = !!(res.ok && (json.ok !== false) && !json.error);
        const summary = ok
          ? (json.reply?.slice(0, 200) || json.synthesis?.slice(0, 200) || json.summary?.slice(0, 200) || `${step.route} dispatched`)
          : (json.error || `HTTP ${res.status}`).slice(0, 200);
        results.push({ step, ok, summary });
      } catch (e: any) {
        results.push({ step, ok: false, summary: 'network: ' + (e?.message || 'fetch failed') });
      }
      updateMsg(msgId, { planStepResults: [...results] });
    }
    updateMsg(msgId, { planState: 'done' });
    // Surface a brief completion line as a system bubble so it's not
    // hidden inside the plan card.
    const successCount = results.filter(r => r.ok).length;
    push({
      role: 'system',
      route: 'plan',
      avatar: successCount === steps.length ? '✅' : '⚠️',
      content: `Plan finished: ${successCount}/${steps.length} steps succeeded.\n${results.filter(r => !r.ok).map(r => `  ✗ ${r.step.title}: ${r.summary}`).join('\n')}`,
      meta: `plan ${msgId.slice(-6)}`,
    });
  }, [updateMsg, push]);

  // Poll a kernel job until it completes. On completion, REPLACE the
  // placeholder message with per-model bubbles + synthesis (the "real
  // chat room" feel). The original placeholder gets removed.
  const pollJob = useCallback(async (jobId: string, msgId: string) => {
    const maxPolls = 60;
    for (let i = 0; i < maxPolls; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const res = await fetch(`/api/service-proxy?port=7780&path=${encodeURIComponent(`/api/kernel/jobs/${jobId}`)}`);
        const raw = await res.json();
        const job = raw.data?.job ?? raw.job ?? raw.data ?? raw;
        if (['completed', 'failed', 'blocked'].includes(job.state)) {
          // Find the placeholder's route so we can label the new bubbles
          // consistently. We need the route to know whether to use the
          // groupchat (🤖) or research (🔬) avatar.
          setMessages(prev => {
            const placeholder = prev.find(m => m.id === msgId);
            const placeholderRoute = placeholder?.route;
            const placeholderModel = placeholder?.model;
            const without = prev.filter(m => m.id !== msgId);
            const additions: typeof prev = [];

            if (job.researchRun?.members && job.researchRun.members.length) {
              // Multi-model — push one bubble per answering model.
              for (const member of job.researchRun.members.filter((m: any) => m.status === 'ok')) {
                const modelId = member.model || 'unknown';
                const name = member.name || modelId.split('/').pop() || modelId;
                additions.push({
                  id: uid(),
                  role: 'assistant',
                  route: placeholderRoute,
                  model: name,
                  avatar: placeholderRoute === 'research' ? '🔬' : '🤖',
                  content: member.answer || '(no answer)',
                  meta: `${modelId} · ${(member.answer || '').split(/\s+/).filter(Boolean).length} words`,
                  ts: stamp(),
                });
              }
              if (job.researchRun.synthesis) {
                additions.push({
                  id: uid(),
                  role: 'assistant',
                  route: placeholderRoute,
                  model: 'Synthesis',
                  avatar: '🧠',
                  content: job.researchRun.synthesis,
                  meta: `${job.researchRun.successCount}/${job.researchRun.memberCount} models · ${job.researchRun.freeModelCount} free`,
                  ts: stamp(),
                });
              }
            } else {
              // Single-result job (kernel, mission, etc.) — keep the
              // original "one big reply" model. Just update the placeholder.
              const report = job.finalReport || job.researchRun?.synthesis || `Job ${job.state}`;
              const modelInfo = job.researchRun ? `${job.researchRun.successCount}/${job.researchRun.memberCount} models answered` : '';
              additions.push({
                id: uid(),
                role: 'assistant',
                route: placeholderRoute,
                model: placeholderModel,
                avatar: placeholderModel ? '🟣' : undefined,
                content: report,
                meta: [job.state, modelInfo].filter(Boolean).join(' · '),
                ts: stamp(),
              });
            }
            return [...without, ...additions];
          });
          return;
        }
      } catch {}
    }
    updateMsg(msgId, { content: 'Job timed out — check kernel jobs panel', pending: false });
  }, [updateMsg]);

  const send = async () => {
    const text = input.trim();
    if ((!text && !attachments.length) || busy) return;
    // Shadow `route` with the effective mode: when AUTO is on, classify the
    // request and route to the right backend instead of refusing in the wrong
    // mode. All dispatch + response handling below uses this local.
    const route: Route = autoRoute ? classifyRoute(text) : selectedRouteRef.current;
    setInput('');
    setDrafts(d => ({ ...d, [selectedRouteRef.current]: '' }));
    setBusy(true);

    // Mochi reacts the instant the user hits Send — not waiting for the
    // backend. This is the "live reactor" part: she acknowledges the
    // action immediately, with a mood that matches the chosen route.
    const routeMoods: Record<Route, [string, NarratorLine['mood']]> = {
      chat:       ['ok, going!',                                              'happy'],
      plan:       ['planning pass first. mapping the moves...',                'curious'],
      kernel:     ['kernel job incoming. swarm is on it.',                    'curious'],
      groupchat:  [`asking ${selectedModels.length} models to weigh in...`,   'curious'],
      research:   ['deep research — sources first, then models. hang tight.', 'curious'],
      swarm:      ['swarming. decomposing your goal into subtasks...',         'curious'],
      mission:    ['mission accepted. orchestrator is planning...',           'proud'],
    };
    const [reactText, reactMood] = routeMoods[route] || routeMoods.chat;
    mochiReact(reactText, reactMood);
    const t0 = Date.now();

    // Fold any dropped files into the outgoing payload as real, agent-readable
    // absolute paths (+ a short preview for text), so every route — chat, swarm,
    // group chat, research, mission — receives what the operator handed over.
    const attachmentBlock = attachments.length
      ? '\n\n[OPERATOR ATTACHED FILES — you have filesystem access; read them at these absolute paths:]\n' +
        attachments.map(a =>
          `• ${a.name} (${a.kind}, ${a.size}B) → ${a.path}` +
          (a.preview ? `\n  --- preview of ${a.name} ---\n${a.preview.slice(0, 1500)}\n  --- end preview ---` : '')
        ).join('\n')
      : '';
    const contextBlock = '\n\n[PURPCLAW OPERATOR CONTEXT]\n' +
      `Mode: ${composerMode}\n` +
      `Access: ${accessMode}\n` +
      `Workspace: ${workspace}\n` +
      `Memory: ${memoryMode}\n` +
      `Model control: provider=${provider}; speed=${composerSpeed}; intelligence=${intelligence}\n` +
      `Enabled agents: ${enabledAgents.length ? enabledAgents.join(', ') : 'none'}\n` +
      `Quick chips: ${quickChips.length ? quickChips.join(', ') : 'none'}\n` +
      `Visible active context: ${activeContext.map(item => `${item.kind}:${item.label}`).join(' | ')}\n` +
      `Estimated input tokens: ${estimatedTokens}`;
    const outText = `${text}${attachmentBlock}${contextBlock}`.trim();
    const shownText = text + (attachments.length ? `\n📎 ${attachments.map(a => a.name).join(', ')}` : '');
    push({ role: 'user', route, content: shownText });
    const sentAttachments = attachments;
    setAttachments([]);

    const r = ROUTES.find(r => r.id === route)!;
    const opts: RouteOptions = {
      fullExecution,
      operatorContext,
      ...((route === 'groupchat' || route === 'research') ? { selectedModels, modelCount: selectedModels.length } : {}),
    };

    try {
      const proxyUrl = `/api/service-proxy?port=7780&path=${encodeURIComponent(r.api)}`;
      const body = r.body(outText, opts) as Record<string, any>;
      body.operatorContext = operatorContext;

      // For chat: use SSE streaming so tokens appear in real-time
      if (route === 'chat') {
        const chatMsgId = uid();
        setMessages(prev => [...prev, {
          id: chatMsgId,
          role: 'assistant',
          route,
          model: 'Quill',
          avatar: '✒️',
          content: '',
          meta: 'thinking…',
          ts: stamp(),
          pending: true,
        }]);
        setBusy(false);
        // Fire-and-forget stream reader
        streamChatSend(chatMsgId, r.api, body).catch(e => {
          updateMsg(chatMsgId, { content: 'error: ' + e.message, meta: 'stream failed', pending: false });
        });
        return;
      }

      const res  = await fetch(proxyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      // Defensive: upstream may return HTML (404 page) instead of JSON
      const rawText = await res.text();
      let raw: any;
      try {
        raw = JSON.parse(rawText);
      } catch {
        throw new Error(`${r.label} returned non-JSON (HTTP ${res.status}): ${rawText.slice(0, 120)}`);
      }
      const json = raw.data ?? raw;

      let content = '';
      let meta    = '';
      let jobId: string | undefined;
      let pending = false;

      if ((route as any) === 'chat') {
        content = json.reply || json.response || 'Received.';
        if (json.kernelJobId) meta = `kernel ${String(json.kernelJobId).slice(-10)}`;
        else meta = [json.note, json.executionMode].filter(Boolean).join(' · ') || json.providerStatus || '';

      } else if (route === 'plan') {
        // Plan-then-act with SSE streaming. The backend emits token events
        // and phase events. We update the same message bubble as tokens
        // arrive so the user sees the plan being thought through.
        const planMsgId = uid();
        setMessages(prev => [...prev, {
          id: planMsgId,
          role: 'assistant',
          route: 'plan',
          model: 'Quill Plan',
          avatar: '🧭',
          content: `Planning: "${(body.message || '').slice(0, 200)}"`,
          meta: 'thinking…',
          ts: stamp(),
          plan: undefined,
          planState: 'pending',
          planGoal: body.message,
        }]);
        setBusy(false);
        // Fire-and-forget: stream updates the message in place
        streamPlanSend(planMsgId, body).catch(e => {
          updateMsg(planMsgId, { meta: 'error: ' + e.message });
        });
        return;

      } else if (route === 'kernel') {
        const job = json.job || json;
        jobId = job.id;
        content = `Kernel job created → swarm delegating...`;
        meta = `${job.route} · ${job.id?.slice(-10)}`;
        pending = true;
        if (jobId) {
          const msgId = uid();
          setMessages(prev => [...prev, { id: msgId, role: 'assistant', route, content, meta, ts: stamp(), jobId, pending }]);
          pollJob(jobId, msgId);
          setBusy(false);
          return;
        }

      } else if (route === 'swarm') {
        // Swarm mode: POST to /api/chat/swarm, stream each agent's tokens
        // as its own bubble, plus a synthesis bubble. Each agent
        // appears in parallel — no waiting for one to finish.
        const swarmMsgId = uid();
        setMessages(prev => [...prev, {
          id: swarmMsgId, role: 'assistant', route: 'swarm',
          model: 'Quill Swarm', avatar: '🧬',
          content: `Swarming: "${(body.message || '').slice(0, 200)}"`,
          meta: 'spawning agents…', ts: stamp(),
        }]);
        setBusy(false);
        streamSwarmSend(swarmMsgId, body).catch(e => {
          updateMsg(swarmMsgId, { meta: 'error: ' + e.message });
        });
        return;

      } else if (route === 'groupchat') {
        // Each model gets its own bubble. The synthesis lands as a final
        // summary bubble. This is the "real chat room" feel — 5 models in
        // the room, 5 separate replies, not one wall-of-text.
        if (json.ok && json.successCount > 0) {
          if (json.members) {
            for (const member of (json.members as any[]).filter((m: any) => m.status === 'ok')) {
              const modelId = member.model || 'unknown';
              const name = member.name || modelId.split('/').pop() || modelId;
              push({
                role: 'assistant',
                route: 'groupchat',
                model: name,
                avatar: '🤖',
                content: member.answer || '(no answer)',
                meta: `${modelId} · ${(member.answer || '').split(/\s+/).filter(Boolean).length} words`,
              });
            }
          }
          // Then synthesized summary as its own bubble
          if (json.synthesis) {
            push({
              role: 'assistant',
              route: 'groupchat',
              model: 'Synthesis',
              avatar: '🧠',
              content: json.synthesis,
              meta: `${json.successCount}/${json.memberCount} models · ${json.freeModelCount} free`,
            });
          }
          setBusy(false);
          return;
        } else if (json.job) {
          // Async kernel job
          jobId = json.job.id;
          content = `Group research running — ${selectedModels.length} models queried...`;
          meta = `job ${String(jobId).slice(-10)}`;
          pending = true;
          const msgId = uid();
          setMessages(prev => [...prev, { id: msgId, role: 'assistant', route, model: 'Group Room', avatar: '🟣', content, meta, ts: stamp(), jobId, pending }]);
          if (jobId) pollJob(jobId, msgId);
          setBusy(false);
          return;
        } else {
          content = json.error || 'No models answered — check OpenRouter key';
        }

      } else if (route === 'research') {
        if (json.job) {
          jobId = json.job.id;
          content = `Deep research running — gathering sources and querying ${selectedModels.length} models...`;
          meta = `job ${String(jobId).slice(-10)}`;
          pending = true;
          const msgId = uid();
          setMessages(prev => [...prev, { id: msgId, role: 'assistant', route, model: 'Research Room', avatar: '🔬', content, meta, ts: stamp(), jobId, pending }]);
          if (jobId) pollJob(jobId, msgId);
          setBusy(false);
          return;
        } else {
          // Research sync path: per-model bubbles + synthesis
          if (json.members) {
            for (const member of (json.members as any[]).filter((m: any) => m.status === 'ok')) {
              const modelId = member.model || 'unknown';
              const name = member.name || modelId.split('/').pop() || modelId;
              push({
                role: 'assistant',
                route: 'research',
                model: name,
                avatar: '🔬',
                content: member.answer || '(no answer)',
                meta: modelId,
              });
            }
          }
          if (json.synthesis) {
            push({
              role: 'assistant',
              route: 'research',
              model: 'Synthesis',
              avatar: '🧠',
              content: json.synthesis,
              meta: json.successCount ? `${json.successCount}/${json.memberCount} models` : '',
            });
          }
          setBusy(false);
          return;
        }

      } else if (route === 'mission') {
        content = json.response || json.result || 'Mission dispatched';
        meta = json.workflowId ? `workflow ${String(json.workflowId).slice(-10)}` : '';
      }

      push({ role: 'assistant', route, content, meta, jobId, pending });
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      // Mochi celebrates the arrival of an answer. The mood reflects the
      // provider status: ok=proud, error/warning=worried, mid=chill.
      const providerStatus = String(json.providerStatus || '').toLowerCase();
      if (providerStatus.includes('fail') || providerStatus.includes('error') || providerStatus === 'no-key') {
        mochiReact(`${r.label} didn't reach a provider (${elapsed}s) — check the LLM key.`, 'alert');
      } else if (providerStatus === 'answered') {
        const word = (content || '').trim().split(/\s+/).length;
        mochiReact(`${r.label} done in ${elapsed}s — ${word} words.`, 'proud');
      } else {
        mochiReact(`${r.label} came back in ${elapsed}s.`, 'chill');
      }
    } catch (e: any) {
      push({ role: 'error', content: `${r.label} error: ${e.message}` });
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      mochiReact(`${r.label} failed after ${elapsed}s — ${e.message?.slice(0, 60) || 'connection error'}.`, 'alert');
    } finally {
      setBusy(false);
      setTimeout(() => textRef.current?.focus(), 60);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send(); }
  };

  const toggleModel = (id: string) => {
    setSelectedModels(prev =>
      prev.includes(id)
        ? prev.filter(m => m !== id)
        : prev.length >= 5 ? prev // max 5 models + you = 6 total
        : [...prev, id]
    );
  };

  const toggleGovernanceMode = async () => {
    const next = governanceMode === 'autonomous' ? 'supervised' : 'autonomous';
    setGovernanceMode(next);
    try {
      const res = await fetch('/api/service-proxy?port=7780&path=%2Fapi%2Fgovernance%2Fpolicy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      });
      const raw = await res.json();
      const mode = raw?.data?.policy?.mode || raw?.policy?.mode;
      if (mode === 'supervised' || mode === 'autonomous') setGovernanceMode(mode);
    } catch {}
  };

  const r = ROUTES.find(r => r.id === route)!;
  const c = C[r.color];
  const { online, total: serviceTotal } = serviceCountLabel(data.services);
  const latestJob = data.kernelJobs?.[0];
  const voiceOnline = data.services.some(s => serviceReachable(s.status) && ['voice-coordinator', 'voice-bridge'].includes(s.key || ''));
  const sttOnline = data.services.some(s => serviceReachable(s.status) && s.key === 'stt');
  const activeContext = useMemo(() => {
    const items: { label: string; detail?: string; kind: string }[] = [];
    attachments.forEach(a => items.push({ label: a.name, detail: a.kind, kind: 'attachment' }));
    items.push({ label: WORKSPACES.find(w => w.id === workspace)?.label || workspace, detail: 'workspace', kind: 'workspace' });
    if (memoryMode !== 'off') items.push({ label: MEMORY_MODES.find(m => m.id === memoryMode)?.label || memoryMode, detail: 'memory', kind: 'memory' });
    enabledAgents.forEach(agent => items.push({ label: AGENT_TOGGLES.find(a => a.id === agent)?.label || agent, detail: 'agent', kind: 'agent' }));
    quickChips.forEach(chip => items.push({ label: chip, detail: 'quick action', kind: 'chip' }));
    items.push({ label: provider === 'auto' ? 'Auto Provider' : PROVIDERS.find(p => p.id === provider)?.label || provider, detail: `${composerSpeed}/${intelligence}`, kind: 'model' });
    items.push({ label: ACCESS_MODES.find(a => a.id === accessMode)?.label || accessMode, detail: 'access', kind: 'access' });
    return items;
  }, [attachments, workspace, memoryMode, enabledAgents, quickChips, provider, composerSpeed, intelligence, accessMode]);
  const estimatedTokens = useMemo(() => {
    const attachmentChars = attachments.reduce((sum, item) => sum + (item.preview?.length || 0) + item.name.length + item.path.length, 0);
    const contextChars = activeContext.reduce((sum, item) => sum + item.label.length + (item.detail?.length || 0), 0);
    return Math.max(1, Math.ceil((input.length + attachmentChars + contextChars) / 4));
  }, [activeContext, attachments, input]);
  const operatorContext: OperatorContext = {
    composerMode,
    accessMode,
    memoryMode,
    workspace,
    enabledAgents,
    quickChips,
    modelControl: { speed: composerSpeed, intelligence, provider },
    attachments: attachments.map(a => ({ name: a.name, path: a.path, kind: a.kind, size: a.size })),
    activeContext,
    estimatedTokens,
  };

  return (
    <div className="flex h-full overflow-hidden">

      {/* Mochi narrator sidebar — visible on wide screens */}
      <aside className="hidden 2xl:flex w-64 shrink-0 flex-col gap-3 border-r border-white/6 bg-black/50 p-3 overflow-y-auto">
        {/* Connection dots — compact */}
        <div className="flex items-center gap-3 px-1">
          {[
            { label: 'API',   ok: data.apiConnected },
            { label: 'TWR',   ok: data.towerConnected },
            { label: 'ORCH',  ok: data.orchestratorConnected },
            { label: 'EVT',   ok: data.eventBusConnected },
          ].map(({ label, ok }) => (
            <div key={label} className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400 shadow-[0_0_4px_#34d399]' : 'bg-rose-500'}`} />
              <span className="text-[7px] font-mono text-white/30">{label}</span>
            </div>
          ))}
          <span className="ml-auto text-[7px] font-mono text-white/25">{online}/{serviceTotal}</span>
        </div>

        <div className="h-px bg-white/6" />

        {/* Asher the live narrator */}
        <MochiNarrator data={data} onNarratorReady={setMochiReact} />

        <div className="h-px bg-white/6 mt-auto" />

        {/* Latest job compact */}
        {false && latestJob && (
          <div className="rounded border border-cyan-300/10 bg-cyan-300/4 px-2 py-1.5">
            <div className="text-[7px] uppercase tracking-wider text-cyan-300/30 font-mono">latest job</div>
            <div className="text-[9px] font-mono text-cyan-200 truncate mt-0.5">{latestJob.goal?.slice(0, 38) || latestJob.id}</div>
            <div className="text-[7px] font-mono text-white/25 mt-0.5">{latestJob.state} · {latestJob.route}</div>
          </div>
        )}
        <ActiveWorkBoard data={data} />
      </aside>

      {/* Chat */}
      <div className="flex flex-1 flex-col min-w-0 relative">
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-[11px] font-mono text-white/25 pt-8 text-center">Type anything. Ctrl+Enter to send.</div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              style={{ animation: 'fadeSlideUp 140ms ease-out forwards' }}>

              {msg.role === 'user' && (
                <div className="max-w-[72%]">
                  <div className={`rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed border ${msg.route ? C[ROUTES.find(r=>r.id===msg.route)!.color].pill : c.pill}`}>
                    {msg.content}
                  </div>
                  <div className="mt-0.5 flex justify-end gap-2 text-[8px] font-mono">
                    {msg.route && <span className={C[ROUTES.find(r=>r.id===msg.route)!.color].text}>{ROUTES.find(r=>r.id===msg.route)!.label}</span>}
                    <span className="text-white/18">{msg.ts}</span>
                  </div>
                </div>
              )}

              {(msg.role === 'assistant') && (
                <div className="max-w-[82%]">
                  <div className={`rounded-2xl rounded-tl-sm border ${msg.pending ? 'border-white/8 bg-white/[0.02]' : 'border-white/10 bg-white/[0.04]'} px-4 py-3`}>
                    {/* Header — show model name if this bubble is one of N
                        in a group room, otherwise show the route. The avatar
                        emoji gives it the "real chat participant" feel. */}
                    {(msg.model || msg.route) && !msg.pending && (
                      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-mono">
                        {msg.avatar && <span className="text-[12px] leading-none">{msg.avatar}</span>}
                        {msg.model
                          ? <span className="font-bold tracking-wide text-cyan-200/90">{msg.model}</span>
                          : msg.route && <span className={C[ROUTES.find(r=>r.id===msg.route)!.color].text}>{ROUTES.find(r=>r.id===msg.route)!.label}</span>}
                      </div>
                    )}

                    {/* Tool calls — animated badges for every tool/function the
                        agent invoked while producing this reply. Each badge
                        runs its shine + pulse animation while 'running',
                        then settles green (success) or red (failure). */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5" data-tool-strip>
                        {msg.toolCalls.map((tc, i) => (
                          <ToolCallBadge
                            key={i}
                            tool={tc.tool}
                            args={tc.args}
                            status={tc.status}
                            result={tc.result}
                            error={tc.error}
                            durationMs={tc.durationMs}
                          />
                        ))}
                      </div>
                    )}
                    {msg.pending ? (
                      <div className="flex items-center gap-2">
                        {[0,1,2].map(i => <span key={i} className={`w-1.5 h-1.5 rounded-full ${c.dot} animate-bounce`} style={{ animationDelay: `${i*140}ms` }} />)}
                        <span className="text-[10px] font-mono text-white/35">{msg.content}</span>
                      </div>
                    ) : (
                      <pre className="text-[13px] text-white/82 leading-relaxed whitespace-pre-wrap font-sans">{msg.content}</pre>
                    )}
                    {msg.meta && !msg.pending && (
                      <div className="mt-2 rounded border border-white/6 bg-black/30 px-2 py-1 text-[8px] font-mono text-white/30">{msg.meta}</div>
                    )}

                    {/* PLAN: structured steps with approve/execute UI */}
                    {msg.plan && msg.plan.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {msg.plan.map(step => {
                          const result = msg.planStepResults?.find(r => r.step.index === step.index);
                          const isDone = !!result;
                          const ok = result?.ok;
                          return (
                            <div
                              key={step.index}
                              className={`rounded-lg border px-3 py-2 transition-colors ${
                                isDone
                                  ? ok
                                    ? 'border-emerald-500/30 bg-emerald-500/5'
                                    : 'border-rose-500/30 bg-rose-500/5'
                                  : 'border-white/10 bg-white/[0.025]'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <span className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                                  isDone
                                    ? ok
                                      ? 'bg-emerald-500/30 text-emerald-100'
                                      : 'bg-rose-500/30 text-rose-100'
                                    : 'bg-orange-500/20 text-orange-200'
                                }`}>
                                  {isDone ? (ok ? '✓' : '✗') : step.index}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[12px] font-bold text-white/90">{step.title}</span>
                                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-200 border border-violet-500/30 uppercase">{step.route}</span>
                                  </div>
                                  <div className="mt-1 text-[11px] font-mono text-white/60 break-words">{step.command}</div>
                                  {step.expected && (
                                    <div className="mt-0.5 text-[10px] text-white/40">→ {step.expected}</div>
                                  )}
                                  {isDone && (
                                    <div className="mt-1 text-[10px] text-white/55 italic">{result!.summary}</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Plan action bar */}
                        {msg.planState === 'pending' && (
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => executePlan(msg.id, msg.plan!)}
                              className="px-3 py-1.5 rounded-md bg-orange-500/20 text-orange-100 border border-orange-500/40 text-[11px] font-bold uppercase tracking-wider hover:bg-orange-500/30 transition-colors"
                            >
                              ▶ Approve &amp; Execute
                            </button>
                            <button
                              onClick={() => rejectPlan(msg.id)}
                              className="px-3 py-1.5 rounded-md bg-white/5 text-white/50 border border-white/10 text-[11px] font-bold uppercase tracking-wider hover:bg-white/10 transition-colors"
                            >
                              ✗ Reject
                            </button>
                            <span className="text-[10px] text-white/30 self-center font-mono">— Quill will dispatch each step to its route in sequence</span>
                          </div>
                        )}
                        {msg.planState === 'executing' && (
                          <div className="text-[10px] font-mono text-orange-300/70 pt-1">
                            ▶ Executing… {msg.planStepResults?.filter(r => r.ok).length || 0}/{msg.plan.length} steps done
                          </div>
                        )}
                        {msg.planState === 'done' && (
                          <div className="text-[10px] font-mono text-emerald-300/70 pt-1">
                            ✓ Plan complete — {msg.planStepResults?.filter(r => r.ok).length || 0}/{msg.plan.length} steps succeeded
                          </div>
                        )}
                        {msg.planState === 'rejected' && (
                          <div className="text-[10px] font-mono text-white/35 pt-1">
                            ✗ Plan rejected
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-0.5 flex gap-2 text-[8px] font-mono">
                    <span className="text-white/18">{msg.ts}</span>
                  </div>
                </div>
              )}

              {msg.role === 'error' && (
                <div className="w-full max-w-3xl rounded-2xl border border-rose-500/25 bg-rose-500/6 px-4 py-3">
                  <div className="text-[8px] uppercase tracking-wider text-rose-300/45 font-mono mb-1">error · {msg.ts}</div>
                  <div className="text-[13px] text-rose-200/75">{msg.content}</div>
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className={`rounded-2xl rounded-tl-sm border ${c.border} bg-white/[0.03] px-4 py-3`}>
                <div className="flex items-center gap-1.5">
                  {[0,1,2].map(i => <span key={i} className={`w-2 h-2 rounded-full ${c.dot} animate-bounce`} style={{ animationDelay: `${i*140}ms` }} />)}
                  <span className={`ml-2 text-[10px] font-mono ${c.text}`}>{r.label}…</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
          {showJumpToLatest && (
            <button onClick={jumpToLatest}
              className="sticky bottom-3 left-1/2 -translate-x-1/2 mx-auto mt-2 flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-300/15 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-cyan-100 backdrop-blur-md shadow-[0_0_20px_rgba(34,211,238,0.25)] hover:bg-cyan-300/25 transition-all"
              title="Scroll to the latest message">
              <span>↓</span>
              <span>Jump to latest</span>
            </button>
          )}
        </div>

        {/* Model picker for group chat */}
        {(route === 'groupchat' || route === 'research') && showModelPicker && (
          <div className="border-t border-white/6 bg-black/60 px-5 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-mono text-white/40 uppercase tracking-wider">Pick models (max 5) + you = 6 in the room</span>
              <span className={`text-[9px] font-mono ${c.text}`}>{selectedModels.length}/5 selected</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FREE_MODELS.map(m => {
                const sel = selectedModels.includes(m.id);
                return (
                  <button key={m.id} onClick={() => toggleModel(m.id)}
                    className={`rounded-full border px-2.5 py-1 text-[8px] font-mono transition-all ${
                      sel ? `${c.pill} font-bold` : 'border-white/10 bg-white/[0.02] text-white/30 hover:text-white/60'
                    }`}>
                    {m.fast && <span className="text-emerald-400 mr-1">⚡</span>}
                    {m.name} <span className="opacity-40">{m.ctx}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Composer V1 — integrated chatbox with flyout menus ── */}
        <ComposerInput
          composerMode={composerMode}
          setComposerMode={setComposerMode}
          accessMode={accessMode}
          setAccessMode={setAccessMode}
          memoryMode={memoryMode}
          setMemoryMode={setMemoryMode}
          workspace={workspace}
          setWorkspace={setWorkspace}
          provider={provider}
          setProvider={setProvider}
          speed={composerSpeed}
          setSpeed={setComposerSpeed}
          intelligence={intelligence}
          setIntelligence={setIntelligence}
          enabledAgents={enabledAgents}
          toggleAgent={toggleAgent}
          quickChips={quickChips}
          toggleQuickChip={toggleQuickChip}
          input={input}
          setInput={setInputForRoute}
          onSend={send}
          busy={busy}
          attachments={attachments}
          setAttachments={setAttachments}
          uploadFiles={uploadFiles}
          uploading={uploading}
          activeContext={activeContext}
          estimatedTokens={estimatedTokens}
          voiceOnline={voiceOnline}
          onLauncherAction={chooseLauncherAction}
          currentRoute={route}
          selectedModels={selectedModels}
        />
      </div>
    </div>
  );
}

'use client';

/**
 * Frameworks Landscape — AI Agent Frameworks (2025-2026)
 * =========================================================
 * Precision data extraction page. The data here is a curated snapshot of
 * the 2025-2026 AI agent framework landscape, with the LangGraph entry
 * pulled from a precision read of:
 *   - https://github.com/langchain-ai/langgraph   (monorepo, MIT)
 *   - https://pypi.org/project/langgraph/         (Python package)
 *   - https://www.npmjs.com/package/@langchain/langgraph  (TypeScript)
 *
 * Architectural pattern taxonomy is bucketed into three families:
 *   GRAPH         — nodes + edges, conditional routing, cycles (LangGraph)
 *   ROLE-BASED    — actors with personas, role-driven delegation (CrewAI)
 *   EVENT-DRIVEN  — message/event passing, conversation as protocol (AutoGen)
 *
 * The page is read-only — no API calls. It is reachable at /frameworks
 * and via CockpitShell rail group "INTELLIGENCE → Frameworks".
 */

import { useMemo, useState } from 'react';
import { CockpitShell } from '../components/CockpitShell';
import { FrameworksLandscape } from '../components/FrameworksLandscape';
import { FrameworkCard } from '../components/FrameworkCard';
import { FrameworkMetaTable } from '../components/FrameworkMetaTable';
import { PatternMatrix } from '../components/PatternMatrix';
import { LangGraphDeepDive } from '../components/LangGraphDeepDive';
import {
  FRAMEWORKS,
  PATTERN_TAXONOMY,
  LANGGRAPH_PROFILE,
  type FrameworkEntry,
  type ArchPattern,
} from '../components/framework-data';

export default function FrameworksPage() {
  const [activePattern, setActivePattern] = useState<ArchPattern | 'all'>('all');
  const [language, setLanguage] = useState<'all' | 'python' | 'typescript' | 'rust' | 'go' | 'csharp' | 'java'>('all');
  const [query, setQuery] = useState('');

  const filtered: FrameworkEntry[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FRAMEWORKS.filter(f => {
      if (activePattern !== 'all' && f.pattern !== activePattern) return false;
      if (language !== 'all' && !f.languages.includes(language)) return false;
      if (q) {
        const hay = `${f.name} ${f.org} ${f.tagline} ${f.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activePattern, language, query]);

  const featured = filtered.find(f => f.id === 'langgraph') ?? LANGGRAPH_PROFILE;

  return (
    <CockpitShell title="Frameworks Landscape · AI Agents 2025-2026">
      <div className="h-full overflow-y-auto bg-[#05070c] text-white">
        {/* Header */}
        <div className="border-b border-cyan-300/10 bg-gradient-to-b from-[#0a0a1a] to-[#05070c] px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/55 font-mono">
                intelligence · 2025-2026 snapshot
              </div>
              <h1 className="mt-1 text-2xl font-black tracking-[0.04em] text-white">
                AI Agent Frameworks — Landscape &amp; Architectural Pattern Atlas
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-white/55">
                Precision extraction across the public AI-agent stack. Each entry is pinned to its source repo, license,
                primary architectural pattern, and language bindings. The headline subject is{' '}
                <a
                  href="https://github.com/langchain-ai/langgraph"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-cyan-300 underline decoration-cyan-300/30 underline-offset-4 hover:decoration-cyan-300/80"
                >
                  langchain-ai/langgraph
                </a>
                {' '}— which lands in the <span className="text-cyan-300 font-bold">graph</span> family.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-emerald-300/20 bg-emerald-300/8 px-3 py-1.5 font-mono text-[11px] text-emerald-200">
                {FRAMEWORKS.length} frameworks
              </span>
              <span className="rounded border border-cyan-300/20 bg-cyan-300/8 px-3 py-1.5 font-mono text-[11px] text-cyan-200">
                {Object.keys(PATTERN_TAXONOMY).length} pattern families
              </span>
              <span className="rounded border border-violet-300/20 bg-violet-300/8 px-3 py-1.5 font-mono text-[11px] text-violet-200">
                curated 2026-Q1
              </span>
            </div>
          </div>

          {/* Filters */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="filter by name, org, note…"
              className="min-w-[14rem] flex-1 rounded-lg border border-white/10 bg-black/45 px-3 py-2 text-sm text-white/85 outline-none placeholder:text-white/30 focus:border-cyan-300/45"
            />

            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-black/35 p-1.5">
              {(['all', ...Object.keys(PATTERN_TAXONOMY)] as (ArchPattern | 'all')[]).map(p => {
                const active = p === activePattern;
                const meta = p === 'all' ? { color: '#94a3b8', label: 'all' } : PATTERN_TAXONOMY[p as ArchPattern];
                return (
                  <button
                    key={p}
                    onClick={() => setActivePattern(p)}
                    style={active ? { backgroundColor: `${meta.color}26`, borderColor: `${meta.color}80`, color: meta.color } : undefined}
                    className={`rounded border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition ${
                      active ? '' : 'border-white/10 text-white/45 hover:text-white/75'
                    }`}
                  >
                    {p === 'all' ? 'all' : meta.label}
                  </button>
                );
              })}
            </div>

            <select
              value={language}
              onChange={e => setLanguage(e.target.value as typeof language)}
              className="rounded-lg border border-white/10 bg-black/45 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-white/80 outline-none focus:border-cyan-300/45"
            >
              <option value="all">all langs</option>
              <option value="python">python</option>
              <option value="typescript">typescript / js</option>
              <option value="rust">rust</option>
              <option value="go">go</option>
              <option value="csharp">c#/.NET</option>
              <option value="java">java</option>
            </select>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-8 p-6">
          {/* Featured: LangGraph deep dive */}
          <LangGraphDeepDive profile={LANGGRAPH_PROFILE} />

          {/* Pattern Matrix */}
          <section>
            <SectionHeader label="Pattern Matrix" sub="Each framework mapped to its primary architectural family." />
            <PatternMatrix frameworks={FRAMEWORKS} onPick={setActivePattern} active={activePattern} />
          </section>

          {/* Frameworks grid */}
          <section>
            <SectionHeader
              label="Frameworks Roster"
              sub={`${filtered.length} of ${FRAMEWORKS.length} match the current filter.`}
            />
            {filtered.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/35 p-8 text-center font-mono text-sm text-white/40">
                No frameworks match. Loosen the filter.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map(f => (
                  <FrameworkCard key={f.id} entry={f} highlight={f.id === 'langgraph'} />
                ))}
              </div>
            )}
          </section>

          {/* Featured at top alt — also exposed via alt-rail of FrameworksLandscape */}
          {featured && (
            <section>
              <SectionHeader label="Headline Profile" sub={featured.tagline} />
              <FrameworksLandscape featured={featured} frameworks={FRAMEWORKS} />
            </section>
          )}

          {/* Precision meta table */}
          <section>
            <SectionHeader
              label="Precision Meta Table"
              sub="Sortable by pattern / language / first-release year. Source pinned to public repo where possible."
            />
            <FrameworkMetaTable frameworks={FRAMEWORKS} />
          </section>

          <footer className="pt-4 text-center font-mono text-[10px] uppercase tracking-widest text-white/30">
            data last curated 2026-Q1 · sources: public repos · primary pattern = structural control-flow primitive
          </footer>
        </div>
      </div>
    </CockpitShell>
  );
}

function SectionHeader({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-3 border-b border-white/8 pb-2">
      <h2 className="text-[10px] font-mono uppercase tracking-[0.28em] text-cyan-300/65">{label}</h2>
      {sub && <span className="text-[11px] text-white/40">{sub}</span>}
    </div>
  );
}

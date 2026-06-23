'use client';

import { useMemo, useState } from 'react';
import { CockpitShell } from '../components/CockpitShell';

type ArchPattern = 'graph' | 'role-based' | 'event-driven' | 'workflow' | 'tool-runtime';
type Language = 'python' | 'typescript' | 'rust' | 'go' | 'csharp' | 'java';

type FrameworkEntry = {
  id: string;
  name: string;
  org: string;
  pattern: ArchPattern;
  languages: Language[];
  license: string;
  repo: string;
  tagline: string;
  notes: string;
};

const PATTERNS: Record<ArchPattern, { label: string; color: string; summary: string }> = {
  graph: {
    label: 'Graph',
    color: '#22d3ee',
    summary: 'Nodes, edges, conditional routing, cycles, and stateful execution.',
  },
  'role-based': {
    label: 'Role-Based',
    color: '#a78bfa',
    summary: 'Persona-driven agents, delegation, task ownership, and handoffs.',
  },
  'event-driven': {
    label: 'Event-Driven',
    color: '#34d399',
    summary: 'Messages, streams, async events, and conversational protocols.',
  },
  workflow: {
    label: 'Workflow',
    color: '#fbbf24',
    summary: 'Steps, DAGs, jobs, retries, and production orchestration.',
  },
  'tool-runtime': {
    label: 'Tool Runtime',
    color: '#fb7185',
    summary: 'Tool calling, sandboxing, policies, and action execution.',
  },
};

const FRAMEWORKS: FrameworkEntry[] = [
  {
    id: 'langgraph',
    name: 'LangGraph',
    org: 'LangChain',
    pattern: 'graph',
    languages: ['python', 'typescript'],
    license: 'MIT',
    repo: 'https://github.com/langchain-ai/langgraph',
    tagline: 'Stateful graph runtime for agent workflows.',
    notes: 'Best match when the control flow is the product: loops, branches, checkpoints, and resumable state.',
  },
  {
    id: 'crewai',
    name: 'CrewAI',
    org: 'CrewAI',
    pattern: 'role-based',
    languages: ['python'],
    license: 'MIT',
    repo: 'https://github.com/crewAIInc/crewAI',
    tagline: 'Role-oriented multi-agent teams.',
    notes: 'Strong mental model for tasks owned by specialized personas with explicit delegation.',
  },
  {
    id: 'autogen',
    name: 'AutoGen',
    org: 'Microsoft',
    pattern: 'event-driven',
    languages: ['python'],
    license: 'MIT',
    repo: 'https://github.com/microsoft/autogen',
    tagline: 'Conversation and event-driven multi-agent orchestration.',
    notes: 'Useful when agents interact through message protocols and observable event streams.',
  },
  {
    id: 'semantic-kernel',
    name: 'Semantic Kernel',
    org: 'Microsoft',
    pattern: 'tool-runtime',
    languages: ['python', 'typescript', 'csharp', 'java'],
    license: 'MIT',
    repo: 'https://github.com/microsoft/semantic-kernel',
    tagline: 'AI orchestration with plugins, planners, and connectors.',
    notes: 'A broad application runtime for tool/plugin integration across languages.',
  },
  {
    id: 'dspy',
    name: 'DSPy',
    org: 'Stanford NLP',
    pattern: 'workflow',
    languages: ['python'],
    license: 'MIT',
    repo: 'https://github.com/stanfordnlp/dspy',
    tagline: 'Programmatic LM pipelines and optimization.',
    notes: 'Useful when prompts should become measurable, optimizable modules rather than hand-tuned text.',
  },
  {
    id: 'mastra',
    name: 'Mastra',
    org: 'Mastra',
    pattern: 'workflow',
    languages: ['typescript'],
    license: 'Apache-2.0',
    repo: 'https://github.com/mastra-ai/mastra',
    tagline: 'TypeScript agent workflows and observability.',
    notes: 'Good reference point for app-native agent workflow design in a JS/TS stack.',
  },
  {
    id: 'openai-agents',
    name: 'OpenAI Agents SDK',
    org: 'OpenAI',
    pattern: 'tool-runtime',
    languages: ['python', 'typescript'],
    license: 'MIT',
    repo: 'https://github.com/openai/openai-agents-python',
    tagline: 'Agent loop primitives, tools, handoffs, and tracing.',
    notes: 'Useful comparator for PURPCLAW tool calling, delegation, and trace contracts.',
  },
  {
    id: 'llamaindex',
    name: 'LlamaIndex',
    org: 'LlamaIndex',
    pattern: 'tool-runtime',
    languages: ['python', 'typescript'],
    license: 'MIT',
    repo: 'https://github.com/run-llama/llama_index',
    tagline: 'Data, retrieval, tools, and agent workflows.',
    notes: 'Strong reference for data-connected agents, retrieval pipelines, and knowledge tooling.',
  },
];

const LANGUAGES: (Language | 'all')[] = ['all', 'python', 'typescript', 'rust', 'go', 'csharp', 'java'];

export default function FrameworksPage() {
  const [activePattern, setActivePattern] = useState<ArchPattern | 'all'>('all');
  const [language, setLanguage] = useState<Language | 'all'>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FRAMEWORKS.filter(f => {
      if (activePattern !== 'all' && f.pattern !== activePattern) return false;
      if (language !== 'all' && !f.languages.includes(language)) return false;
      if (!q) return true;
      return `${f.name} ${f.org} ${f.tagline} ${f.notes}`.toLowerCase().includes(q);
    });
  }, [activePattern, language, query]);

  const patternCounts = useMemo(() => {
    return FRAMEWORKS.reduce<Record<ArchPattern, number>>((acc, entry) => {
      acc[entry.pattern] += 1;
      return acc;
    }, { graph: 0, 'role-based': 0, 'event-driven': 0, workflow: 0, 'tool-runtime': 0 });
  }, []);

  return (
    <CockpitShell title="Frameworks Landscape">
      <main className="h-full overflow-y-auto bg-[#05070c] text-white">
        <header className="border-b border-cyan-300/10 bg-gradient-to-b from-[#0a0a1a] to-[#05070c] px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
                intelligence / framework atlas
              </div>
              <h1 className="mt-1 text-2xl font-black tracking-[0.04em] text-white">
                AI Agent Frameworks
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
                A compact comparison page for the frameworks PURPCLAW should learn from, compete with, or route around.
                This page is static and read-only so it cannot lie about live backend state.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Metric label="frameworks" value={FRAMEWORKS.length} />
              <Metric label="patterns" value={Object.keys(PATTERNS).length} />
              <Metric label="mode" value="read-only" />
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_auto_auto]">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filter by name, org, note..."
              className="rounded-lg border border-white/10 bg-black/45 px-3 py-2 text-sm text-white/85 outline-none placeholder:text-white/30 focus:border-cyan-300/45"
            />
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-black/35 p-1.5">
              {(['all', ...Object.keys(PATTERNS)] as (ArchPattern | 'all')[]).map(pattern => {
                const active = pattern === activePattern;
                const meta = pattern === 'all' ? { label: 'All', color: '#94a3b8' } : PATTERNS[pattern];
                return (
                  <button
                    key={pattern}
                    onClick={() => setActivePattern(pattern)}
                    style={active ? { backgroundColor: `${meta.color}26`, borderColor: `${meta.color}80`, color: meta.color } : undefined}
                    className={`rounded border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition ${
                      active ? '' : 'border-white/10 text-white/45 hover:text-white/75'
                    }`}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value as Language | 'all')}
              className="rounded-lg border border-white/10 bg-black/45 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-white/80 outline-none focus:border-cyan-300/45"
            >
              {LANGUAGES.map(lang => (
                <option key={lang} value={lang}>{lang === 'all' ? 'all languages' : lang}</option>
              ))}
            </select>
          </div>
        </header>

        <section className="grid gap-4 p-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-cyan-300/10 bg-black/35 p-5">
            <SectionHeader label="Pattern Families" sub="The control-flow shape each framework mostly teaches." />
            <div className="grid gap-3 md:grid-cols-2">
              {(Object.entries(PATTERNS) as [ArchPattern, typeof PATTERNS[ArchPattern]][]).map(([key, meta]) => (
                <button
                  key={key}
                  onClick={() => setActivePattern(key)}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.04]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs uppercase tracking-[0.18em]" style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                    <span className="rounded border border-white/10 px-2 py-0.5 font-mono text-[10px] text-white/45">
                      {patternCounts[key]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-white/55">{meta.summary}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-violet-300/10 bg-black/35 p-5">
            <SectionHeader label="PURPCLAW Lens" sub="Why this belongs in the stack." />
            <div className="space-y-3 text-sm leading-6 text-white/60">
              <p>
                PURPCLAW already mixes graph-like loops, role-based agents, event streams, workflow jobs,
                and guarded tool execution. This page names those patterns so stack work can be compared
                against known architecture instead of vague dashboards.
              </p>
              <p>
                Use this page when deciding whether a subsystem should be a service, a module, an agent
                config, a workflow, or a tool adapter.
              </p>
            </div>
          </div>
        </section>

        <section className="px-6 pb-6">
          <SectionHeader label="Framework Roster" sub={`${filtered.length} of ${FRAMEWORKS.length} match the current filter.`} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map(entry => (
              <article key={entry.id} className="rounded-2xl border border-white/10 bg-black/35 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black text-white">{entry.name}</h2>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">{entry.org}</p>
                  </div>
                  <span
                    className="rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider"
                    style={{
                      borderColor: `${PATTERNS[entry.pattern].color}55`,
                      color: PATTERNS[entry.pattern].color,
                      backgroundColor: `${PATTERNS[entry.pattern].color}14`,
                    }}
                  >
                    {PATTERNS[entry.pattern].label}
                  </span>
                </div>

                <p className="mt-3 text-sm font-semibold text-white/80">{entry.tagline}</p>
                <p className="mt-2 text-sm leading-5 text-white/55">{entry.notes}</p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {entry.languages.map(lang => (
                    <span key={lang} className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] uppercase text-white/45">
                      {lang}
                    </span>
                  ))}
                  <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] uppercase text-white/45">
                    {entry.license}
                  </span>
                </div>

                <a
                  href={entry.repo}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-4 block truncate font-mono text-[11px] text-cyan-300/75 underline decoration-cyan-300/20 underline-offset-4 hover:decoration-cyan-300/80"
                >
                  {entry.repo}
                </a>
              </article>
            ))}
          </div>
        </section>
      </main>
    </CockpitShell>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/35 px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</div>
      <div className="text-lg font-black text-cyan-100">{value}</div>
    </div>
  );
}

function SectionHeader({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-3 border-b border-white/8 pb-2">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-300/65">{label}</h2>
      {sub && <span className="text-[11px] text-white/40">{sub}</span>}
    </div>
  );
}

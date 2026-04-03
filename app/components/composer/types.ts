// ─── Composer V1 — Shared Types & Constants ─────────────────────────────────
// Extracted from CommandPanel.tsx lines 515–668 + 1056
// Every composer component imports from here.

// ─── Core Types ──────────────────────────────────────────────────────────────

export type Route = 'chat' | 'plan' | 'kernel' | 'swarm' | 'research' | 'groupchat' | 'mission';
export type ComposerMode = 'chat' | 'plan' | 'execute' | 'swarm';
export type AccessMode = 'readOnly' | 'review' | 'agentActions' | 'fullSystem';
export type MemoryMode = 'off' | 'session' | 'project' | 'persistent';
export type ComposerSpeed = 'fast' | 'balanced' | 'deep';
export type IntelligenceLevel = 'low' | 'medium' | 'high' | 'extreme';
export type ProviderId = 'auto' | 'openai' | 'claude' | 'gemini' | 'deepseek' | 'kimi' | 'qwen' | 'local';
export type WorkspaceId = 'dreamforge' | 'omnicode' | 'gotham' | 'openclaw' | 'current' | 'custom';
export type AgentId = 'planner' | 'researcher' | 'builder' | 'security' | 'designer' | 'video' | 'audio' | 'custom';

export type AgentStatus = 'idle' | 'working' | 'error' | 'completed';

export type OperatorContext = {
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
  attachments: Attachment[];
  activeContext: ContextItem[];
  estimatedTokens: number;
};

export type RouteOptions = {
  selectedModels?: string[];
  modelCount?: number;
  fullExecution?: boolean;
  operatorContext?: OperatorContext;
};

export interface Msg {
  id: string;
  role: 'user' | 'system' | 'assistant' | 'error';
  route?: Route;
  model?: string;
  avatar?: string;
  content: string;
  meta?: string;
  ts: string;
  jobId?: string;
  pending?: boolean;
  plan?: PlanStep[];
  planState?: 'pending' | 'approved' | 'rejected' | 'executing' | 'done';
  planGoal?: string;
  planStepResults?: { step: PlanStep; ok: boolean; summary: string }[];
}

export interface PlanStep {
  index: number;
  title: string;
  command: string;
  route: Route | 'services' | 'training' | 'autoresearch' | 'code';
  expected: string;
}

export type Attachment = {
  name: string;
  path: string;
  kind: string;
  size: number;
  preview?: string;
};

export type ContextItem = {
  label: string;
  detail?: string;
  kind: string;
};

export type LauncherActionKind =
  | 'file' | 'folder' | 'image' | 'audio' | 'video' | 'url' | 'clipboard' | 'recent'
  | 'workspace' | 'project' | 'document' | 'saved' | 'agent' | 'skill'
  | 'action' | 'repo' | 'web' | 'research' | 'genImage' | 'genVideo' | 'genAudio';

// ─── Constants ───────────────────────────────────────────────────────────────

export const COMPOSER_MODES: { id: ComposerMode; label: string; route: Route; color: string; icon: string }[] = [
  { id: 'chat', label: 'Chat', route: 'chat', color: 'cyan', icon: '💬' },
  { id: 'plan', label: 'Plan', route: 'plan', color: 'amber', icon: '📋' },
  { id: 'execute', label: 'Execute', route: 'kernel', color: 'violet', icon: '⚡' },
  { id: 'swarm', label: 'Swarm', route: 'swarm', color: 'emerald', icon: '🐝' },
];

export const AGENT_TOGGLES: { id: AgentId; label: string }[] = [
  { id: 'planner', label: 'Planner' },
  { id: 'researcher', label: 'Research' },
  { id: 'builder', label: 'Builder' },
  { id: 'security', label: 'Security' },
  { id: 'designer', label: 'Designer' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'custom', label: 'Custom' },
];

export const WORKSPACES: { id: WorkspaceId; label: string }[] = [
  { id: 'dreamforge', label: 'DreamForge' },
  { id: 'omnicode', label: 'OmniCode' },
  { id: 'gotham', label: 'Gotham' },
  { id: 'openclaw', label: 'OpenClaw' },
  { id: 'current', label: 'Current Folder' },
  { id: 'custom', label: 'Custom Project' },
];

export const QUICK_CHIPS: { label: string; category: 'dev' | 'research' | 'creative' | 'media' }[] = [
  { label: 'Search', category: 'research' },
  { label: 'Think', category: 'research' },
  { label: 'Research', category: 'research' },
  { label: 'Code', category: 'dev' },
  { label: 'Explain', category: 'research' },
  { label: 'Design', category: 'creative' },
  { label: 'Debug', category: 'dev' },
  { label: 'Write', category: 'creative' },
  { label: 'Market', category: 'creative' },
  { label: 'Legal', category: 'research' },
  { label: 'OSINT', category: 'dev' },
  { label: 'Voice', category: 'media' },
  { label: 'Video', category: 'media' },
  { label: 'Image', category: 'media' },
];

export const QUICK_CHIP_LABELS = QUICK_CHIPS.map(c => c.label);

export const SPEEDS: { id: ComposerSpeed; label: string }[] = [
  { id: 'fast', label: 'Fast' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'deep', label: 'Deep' },
];

export const INTELLIGENCE_LEVELS: { id: IntelligenceLevel; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'extreme', label: 'Extreme' },
];

export const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'claude', label: 'Claude' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'kimi', label: 'Kimi' },
  { id: 'qwen', label: 'Qwen' },
  { id: 'local', label: 'Local' },
];

export const ACCESS_MODES: { id: AccessMode; label: string; tone: string }[] = [
  { id: 'readOnly', label: 'Read Only', tone: 'border-emerald-500/30 bg-emerald-500/8 text-emerald-200' },
  { id: 'review', label: 'Review', tone: 'border-yellow-500/30 bg-yellow-500/8 text-yellow-200' },
  { id: 'agentActions', label: 'Agent Actions', tone: 'border-orange-500/35 bg-orange-500/10 text-orange-200' },
  { id: 'fullSystem', label: 'Full System', tone: 'border-rose-500/35 bg-rose-500/12 text-rose-200' },
];

export const MEMORY_MODES: { id: MemoryMode; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'session', label: 'Session' },
  { id: 'project', label: 'Project' },
  { id: 'persistent', label: 'Persistent' },
];

export const FREE_MODELS = [
  { id: 'openai/gpt-oss-20b:free',                            name: 'OpenAI gpt-oss-20b',      ctx: '131K', fast: true },
  { id: 'google/gemma-4-26b-a4b-it:free',                     name: 'Google Gemma 4 26B',      ctx: '262K', fast: true },
  { id: 'z-ai/glm-4.5-air:free',                              name: 'Z.ai GLM 4.5 Air',       ctx: '131K', fast: true },
  { id: 'openrouter/owl-alpha',                                name: 'OpenRouter Owl Alpha',    ctx: '131K', fast: true },
  { id: 'moonshotai/kimi-k2.6:free',                          name: 'Kimi K2.6',               ctx: '262K', fast: false },
  { id: 'google/gemma-4-31b-it:free',                         name: 'Google Gemma 4 31B',      ctx: '262K', fast: false },
  { id: 'poolside/laguna-xs.2:free',                          name: 'Poolside Laguna XS.2',    ctx: '262K', fast: false },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free',                name: 'NVIDIA Nemotron 3 Nano',  ctx: '256K', fast: false },
  { id: 'openrouter/fusion',                                   name: 'OpenRouter Fusion',       ctx: '131K', fast: false },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', name: 'NVIDIA Nemotron Omni',    ctx: '256K', fast: false },
  { id: 'openai/gpt-oss-120b:free',                           name: 'OpenAI gpt-oss-120b',     ctx: '131K', fast: false },
  { id: 'poolside/laguna-m.1:free',                           name: 'Poolside Laguna M.1',     ctx: '262K', fast: false },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free',             name: 'NVIDIA Nemotron 3 Super', ctx: '1M',   fast: false },
];

export const ROUTES: { id: Route; label: string; color: string; api: string; body: (t: string, opts?: RouteOptions) => object }[] = [
  { id: 'chat',      label: 'Chat',         color: 'cyan',    api: '/api/chat',               body: t => ({ message: t, spawnAgents: false, forceDelegate: false, source: 'mission-control' }) },
  { id: 'plan',      label: 'Plan',         color: 'orange',  api: '/api/llm/plan',           body: t => ({ goal: t, modelLimit: 5, source: 'mission-control-plan' }) },
  { id: 'kernel',    label: 'Kernel+Swarm', color: 'violet',  api: '/api/kernel/jobs',        body: t => ({ goal: t, route: 'swarm-coordinator', source: 'chat-room' }) },
  { id: 'groupchat', label: 'Group Chat',   color: 'fuchsia', api: '/api/research/group',     body: (t, opts) => ({ query: t, depth: 1, modelLimit: opts?.modelCount || 5, selectedModels: opts?.selectedModels, kernelJob: true }) },
  { id: 'research',  label: 'Research',     color: 'amber',   api: '/api/research/group',     body: (t, opts) => ({ query: t, kernelJob: true, depth: 2, modelLimit: opts?.modelCount || 6, selectedModels: opts?.selectedModels }) },
  { id: 'swarm',     label: 'Swarm',        color: 'emerald', api: '/api/harness/coordinate', body: t => ({ task: t }) },
  { id: 'mission',   label: 'Mission',      color: 'blue',    api: '/api/orchestrate',        body: t => ({ task: t }) },
];

/** Color map — pill/dot/text/border class presets keyed by color name */
export const C: Record<string, { pill: string; dot: string; text: string; border: string }> = {
  cyan:    { pill: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100',       dot: 'bg-cyan-400',    text: 'text-cyan-300',    border: 'border-cyan-500/40' },
  violet:  { pill: 'border-violet-500/30 bg-violet-500/10 text-violet-100', dot: 'bg-violet-400',  text: 'text-violet-300',  border: 'border-violet-500/40' },
  fuchsia: { pill: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-100', dot: 'bg-fuchsia-400', text: 'text-fuchsia-300', border: 'border-fuchsia-500/40' },
  amber:   { pill: 'border-amber-500/30 bg-amber-500/10 text-amber-100',   dot: 'bg-amber-400',   text: 'text-amber-300',   border: 'border-amber-500/40' },
  emerald: { pill: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100', dot: 'bg-emerald-400', text: 'text-emerald-300', border: 'border-emerald-500/40' },
  blue:    { pill: 'border-blue-500/30 bg-blue-500/10 text-blue-100',      dot: 'bg-blue-400',    text: 'text-blue-300',    border: 'border-blue-500/40' },
  orange:  { pill: 'border-orange-500/30 bg-orange-500/10 text-orange-100', dot: 'bg-orange-400',  text: 'text-orange-300',  border: 'border-orange-500/40' },
  rose:    { pill: 'border-rose-500/30 bg-rose-500/10 text-rose-100',      dot: 'bg-rose-400',    text: 'text-rose-300',    border: 'border-rose-500/40' },
};

/** Raw glow shadow values for each mode color */
export const MODE_GLOW: Record<string, string> = {
  cyan:    '0 0 18px rgba(34,211,238,0.35), 0 0 6px rgba(34,211,238,0.15)',
  amber:   '0 0 18px rgba(251,191,36,0.35), 0 0 6px rgba(251,191,36,0.15)',
  violet:  '0 0 18px rgba(167,139,250,0.35), 0 0 6px rgba(167,139,250,0.15)',
  emerald: '0 0 18px rgba(52,211,153,0.35), 0 0 6px rgba(52,211,153,0.15)',
  fuchsia: '0 0 18px rgba(232,121,249,0.35), 0 0 6px rgba(232,121,249,0.15)',
};

/** Launcher popover section definitions */
export const LAUNCHER_SECTIONS: { title: string; items: [LauncherActionKind, string, string][] }[] = [
  {
    title: 'Attach',
    items: [
      ['file', 'Files', '📄'],
      ['folder', 'Folder', '📁'],
      ['image', 'Images', '🖼️'],
      ['audio', 'Audio', '🎵'],
      ['video', 'Video', '🎬'],
      ['url', 'URL', '🔗'],
      ['clipboard', 'Clipboard', '📋'],
      ['recent', 'Recent Files', '🕐'],
    ],
  },
  {
    title: 'Context',
    items: [
      ['workspace', 'Workspace', '🧠'],
      ['project', 'Project', '📦'],
      ['document', 'Document', '📝'],
      ['saved', 'Saved Context', '💾'],
      ['agent', 'Mention Agent', '👤'],
      ['skill', 'Mention Skill', '🛠️'],
    ],
  },
  {
    title: 'Actions',
    items: [
      ['action', 'Run Action', '⚡'],
      ['repo', 'Search Repo', '🔍'],
      ['web', 'Web Search', '🌐'],
      ['research', 'Deep Research', '🧪'],
      ['genImage', 'Generate Image', '🎨'],
      ['genVideo', 'Generate Video', '📹'],
      ['genAudio', 'Generate Audio', '🔊'],
    ],
  },
];

/** Context-item kind → icon mapping */
export const CONTEXT_ICONS: Record<string, string> = {
  attachment: '📎',
  workspace: '🧠',
  memory: '💾',
  agent: '👤',
  chip: '⚡',
  model: '🤖',
  access: '🔒',
  file: '📄',
  folder: '📁',
  project: '📦',
  document: '📝',
  skill: '🛠️',
  url: '🔗',
};

/** Quick-chip category colors */
export const CHIP_CATEGORY_COLORS: Record<string, string> = {
  dev: 'border-l-cyan-400/50',
  research: 'border-l-amber-400/50',
  creative: 'border-l-fuchsia-400/50',
  media: 'border-l-emerald-400/50',
};

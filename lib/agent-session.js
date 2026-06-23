// ═══════════════════════════════════════════════════════════════════════════
// PURPCLAW — Agent Session Manager
// Manages working directory, session state, mission context.
// Every agent operation flows through here.
//
// Session lifecycle:
//   session.create(path) → session.use(id) → operations → session.close(id)
//
// ═══════════════════════════════════════════════════════════════════════════

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class AgentSession {
  constructor() {
    this.id = null;
    this.cwd = process.cwd();
    this.createdAt = null;
    this.missions = [];      // history of missions in this session
    this.currentMission = null;
    this.toolResults = [];    // recent tool call results
    this.workingFiles = new Set();  // files touched this session
  }

  // ─── Session lifecycle ─────────────────────────────────────────────────

  createSession(cwd = process.cwd()) {
    this.id = crypto.randomUUID();
    this.cwd = this.resolvePath(cwd);
    this.createdAt = Date.now();
    this.missions = [];
    this.currentMission = null;
    this.toolResults = [];
    this.workingFiles = new Set();

    // Ensure directory exists
    if (!fs.existsSync(this.cwd)) {
      throw new Error(`Working directory does not exist: ${this.cwd}`);
    }

    console.log(`[SESSION] Created: ${this.id} | cwd: ${this.cwd}`);
    return this.id;
  }

  useSession(sessionId, sessions) {
    const session = sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    this.id = session.id;
    this.cwd = session.cwd;
    this.createdAt = session.createdAt;
    this.missions = session.missions;
    this.currentMission = session.currentMission;
    this.toolResults = [];
    this.workingFiles = session.workingFiles || new Set();
    return this;
  }

  // ─── Mission management ───────────────────────────────────────────────

  startMission(description) {
    if (!this.id) throw new Error('No active session');
    this.currentMission = {
      id: crypto.randomUUID(),
      sessionId: this.id,
      description,
      startedAt: Date.now(),
      completedAt: null,
      status: 'active',
      tools: [],
      files: [],
      errors: []
    };
    this.missions.push(this.currentMission);
    console.log(`[SESSION] Mission started: ${description}`);
    return this.currentMission.id;
  }

  endMission(status = 'completed') {
    if (!this.currentMission) return;
    this.currentMission.completedAt = Date.now();
    this.currentMission.status = status;
    this.currentMission.duration = this.currentMission.completedAt - this.currentMission.startedAt;
    console.log(`[SESSION] Mission ended: ${status} (${this.currentMission.duration}ms)`);
    this.currentMission = null;
  }

  // ─── Working directory ────────────────────────────────────────────────

  resolvePath(p) {
    if (path.isAbsolute(p)) return p;
    return path.resolve(this.cwd, p);
  }

  chdir(dir) {
    const resolved = this.resolvePath(dir);
    if (!fs.existsSync(resolved)) throw new Error(`Directory not found: ${resolved}`);
    this.cwd = resolved;
    console.log(`[SESSION] cwd → ${this.cwd}`);
    return this.cwd;
  }

  // ─── Tool result tracking ─────────────────────────────────────────────

  recordTool(name, args, result) {
    this.toolResults.push({
      tool: name,
      args,
      result: typeof result === 'string' ? result.substring(0, 500) : result,
      timestamp: Date.now()
    });
    if (result && result.path) {
      this.workingFiles.add(result.path);
    }
    // Keep last 50 results
    if (this.toolResults.length > 50) this.toolResults.shift();
  }

  // ─── File tracking ───────────────────────────────────────────────────

  trackFile(filePath) {
    this.workingFiles.add(this.resolvePath(filePath));
  }

  getModifiedFiles() {
    return Array.from(this.workingFiles);
  }

  // ─── State snapshot ──────────────────────────────────────────────────

  snapshot() {
    return {
      id: this.id,
      cwd: this.cwd,
      createdAt: this.createdAt,
      missions: this.missions.map(m => ({
        id: m.id,
        description: m.description,
        startedAt: m.startedAt,
        completedAt: m.completedAt,
        duration: m.duration,
        status: m.status,
        toolsCount: m.tools?.length || 0,
        filesCount: m.files?.length || 0,
        errorsCount: m.errors?.length || 0
      })),
      currentMission: this.currentMission ? {
        id: this.currentMission.id,
        description: this.currentMission.description,
        startedAt: this.currentMission.startedAt,
        status: this.currentMission.status
      } : null,
      modifiedFiles: this.getModifiedFiles(),
      toolResultsCount: this.toolResults.length
    };
  }

  // ─── Git awareness ───────────────────────────────────────────────────

  async gitStatus() {
    const { execSync } = require('child_process');
    try {
      const status = execSync('git status --porcelain', { cwd: this.cwd, encoding: 'utf8', timeout: 5000, windowsHide: true });
      return status;
    } catch {
      return '';
    }
  }

  async gitDiff() {
    const { execSync } = require('child_process');
    try {
      const diff = execSync('git diff --stat', { cwd: this.cwd, encoding: 'utf8', timeout: 5000, windowsHide: true });
      return diff;
    } catch {
      return '';
    }
  }

  async gitBranch() {
    const { execSync } = require('child_process');
    try {
      const branch = execSync('git branch --show-current', { cwd: this.cwd, encoding: 'utf8', timeout: 5000, windowsHide: true });
      return branch.trim();
    } catch {
      return 'unknown';
    }
  }
}

// ─── Session Store ────────────────────────────────────────────────────────────

const sessions = new Map();

function createSession(cwd) {
  const session = new AgentSession();
  session.createSession(cwd);
  sessions.set(session.id, session);
  return session;
}

function getSession(id) {
  return sessions.get(id);
}

function listSessions() {
  return Array.from(sessions.entries()).map(([id, s]) => ({
    id,
    cwd: s.cwd,
    createdAt: s.createdAt,
    missionsCount: s.missions.length,
    activeMission: s.currentMission?.id || null
  }));
}

module.exports = { AgentSession, createSession, getSession, listSessions };
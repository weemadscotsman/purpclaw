'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.resolve(__dirname, '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fileStat(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return { exists: true, bytes: stat.size, updatedAt: stat.mtime.toISOString() };
  } catch {
    return { exists: false, bytes: 0, updatedAt: null };
  }
}

function resultFileName(missionId) {
  if (missionId === 'B1') return 'B1_RESULT.md';
  if (missionId === 'C1') return 'C1_RESULT.md';
  if (missionId === 'C1-codex') return 'C1_RESULT_CODEX_STRENGTHENED.md';
  if (missionId === 'G1') return 'G1_RESULT_CODEX.md';
  if (missionId === 'A-review') return 'A_REVIEW_RESULT.md';
  return `${missionId}_RESULT.md`;
}

function missionOwner(board, mission) {
  if (mission.owner) return mission.owner;
  if (mission.id === 'A-review') return 'Claude';
  const prefix = String(mission.id || '').replace(/[^A-Z].*$/, '');
  const lane = (board.lanes || []).find(item => item.id === prefix);
  return lane?.owner || 'Unassigned';
}

function getDelegationStatus(options = {}) {
  const root = path.resolve(options.rootDir || DEFAULT_ROOT);
  const boardPath = path.join(root, 'agent_work', 'delegation-board.json');
  const dispatchDir = path.join(root, 'agent_work', 'claude-dispatch');

  if (!fs.existsSync(boardPath)) {
    return {
      ok: false,
      error: 'delegation board missing',
      boardPath,
      updatedAt: new Date().toISOString(),
      lanes: [],
      missions: [],
      waiting: 0,
      posted: 0,
    };
  }

  let board = null;
  try {
    board = readJson(boardPath);
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      boardPath,
      updatedAt: new Date().toISOString(),
      lanes: [],
      missions: [],
      waiting: 0,
      posted: 0,
    };
  }

  const missions = (board.claudeMissions || []).map((mission) => {
    const fileName = resultFileName(mission.id);
    const filePath = path.join(dispatchDir, fileName);
    const file = fileStat(filePath);
    return {
      id: mission.id,
      title: mission.title,
      owner: missionOwner(board, mission),
      status: file.exists ? 'result-posted' : 'waiting',
      resultFile: path.relative(root, filePath),
      bytes: file.bytes,
      updatedAt: file.updatedAt,
      requiredProof: mission.requiredProof || [],
    };
  });

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    boardUpdatedAt: board.updatedAt,
    goal: board.goal,
    sharedTruth: board.sharedTruth || {},
    lanes: board.lanes || [],
    missions,
    waiting: missions.filter(m => m.status === 'waiting').length,
    posted: missions.filter(m => m.status === 'result-posted').length,
    doneGate: board.doneGate || [],
  };
}

module.exports = {
  getDelegationStatus,
  resultFileName,
};

'use strict';

const fs = require('fs');
const path = require('path');
const { getConfig } = require('./config');

/**
 * Kanban SQLite database schema and connection manager.
 *
 * Schema:
 *   boards(id, name, profile, dispatch_owner_pid, created_at)
 *   cards(id, board_id, title, status, assignee, priority, created_at)
 *
 * Status values: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done'
 * Priority values: 1 (low) | 2 (medium) | 3 (high) | 4 (critical)
 */

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS boards (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  profile          TEXT    NOT NULL DEFAULT 'default',
  dispatch_owner_pid INTEGER,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS cards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id    INTEGER NOT NULL,
  title       TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'backlog',
  assignee    TEXT,
  priority    INTEGER NOT NULL DEFAULT 2,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cards_board_id  ON cards(board_id);
CREATE INDEX IF NOT EXISTS idx_cards_status    ON cards(status);
CREATE INDEX IF NOT EXISTS idx_cards_assignee  ON cards(assignee);
`;

/**
 * Get the kanban DB path.
 * @returns {string}
 */
function getKanbanDBPath() {
  const config = getConfig();
  const purpDir = config.purp_dir || process.env.PURP_DIR || path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.purpclaw');
  const dbDir = path.join(purpDir, 'kanban');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  return path.join(dbDir, 'kanban.db');
}

/** @type {import('better-sqlite3').Database|null} */
let _db = null;

/**
 * Open (or return cached) the kanban database connection.
 * @returns {import('better-sqlite3').Database}
 */
function getDB() {
  if (_db) return _db;

  // Lazy-load better-sqlite3
  let SQLite;
  try {
    SQLite = require('better-sqlite3');
  } catch {
    // Fallback to sqlite3 (async)
    SQLite = require('sqlite3');
  }

  const dbPath = getKanbanDBPath();
  _db = new SQLite(dbPath);

  // Enable WAL mode for better concurrent-read performance
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // Init schema
  _db.exec(SCHEMA_SQL);

  return _db;
}

/**
 * Close the database connection.
 */
function closeDB() {
  if (_db) {
    try { _db.close(); } catch {}
    _db = null;
  }
}

// ─── Boards ─────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Board
 * @property {number} id
 * @property {string} name
 * @property {string} profile
 * @property {number|null} dispatch_owner_pid
 * @property {number} created_at
 */

/**
 * Get all boards for a profile.
 * @param {string} profile
 * @returns {Board[]}
 */
function getBoards(profile = 'default') {
  const db = getDB();
  return db.prepare('SELECT * FROM boards WHERE profile = ? ORDER BY created_at DESC').all(profile);
}

/**
 * Get a board by ID.
 * @param {number} id
 * @returns {Board|undefined}
 */
function getBoard(id) {
  const db = getDB();
  return db.prepare('SELECT * FROM boards WHERE id = ?').get(id);
}

/**
 * Create a new board.
 * @param {string} name
 * @param {string} profile
 * @returns {Board}
 */
function createBoard(name, profile = 'default') {
  const db = getDB();
  const info = db.prepare('INSERT INTO boards (name, profile) VALUES (?, ?)').run(name, profile);
  return getBoard(info.lastInsertRowid);
}

/**
 * Set the dispatch_owner_pid on a board.
 * @param {number} boardId
 * @param {number|null} pid
 */
function setBoardDispatchOwner(boardId, pid) {
  const db = getDB();
  db.prepare('UPDATE boards SET dispatch_owner_pid = ? WHERE id = ?').run(pid, boardId);
}

// ─── Cards ───────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Card
 * @property {number} id
 * @property {number} board_id
 * @property {string} title
 * @property {string} status
 * @property {string|null} assignee
 * @property {number} priority
 * @property {number} created_at
 */

/**
 * Get all cards for a board.
 * @param {number} boardId
 * @returns {Card[]}
 */
function getCards(boardId) {
  const db = getDB();
  return db.prepare('SELECT * FROM cards WHERE board_id = ? ORDER BY priority DESC, created_at ASC').all(boardId);
}

/**
 * Get cards by status for a board.
 * @param {number} boardId
 * @param {string} status
 * @returns {Card[]}
 */
function getCardsByStatus(boardId, status) {
  const db = getDB();
  return db.prepare('SELECT * FROM cards WHERE board_id = ? AND status = ? ORDER BY priority DESC, created_at ASC').all(boardId, status);
}

/**
 * Get unassigned high-priority cards for a board.
 * @param {number} boardId
 * @returns {Card[]}
 */
function getUnassignedCards(boardId) {
  const db = getDB();
  return db.prepare(
    'SELECT * FROM cards WHERE board_id = ? AND assignee IS NULL AND status NOT IN (\'done\', \'review\') ORDER BY priority DESC, created_at ASC LIMIT 10'
  ).all(boardId);
}

/**
 * Create a new card.
 * @param {number} boardId
 * @param {string} title
 * @param {string} [status='backlog']
 * @param {string|null} [assignee=null]
 * @param {number} [priority=2]
 * @returns {Card}
 */
function createCard(boardId, title, status = 'backlog', assignee = null, priority = 2) {
  const db = getDB();
  const info = db.prepare(
    'INSERT INTO cards (board_id, title, status, assignee, priority) VALUES (?, ?, ?, ?, ?)'
  ).run(boardId, title, status, assignee, priority);
  return db.prepare('SELECT * FROM cards WHERE id = ?').get(info.lastInsertRowid);
}

/**
 * Update a card's status.
 * @param {number} cardId
 * @param {string} status
 * @returns {boolean}
 */
function updateCardStatus(cardId, status) {
  const db = getDB();
  const result = db.prepare('UPDATE cards SET status = ? WHERE id = ?').run(status, cardId);
  return result.changes > 0;
}

/**
 * Assign a card to a user.
 * @param {number} cardId
 * @param {string} assignee
 * @returns {boolean}
 */
function assignCard(cardId, assignee) {
  const db = getDB();
  const result = db.prepare('UPDATE cards SET assignee = ? WHERE id = ?').run(assignee, cardId);
  return result.changes > 0;
}

/**
 * Update card priority.
 * @param {number} cardId
 * @param {number} priority
 * @returns {boolean}
 */
function updateCardPriority(cardId, priority) {
  const db = getDB();
  const result = db.prepare('UPDATE cards SET priority = ? WHERE id = ?').run(priority, cardId);
  return result.changes > 0;
}

/**
 * Delete a card.
 * @param {number} cardId
 * @returns {boolean}
 */
function deleteCard(cardId) {
  const db = getDB();
  const result = db.prepare('DELETE FROM cards WHERE id = ?').run(cardId);
  return result.changes > 0;
}

module.exports = {
  getDB,
  closeDB,
  // boards
  getBoards,
  getBoard,
  createBoard,
  setBoardDispatchOwner,
  // cards
  getCards,
  getCardsByStatus,
  getUnassignedCards,
  createCard,
  updateCardStatus,
  assignCard,
  updateCardPriority,
  deleteCard,
};

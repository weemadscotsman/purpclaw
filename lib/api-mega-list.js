'use strict';
/**
 * lib/api-mega-list.js — PurpClaw API Mega List integration.
 *
 * Loads the curated API list from cporter202/API-mega-list and exposes it
 * as a callable stack for the agent loop. The data is parsed once at module
 * load and cached in memory.
 *
 * Usage:
 *   const { getCategories, search, getByCategory, callApi } = require('./api-mega-list');
 *   const cats = getCategories();         // [{id, name, count, summary}]
 *   const hits = search('sentiment');     // [{category, name, url, description}]
 *   const apis = getByCategory('ai');     // all AI APIs
 *
 * NOTE: Most APIs in this list are Apify actors — to actually CALL them
 * programmatically, the user needs an APIFY_API_TOKEN. This module is the
 * catalog layer; execution is gated on token presence.
 */

const fs = require('fs');
const path = require('path');

// ── Configuration ───────────────────────────────────────────────
const API_LIST_ROOT = path.join(
  process.cwd(),
  'apis for agents'      // canonical location: <project>/apis for agents/
);
const ASSIGNMENTS_PATH = path.join(
  process.cwd(),
  'lib',
  'api-mega-list-assignments.json'
);

const CATEGORY_DEFINITIONS = [
  { dir: 'agents-apis-697',           name: 'Agents',        slug: 'agents' },
  { dir: 'ai-apis-1208',              name: 'AI',            slug: 'ai' },
  { dir: 'automation-apis-4825',      name: 'Automation',    slug: 'automation' },
  { dir: 'business-apis-2',           name: 'Business',      slug: 'business' },
  { dir: 'developer-tools-apis-2652', name: 'Developer Tools', slug: 'devtools' },
  { dir: 'ecommerce-apis-2440',       name: 'E-Commerce',    slug: 'ecommerce' },
  { dir: 'integrations-apis-890',     name: 'Integrations',  slug: 'integrations' },
  { dir: 'jobs-apis-848',             name: 'Jobs',          slug: 'jobs' },
  { dir: 'lead-generation-apis-3452', name: 'Lead Gen',      slug: 'leadgen' },
  { dir: 'mcp-servers-apis-131',      name: 'MCP Servers',   slug: 'mcp' },
  { dir: 'news-apis-590',             name: 'News',          slug: 'news' },
  { dir: 'open-source-apis-768',      name: 'Open Source',   slug: 'oss' },
  { dir: 'other-apis-1297',           name: 'Other',         slug: 'other' },
  { dir: 'real-estate-apis-851',      name: 'Real Estate',   slug: 'realestate' },
  { dir: 'seo-tools-apis-710',        name: 'SEO Tools',     slug: 'seo' },
  { dir: 'social-media-apis-3268',    name: 'Social Media',  slug: 'social' },
  { dir: 'travel-apis-397',           name: 'Travel',        slug: 'travel' },
  { dir: 'videos-apis-979',           name: 'Videos',        slug: 'videos' },
];

// ── Parser ──────────────────────────────────────────────────────
// Each category README is a markdown table:
//   | [API Name](url) | Description |
// Sometimes wrapped in HTML or with extra whitespace.
function parseCategoryReadme(markdown, category) {
  const apis = [];
  // The pattern: | [name](url) | description |
  // We tolerate multi-line descriptions, newlines, leading/trailing pipes.
  const lines = markdown.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Start of a row (begins with | and contains a markdown link)
    if (line.trim().startsWith('|') && line.includes('[') && line.includes('](')) {
      // Collect the full row (might span multiple lines if cells are long)
      let row = line;
      while (!row.trim().endsWith('|') && i + 1 < lines.length && lines[i + 1].trim().startsWith('|') === false && !lines[i + 1].includes('](')) {
        i++;
        row += ' ' + lines[i].trim();
      }
      // Parse: [name](url) + description
      const m = row.match(/\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|(.+)/);
      if (m) {
        const name = m[1].replace(/[🎙️✨🌐💅🪿🔥📧🦅🎯🏆🔍🪲🪰🐝🐰🐢🐘🐦🐺🐍🕷️🐦⬛🦉🐧🦊🐼🦜🦝🐔🐲🐉🐙🦄🦋🐌🐞🐜🦟🐛🦗🕷️]/g, '').trim();
        const url = m[2].trim();
        const desc = m[3].replace(/\|/g, '').trim();
        if (name && url && url.startsWith('http')) {
          apis.push({ category, name, url, description: desc });
        }
      }
    }
    i++;
  }
  return apis;
}

// ── Loader ──────────────────────────────────────────────────────
let _allApis = null;
let _byCategory = null;
let _summary = null;
let _assignments = null;

function _load() {
  if (_allApis) return { all: _allApis, byCategory: _byCategory, summary: _summary };

  _allApis = [];
  _byCategory = {};

  for (const def of CATEGORY_DEFINITIONS) {
    const dir = path.join(API_LIST_ROOT, def.dir);
    if (!fs.existsSync(dir)) continue;
    const readmePath = path.join(dir, 'README.md');
    if (!fs.existsSync(readmePath)) continue;

    let md;
    try {
      md = fs.readFileSync(readmePath, 'utf-8');
    } catch (e) {
      continue;
    }
    const apis = parseCategoryReadme(md, def.slug);
    _byCategory[def.slug] = apis;
    _allApis = _allApis.concat(apis);
  }

  _summary = {
    totalApis: _allApis.length,
    categories: CATEGORY_DEFINITIONS.map(def => ({
      id: def.slug,
      name: def.name,
      count: (_byCategory[def.slug] || []).length,
    })),
    loadedAt: new Date().toISOString(),
  };

  // Load division/agent assignments if available
  try {
    if (fs.existsSync(ASSIGNMENTS_PATH)) {
      _assignments = JSON.parse(fs.readFileSync(ASSIGNMENTS_PATH, 'utf-8'));
    }
  } catch (e) {
    _assignments = null;
  }

  return { all: _allApis, byCategory: _byCategory, summary: _summary };
}

// ── Public API ──────────────────────────────────────────────────
function getCategories() {
  return _load().summary.categories;
}

function getSummary() {
  return _load().summary;
}

function getByCategory(slug) {
  return _load().byCategory[slug] || [];
}

function search(query, limit = 50) {
  if (!query || typeof query !== 'string') return [];
  const q = query.toLowerCase().trim();
  const terms = q.split(/\s+/).filter(t => t.length > 1);
  if (terms.length === 0) return [];

  const scored = [];
  for (const api of _allApis) {
    const haystack = (api.name + ' ' + api.description + ' ' + api.category).toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (haystack.includes(t)) score += 1;
      // Boost name matches
      if (api.name.toLowerCase().includes(t)) score += 2;
    }
    if (score > 0) scored.push({ ...api, _score: score });
  }
  scored.sort((a, b) => b._score - a._score);
  return scored.slice(0, limit).map(({ _score, ...rest }) => rest);
}

function getApi(category, name) {
  const apis = _load().byCategory[category] || [];
  return apis.find(a => a.name === name) || null;
}

// ── Division/Agent assignment API ─────────────────────────────
function getAssignments() {
  _load(); // ensure loaded
  return _assignments;
}

function getAssignmentForCategory(slug) {
  _load();
  if (!_assignments || !_assignments.category_assignments) return null;
  return _assignments.category_assignments[slug] || null;
}

function getCategoriesForDivision(division) {
  _load();
  if (!_assignments || !_assignments.summary_by_division) return [];
  return _assignments.summary_by_division[division] || [];
}

function getCategoriesForAgent(agentName) {
  _load();
  if (!_assignments || !_assignments.category_assignments) return [];
  const out = [];
  for (const [slug, a] of Object.entries(_assignments.category_assignments)) {
    if ((a.primary_agents || []).map(x => x.toLowerCase()).includes(String(agentName).toLowerCase())) {
      out.push(slug);
    }
  }
  return out;
}

/**
 * callApi — generic invoke via Apify. Most APIs in the list are Apify actors.
 * Requires APIFY_API_TOKEN. Falls back to returning the URL when no token.
 */
async function callApi(category, name, args = {}) {
  const api = getApi(category, name);
  if (!api) {
    return { ok: false, error: `API not found: ${category}/${name}` };
  }

  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    return {
      ok: false,
      error: 'APIFY_API_TOKEN not set. Cannot invoke Apify actor.',
      api,
      hint: 'Set APIFY_API_TOKEN in .env to enable programmatic invocation.',
    };
  }

  // Most are Apify actors. Extract actor ID from URL like:
  //   https://apify.com/<user>/<actor>?fpr=...
  const m = api.url.match(/apify\.com\/([^/]+)\/([^/?#]+)/);
  if (!m) {
    return { ok: false, error: 'Not an Apify actor (no invocation possible from here)', api };
  }

  const actorId = `${m[1]}/${m[2]}`;
  const url = `https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args),
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data, api };
  } catch (e) {
    return { ok: false, error: e.message, api };
  }
}

module.exports = {
  getCategories,
  getSummary,
  getByCategory,
  search,
  getApi,
  callApi,
  getAssignments,
  getAssignmentForCategory,
  getCategoriesForDivision,
  getCategoriesForAgent,
  CATEGORY_DEFINITIONS,
};

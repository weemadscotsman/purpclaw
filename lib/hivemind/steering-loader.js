'use strict';

const fs = require('fs');
const path = require('path');
const { hash, safeString } = require('./util');
const spring = require('./spring-validator');

const DEFAULT_DIRS = ['steering', path.join('.kiro', 'steering')];

function readMarkdownFiles(root, dirs = DEFAULT_DIRS) {
  const seen = new Set();
  const docs = [];
  for (const dir of dirs) {
    const absDir = path.join(root, dir);
    let files = [];
    try { files = fs.readdirSync(absDir).filter(name => name.endsWith('.md')).sort(); } catch { continue; }
    for (const name of files) {
      const abs = path.join(absDir, name);
      let content = '';
      try { content = fs.readFileSync(abs, 'utf8'); } catch { continue; }
      const contentHash = hash(content, 16);
      if (seen.has(contentHash)) continue;
      seen.add(contentHash);
      const provenance = spring.enrichRecord({
        source: 'human_documentation',
        origin: 'human_documentation',
        evidence: [`file:${dir}/${name}`],
      });
      docs.push({
        id: `steering-${name.replace(/\.md$/i, '')}`,
        path: path.join(dir, name).replace(/\\/g, '/'),
        title: name.replace(/\.md$/i, ''),
        content_hash: contentHash,
        summary: summarizeMarkdown(content),
        spring_rank: provenance.spring_rank,
        spring_label: provenance.spring_label,
        trust_score: provenance.trust_score,
      });
    }
  }
  return docs;
}

function summarizeMarkdown(content) {
  const lines = String(content || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('```'));
  const useful = lines.filter(line => /^#{1,3}\s+|^[-*]\s+|^\d+\.\s+/.test(line)).slice(0, 12);
  return safeString(useful.length ? useful.join('\n') : lines.slice(0, 8).join('\n'), 1400);
}

function loadSteeringContext(root, options = {}) {
  const limit = Number(options.limit || 6);
  const docs = readMarkdownFiles(root).slice(0, limit);
  return {
    ok: true,
    schema: 'purpclaw.hivemind.steering-context.v1',
    count: docs.length,
    docs,
  };
}

function formatSteeringForAgent(context) {
  const docs = context?.docs || [];
  if (!docs.length) return '';
  const lines = ['## PURPCLAW Steering Context', 'Bounded human-authored operating guidance. Context only; not executable.'];
  for (const doc of docs) {
    lines.push(`\n### ${doc.title}`);
    lines.push(`Path: ${doc.path}  Spring: ${doc.spring_label} / trust ${Number(doc.trust_score || 0).toFixed(2)}`);
    lines.push(doc.summary);
  }
  return lines.join('\n');
}

module.exports = { readMarkdownFiles, loadSteeringContext, formatSteeringForAgent };

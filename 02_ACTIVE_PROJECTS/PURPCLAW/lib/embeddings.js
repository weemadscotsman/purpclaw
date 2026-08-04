'use strict';
/**
 * lib/embeddings.js — PurpClaw hosted embeddings client
 *
 * Backed by NVIDIA NIM's free `baai/bge-m3` embedding model.
 *   POST https://integrate.api.nvidia.com/v1/embeddings
 *   { model: "baai/bge-m3", input: "...", input_type: "query" | "passage" }
 *   → 1024-dim float vector
 *
 * This is the spine's vector backend. No local numpy / sentence-transformers
 * required. The Pocket OS can run on a USB with no Python ML stack.
 *
 *   purpclaw embeddings "your text here"   → prints 1024-dim vector
 *   await embed(["text1", "text2"])        → returns Float32Array[]
 *   await embed("a single text")           → returns Float32Array
 */
const https = require('https');

const DEFAULT_EMBED_URL = 'https://integrate.api.nvidia.com/v1/embeddings';
const DEFAULT_MODEL = 'baai/bge-m3';
const DEFAULT_DIM = 1024;

function getApiKey() {
  return process.env.NVIDIA_API_KEY || process.env.NVAPI_KEY || '';
}

function getBaseUrl() {
  return process.env.NVIDIA_EMBED_BASE_URL || DEFAULT_EMBED_URL;
}

function getModel() {
  return process.env.NVIDIA_EMBED_MODEL || DEFAULT_MODEL;
}

/**
 * Embed one or more text strings. Returns Promise<number[][]>.
 *
 * Each input becomes a 1024-dim vector (for bge-m3). Use input_type
 * to switch between query (search query) and passage (indexed doc).
 */
async function embed(inputs, opts = {}) {
  const apiKey = opts.apiKey || getApiKey();
  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY not set. Get a free key at https://build.nvidia.com');
  }

  const texts = Array.isArray(inputs) ? inputs : [inputs];
  if (texts.length === 0) return [];
  if (texts.some(t => typeof t !== 'string' || t.length === 0)) {
    throw new Error('embed() requires non-empty strings');
  }

  const body = {
    model: opts.model || getModel(),
    input: texts,
    input_type: opts.inputType || 'passage',
    encoding_format: 'float',
  };

  return new Promise((resolve, reject) => {
    const url = new URL(opts.baseUrl || getBaseUrl());
    const data = JSON.stringify(body);

    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'accept': 'application/json',
      },
      timeout: opts.timeoutMs || 30_000,
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            reject(new Error(`NVIDIA embeddings HTTP ${res.statusCode}: ${d.substring(0, 200)}`));
            return;
          }
          const parsed = JSON.parse(d);
          if (!parsed.data || !Array.isArray(parsed.data)) {
            reject(new Error('NVIDIA embeddings response missing data array: ' + d.substring(0, 200)));
            return;
          }
          // Sort by index in case NVIDIA returns them out of order
          const sorted = parsed.data.slice().sort((a, b) => (a.index || 0) - (b.index || 0));
          const vectors = sorted.map(item => item.embedding);
          resolve(vectors);
        } catch (e) {
          reject(new Error('Failed to parse NVIDIA embeddings response: ' + e.message));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('NVIDIA embeddings request timed out'));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSim(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Convenience: embed a query, embed a list of passages, return top-K matches.
 */
async function semanticSearch(query, passages, opts = {}) {
  const topK = opts.topK || 5;
  const [queryVec, ...passageVecs] = await embed(
    [opts.queryInputType || 'query', ...passages.map(p => opts.passageInputType || 'passage')],
    opts
  );
  const scored = passages.map((p, i) => ({
    text: p,
    score: cosineSim(queryVec, passageVecs[i]),
    index: i,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Health check: verify the key works and the model is provisioned.
 */
async function health() {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: false, reason: 'NVIDIA_API_KEY not set' };
  }
  try {
    const v = await embed('test', { inputType: 'query', timeoutMs: 10_000 });
    return {
      ok: true,
      model: getModel(),
      dim: v[0]?.length || 0,
      baseUrl: getBaseUrl(),
    };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

module.exports = {
  embed,
  cosineSim,
  semanticSearch,
  health,
  getModel,
  getBaseUrl,
  DEFAULT_MODEL,
  DEFAULT_DIM,
};

// CLI mode
if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'embed';

  if (cmd === 'health') {
    health().then(h => {
      if (h.ok) {
        console.log(`✓ ${h.model} OK · ${h.dim}-dim · ${h.baseUrl}`);
      } else {
        console.log(`✗ ${h.reason}`);
        process.exit(1);
      }
    });
  } else if (cmd === 'embed') {
    const text = args.slice(1).join(' ');
    if (!text) {
      console.log('usage: purpclaw embeddings <text>');
      console.log('       purpclaw embeddings health');
      process.exit(1);
    }
    embed(text).then(v => {
      console.log(`Dim: ${v[0].length}`);
      console.log(`First 5: [${v[0].slice(0, 5).map(x => x.toFixed(4)).join(', ')}, ...]`);
      console.log(`Last 5:  [..., ${v[0].slice(-5).map(x => x.toFixed(4)).join(', ')}]`);
    }).catch(e => {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    });
  } else {
    console.log('usage: purpclaw embeddings <text> | health');
  }
}

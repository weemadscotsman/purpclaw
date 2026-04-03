'use strict';

const path = require('path');

function maskBool(value, C, col) {
  return value ? col(C.green, 'configured') : col(C.yellow, 'missing');
}

async function run(args, ctx) {
  const { PURP_DIR, C, col, banner, sectionHead } = ctx;
  const llm = require(path.join(PURP_DIR, 'lib', 'llm-provider.js'));
  const sub = (args[0] || 'status').toLowerCase();
  const wantJson = args.includes('--json');

  if (sub === 'providers') {
    const providers = llm.listProviders();
    if (wantJson) {
      console.log(JSON.stringify(providers, null, 2));
      return;
    }
    banner();
    sectionHead('  LLM PROVIDERS');
    for (const p of providers) {
      const aliasKeys = Object.values(p.aliases || {}).flat();
      console.log(`  ${col(C.cyan, p.name.padEnd(11))} ${String(p.format).padEnd(9)} ${col(p.local ? C.green : C.gray, p.local ? 'local' : 'cloud')}  ${col(C.gray, p.defaultModel || '')}`);
      if (aliasKeys.length) console.log(col(C.gray, `              aliases: ${aliasKeys.join(', ')}`));
    }
    console.log('');
    return;
  }

  const info = llm.getProviderInfo();
  if (wantJson) {
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  banner();
  sectionHead('  LLM STATUS');
  console.log(`  Main provider  : ${col(C.cyan, info.main.provider)}  ${col(C.gray, info.main.model)}  ${maskBool(info.main.hasKey, C, col)}`);
  console.log(`  Main base URL  : ${col(C.gray, info.main.baseUrl || '(none)')}`);
  console.log(`  Swarm provider : ${col(C.cyan, info.swarm.provider)}  ${col(C.gray, info.swarm.model)}  ${maskBool(info.swarm.hasKey, C, col)}`);
  console.log(`  Swarm base URL : ${col(C.gray, info.swarm.baseUrl || '(none)')}`);
  console.log('');
  console.log(col(C.gray, '  Use: purpclaw llm providers'));
  console.log(col(C.gray, '  Configure: purpclaw config set LLM_PROVIDER anthropic'));
  console.log(col(C.gray, '  Native aliases accepted: ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, KIMI_API_KEY\n'));
}

module.exports = { run };

'use strict';

function toolCall(ctx, name, args) {
  return ctx.httpPost(ctx.PORTS.api || 7780, '/api/tools/call', { name, arguments: args || {} }, 60000);
}

function textFromToolResponse(resp) {
  const body = resp && resp.body ? resp.body : resp;
  return body?.content?.[0]?.text || body?.error || JSON.stringify(body, null, 2);
}

async function run(args, ctx) {
  const { C, col, banner, sectionHead } = ctx;
  const sub = (args[0] || 'status').toLowerCase();
  const rest = args.slice(1);
  const wantJson = args.includes('--json');

  try {
    let result = null;
    if (sub === 'open' || sub === 'goto') {
      const url = rest.find(a => !a.startsWith('--'));
      if (!url) throw new Error('URL required');
      result = await toolCall(ctx, 'browser_open', { url });
    } else if (sub === 'content' || sub === 'read') {
      result = await toolCall(ctx, 'browser_get_content', { max_length: 5000 });
    } else if (sub === 'screenshot') {
      result = await toolCall(ctx, 'browser_screenshot', {});
    } else if (sub === 'click') {
      const target = rest.find(a => !a.startsWith('--'));
      if (!target) throw new Error('target text or selector required');
      result = await toolCall(ctx, 'browser_click', { target });
    } else if (sub === 'type') {
      const text = rest.join(' ').trim();
      if (!text) throw new Error('text required');
      result = await toolCall(ctx, 'browser_type', { text, submit: args.includes('--submit') });
    } else if (sub === 'tabs' || sub === 'status') {
      result = await toolCall(ctx, 'browser_tabs', {});
    } else if (sub === 'smoke') {
      const url = rest.find(a => !a.startsWith('--')) || 'http://127.0.0.1:7780/api/health';
      const opened = await toolCall(ctx, 'browser_open', { url });
      const content = await toolCall(ctx, 'browser_get_content', { max_length: 1200 });
      result = { body: { content: [{ type: 'text', text: `${textFromToolResponse(opened)}\n\n${textFromToolResponse(content)}` }] } };
    } else {
      if (!wantJson) {
        banner();
        sectionHead('  BROWSER TOOLS');
        console.log(`  ${col(C.cyan, 'purpclaw browser open <url>')}       open URL`);
        console.log(`  ${col(C.cyan, 'purpclaw browser content')}          read current page`);
        console.log(`  ${col(C.cyan, 'purpclaw browser click <target>')}    click text/selector`);
        console.log(`  ${col(C.cyan, 'purpclaw browser type <text>')}       type into first visible input`);
        console.log(`  ${col(C.cyan, 'purpclaw browser screenshot')}        capture PNG`);
        console.log(`  ${col(C.cyan, 'purpclaw browser smoke [url]')}       open + read smoke test\n`);
      }
      return;
    }

    if (wantJson) {
      console.log(JSON.stringify(result.body || result, null, 2));
      return;
    }
    banner();
    sectionHead('  BROWSER RESULT');
    console.log(textFromToolResponse(result));
    console.log('');
  } catch (e) {
    if (wantJson) {
      console.log(JSON.stringify({ ok: false, error: e.message }, null, 2));
      process.exitCode = 1;
      return;
    }
    console.error(col(C.red, `\n  x browser failed: ${e.message}\n`));
    process.exitCode = 1;
  }
}

module.exports = { run };

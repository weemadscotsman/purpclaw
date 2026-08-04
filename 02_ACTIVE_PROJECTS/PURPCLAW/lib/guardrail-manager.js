'use strict';
const SCHEMA = require('./schema-validator');
const text=value=>typeof value==='string'?value:JSON.stringify(value);

function run(value, guardrails = [], context = {}) {
  const results = [];
  for (const guardrail of guardrails || []) {
    const item = typeof guardrail === 'string' ? { type: guardrail } : guardrail;
    let ok = true, reason = '';
    if (item.type === 'json_schema') {
      const check = SCHEMA.parseAndValidate(value, item.schema || {}); ok = check.ok; reason = check.errors.join('; ');
    } else if (item.type === 'deny_pattern') {
      ok = !new RegExp(item.pattern, item.flags || 'i').test(text(value)); reason = ok ? '' : `matched denied pattern ${item.pattern}`;
    } else if (item.type === 'require_pattern') {
      ok = new RegExp(item.pattern, item.flags || 'i').test(text(value)); reason = ok ? '' : `missing required pattern ${item.pattern}`;
    } else if (item.type === 'max_length') {
      ok = String(value).length <= Number(item.value); reason = ok ? '' : `exceeds ${item.value} characters`;
    } else if (typeof item.check === 'function') {
      const result = item.check(value, context); ok = result === true || result?.ok === true; reason = result?.reason || (ok ? '' : 'custom guardrail rejected value');
    } else throw new Error(`unknown guardrail type: ${item.type}`);
    results.push({ name: item.name || item.type, ok, reason });
    if (!ok && item.action !== 'warn') return { ok: false, tripwire: item.name || item.type, reason, results };
  }
  return { ok: true, results };
}
async function runParallel(value,guardrails=[],context={}){
  const checks=await Promise.all((guardrails||[]).map(async guardrail=>{
    const item=typeof guardrail==='string'?{type:guardrail}:guardrail;
    if(typeof item.check==='function'){const result=await item.check(value,context),ok=result===true||result?.ok===true;return{name:item.name||'custom',ok,reason:result?.reason||(ok?'':'custom guardrail rejected value'),action:item.action};}
    const result=run(value,[item],context);return{...(result.results[0]||{}),action:item.action};
  }));
  const failed=checks.find(item=>!item.ok&&item.action!=='warn');return failed?{ok:false,tripwire:failed.name,reason:failed.reason,results:checks}:{ok:true,results:checks};
}
module.exports = { run, runParallel };

'use strict';
const SCHEMA=require('./schema-validator'),GUARDRAILS=require('./guardrail-manager');
async function check(answer,options={},context={}){
  const guard=await GUARDRAILS.runParallel(answer,options.guardrails||[],context);
  if(!guard.ok)return{ok:false,kind:'guardrail',reason:guard.reason,guard};
  if(options.schema){const schema=SCHEMA.parseAndValidate(answer,options.schema);if(!schema.ok)return{ok:false,kind:'schema',reason:schema.errors.join('; '),schema};return{ok:true,value:schema.value,guard};}
  return{ok:true,value:undefined,guard};
}
async function enforce(initialAnswer,generate,options={},context={}){
  let answer=initialAnswer,attempt=0,last;
  const retries=Math.max(0,Math.min(Number(options.retries??2),10));
  while(true){last=await check(answer,options,context);if(last.ok)return{answer,output:last.value,attempts:attempt,validation:last};if(attempt>=retries){const error=new Error(`output ${last.kind} validation failed after ${attempt+1} attempt(s): ${last.reason}`);error.code='OUTPUT_VALIDATION_FAILED';error.validation=last;error.attempts=attempt;throw error;}attempt++;const prompt=`Your previous response failed ${last.kind} validation.\nErrors: ${last.reason}\nReturn a corrected response only. Preserve the requested meaning and satisfy every constraint.${options.schema?`\nRequired JSON Schema:\n${JSON.stringify(options.schema)}`:''}`;options.onRetry?.({attempt,reason:last.reason,kind:last.kind,answer});answer=await generate(prompt,{attempt,previous:answer,validation:last});}
}
module.exports={check,enforce};

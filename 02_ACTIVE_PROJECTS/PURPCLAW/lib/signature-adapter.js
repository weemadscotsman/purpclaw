'use strict';const SCHEMA=require('./schema-validator');
function chat(program,input){const system=program.instruction||program.signature?.description||'',content=typeof input==='string'?input:JSON.stringify(input);return[{role:'system',content:system},{role:'user',content}];}
function json(program,input){return{instruction:program.instruction||'',signature:program.signature||null,input,output_schema:program.output_schema||null};}
function parse(program,value){if(!program.output_schema)return value;const checked=SCHEMA.parseAndValidate(value,program.output_schema);if(!checked.ok)throw new Error(`signature output invalid: ${checked.errors.join('; ')}`);return checked.value;}
function render(program,input,adapter='chat'){if(adapter==='json')return JSON.stringify(json(program,input));return chat(program,input).map(item=>`${item.role.toUpperCase()}: ${item.content}`).join('\n\n');}
module.exports={chat,json,parse,render};

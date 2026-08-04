'use strict';
const SCHEMA=require('./schema-validator');
function mergeValue(current,incoming,reducer='replace'){
  switch(reducer){
    case'append':return[...(Array.isArray(current)?current:current==null?[]:[current]),...(Array.isArray(incoming)?incoming:[incoming])];
    case'sum':return Number(current||0)+Number(incoming||0);
    case'merge':return{...(current&&typeof current==='object'?current:{}),...(incoming&&typeof incoming==='object'?incoming:{})};
    case'max':return current==null?incoming:Math.max(current,incoming);
    case'min':return current==null?incoming:Math.min(current,incoming);
    case'replace':default:return incoming;
  }
}
function apply(context,updates={},reducers={}){for(const[key,value]of Object.entries(updates||{}))context[key]=mergeValue(context[key],value,reducers[key]||'replace');return context;}
function validate(context,schema){if(!schema)return{ok:true,errors:[]};return SCHEMA.validate(context,schema);}
function assertValid(context,schema,stage='workflow state'){const result=validate(context,schema);if(!result.ok)throw new Error(`${stage} validation failed: ${result.errors.join('; ')}`);return context;}
module.exports={mergeValue,apply,validate,assertValid};

'use strict';const path=require('path'),crypto=require('crypto');const{DatabaseSync}=require('node:sqlite'),SCHEMA=require('./schema-validator');const DB=process.env.PURPCLAW_SESSION_DB||path.join(process.cwd(),'.purpclaw','state.db'),db=new DatabaseSync(DB),definitions=new Map();
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS event_workflow_runs(id TEXT PRIMARY KEY,workflow TEXT NOT NULL,status TEXT NOT NULL,state TEXT NOT NULL,output TEXT,error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);CREATE TABLE IF NOT EXISTS event_workflow_events(id INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT NOT NULL,type TEXT NOT NULL,payload TEXT NOT NULL,correlation_id TEXT,created_at TEXT NOT NULL);CREATE INDEX IF NOT EXISTS idx_event_workflow_events ON event_workflow_events(run_id,id);`);const uid=()=>`event-flow-${crypto.randomUUID()}`,now=()=>new Date().toISOString();

// Canonical typed message contract (AutoGen/Microsoft Agent Framework parity).
// Every inter-agent and team message has a discriminator and a strict payload shape.
// Workflows can OPT IN to these via the `useCanonicalMessages` flag in their definition,
// or register additional custom types alongside.
const CANONICAL_MESSAGE_TYPES = {
  TextMessage: {
    schema: {
      type: 'object',
      required: ['source', 'content'],
      properties: {
        source: { type: 'string' },
        content: { type: 'string' },
        // Optional structured metadata (turn number, model id, etc.)
        metadata: { type: 'object' },
      },
      additionalProperties: false,
    },
  },
  ToolCallMessage: {
    schema: {
      type: 'object',
      required: ['source', 'tool', 'arguments'],
      properties: {
        source: { type: 'string' },
        tool: { type: 'string' },
        arguments: { type: 'object' },
        tool_call_id: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  ToolResultMessage: {
    schema: {
      type: 'object',
      required: ['source', 'tool', 'result'],
      properties: {
        source: { type: 'string' },
        tool: { type: 'string' },
        tool_call_id: { type: 'string' },
        result: {}, // any — tool returns are arbitrary
        error: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  HandoffMessage: {
    schema: {
      type: 'object',
      required: ['source', 'target'],
      properties: {
        source: { type: 'string' },
        target: { type: 'string' },
        context: { type: 'object' },
        reason: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  StopMessage: {
    schema: {
      type: 'object',
      required: ['source', 'reason'],
      properties: {
        source: { type: 'string' },
        reason: { type: 'string' },
        output: {},
      },
      additionalProperties: false,
    },
  },
};

function getCanonicalType(name) {
  return CANONICAL_MESSAGE_TYPES[name] ? { name, ...CANONICAL_MESSAGE_TYPES[name] } : null;
}

function listCanonicalTypes() {
  return Object.keys(CANONICAL_MESSAGE_TYPES).map(name => ({ name, schema: CANONICAL_MESSAGE_TYPES[name].schema }));
}

function validateCanonicalMessage(name, payload) {
  const def = CANONICAL_MESSAGE_TYPES[name];
  if (!def) return { ok: false, errors: [`unknown canonical message type: ${name}`] };
  return SCHEMA.validate(payload, def.schema);
}

function define(name,definition){if(!name||!Array.isArray(definition?.steps))throw new Error('event workflow requires name and steps');definitions.set(name,{eventSchemas:definition.eventSchemas||{},stateSchema:definition.stateSchema||null,useCanonicalMessages:definition.useCanonicalMessages===true,...definition});return()=>definitions.delete(name);}
function get(id){const row=db.prepare('SELECT * FROM event_workflow_runs WHERE id=?').get(id);return row?{...row,state:JSON.parse(row.state),output:JSON.parse(row.output||'null')}:null;}function history(id){return db.prepare('SELECT * FROM event_workflow_events WHERE run_id=? ORDER BY id').all(id).map(row=>({...row,payload:JSON.parse(row.payload)}));}
function persist(run){db.prepare('UPDATE event_workflow_runs SET status=?,state=?,output=?,error=?,updated_at=? WHERE id=?').run(run.status,JSON.stringify(run.state),JSON.stringify(run.output??null),run.error||null,now(),run.id);}
function start(name,input={}){const definition=definitions.get(name);if(!definition)throw new Error(`event workflow not found: ${name}`);if(definition.stateSchema){const checked=SCHEMA.validate(input,definition.stateSchema);if(!checked.ok)throw new Error(`process state invalid: ${checked.errors.join('; ')}`);}const id=uid(),stamp=now();db.prepare('INSERT INTO event_workflow_runs VALUES(?,?,?,?,?,?,?,?)').run(id,name,'waiting',JSON.stringify(input),null,null,stamp,stamp);return get(id);}
async function send(id,type,payload={},options={}){const run=get(id),definition=definitions.get(run?.workflow);if(!run||!definition)throw new Error(`event workflow run not found: ${id}`);let schema=definition.eventSchemas[type];if(definition.useCanonicalMessages){const canonical=getCanonicalType(type);if(!canonical)throw new Error(`useCanonicalMessages=true but event type '${type}' is not a canonical message type. Registered canonical types: ${Object.keys(CANONICAL_MESSAGE_TYPES).join(', ')}`);schema=canonical.schema;}if(schema){const checked=SCHEMA.validate(payload,schema);if(!checked.ok)throw new Error(`event ${type} invalid: ${checked.errors.join('; ')}`);}db.prepare('INSERT INTO event_workflow_events(run_id,type,payload,correlation_id,created_at) VALUES(?,?,?,?,?)').run(id,type,JSON.stringify(payload),options.correlation_id||null,now());run.status='running';persist(run);const queue=[{type,payload,correlation_id:options.correlation_id}],emitted=[];try{while(queue.length){const event=queue.shift(),steps=definition.steps.filter(step=>(Array.isArray(step.on)?step.on:[step.on]).includes(event.type));for(const step of steps){const result=await step.handler({event,state:run.state,run_id:id,correlation_id:event.correlation_id,history:history(id)});if(result?.state)run.state={...run.state,...result.state};if(definition.stateSchema){const checked=SCHEMA.validate(run.state,definition.stateSchema);if(!checked.ok)throw new Error(`process state invalid after ${step.name||step.on}: ${checked.errors.join('; ')}`);}for(const next of result?.events||[]){queue.push(next);emitted.push(next);db.prepare('INSERT INTO event_workflow_events(run_id,type,payload,correlation_id,created_at) VALUES(?,?,?,?,?)').run(id,next.type,JSON.stringify(next.payload||{}),next.correlation_id||event.correlation_id||null,now());}if(Object.prototype.hasOwnProperty.call(result||{},'output')){run.output=result.output;run.status='completed';}else if(result?.wait!==false)run.status='waiting';persist(run);}}return{...get(id),emitted};}catch(error){run.status='failed';run.error=error.message;persist(run);throw error;}}
module.exports={define,start,send,get,history,persist,validateCanonicalMessage,getCanonicalType,listCanonicalTypes,CANONICAL_MESSAGE_TYPES,DB};

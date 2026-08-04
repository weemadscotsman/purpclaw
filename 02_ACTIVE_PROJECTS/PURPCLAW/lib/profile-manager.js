'use strict';
const fs=require('fs'),path=require('path');const ROOT=path.resolve(__dirname,'..'),DIR=path.join(ROOT,'.purpclaw','profiles'),ACTIVE=path.join(ROOT,'.purpclaw','active-profile');
function valid(n){if(!/^[a-zA-Z0-9_-]{1,64}$/.test(n||''))throw new Error('invalid profile name');return n;}function file(n){return path.join(DIR,valid(n),'config.json');}
function create(name,config={}){const f=file(name);fs.mkdirSync(path.dirname(f),{recursive:true});const old=get(name)||{};const value={...old,name,createdAt:old.createdAt||new Date().toISOString(),...config};fs.writeFileSync(f,JSON.stringify(value,null,2));return value;}
function get(name){try{return JSON.parse(fs.readFileSync(file(name),'utf8'));}catch{return null;}}function list(){fs.mkdirSync(DIR,{recursive:true});return fs.readdirSync(DIR,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>get(e.name)).filter(Boolean);}
function active(){try{return valid(fs.readFileSync(ACTIVE,'utf8').trim());}catch{return'default';}}function activate(name){const p=get(name);if(!p)throw new Error(`profile not found: ${name}`);fs.mkdirSync(path.dirname(ACTIVE),{recursive:true});fs.writeFileSync(ACTIVE,name);return p;}function update(name,patch={}){return create(name,{...(get(name)||{}),...patch,name});}
if(!get('default'))create('default');module.exports={create,get,list,active,activate,update,DIR};

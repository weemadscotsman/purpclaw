'use strict';
const fs = require('fs');
const path = require('path');
const DEFINITIONS = Object.freeze([
  { name: 'telegram', token: 'TELEGRAM_BOT_TOKEN', channels: 'TELEGRAM_ALLOWED_CHATS', file: 'telegram.js', limit: 4096 },
  { name: 'discord', token: 'DISCORD_BOT_TOKEN', channels: 'DISCORD_CHANNEL_IDS', file: 'discord.js', limit: 2000 },
  { name: 'slack', token: 'SLACK_BOT_TOKEN', channels: 'SLACK_CHANNEL_IDS', file: 'slack.js', limit: 40000 },
  { name: 'email', token: 'EMAIL_IMAP_HOST', channels: 'EMAIL_ALLOW_FROM', file: 'email.js', limit: 100000 },
]);
function list() { return DEFINITIONS.map(definition => ({ ...definition, installed: fs.existsSync(path.join(__dirname, 'gateways', definition.file)), configured: Boolean(process.env[definition.token]), allowlistConfigured: Boolean(process.env[definition.channels]) })); }
function get(name) { return list().find(item => item.name === name) || null; }
module.exports = { list, get, DEFINITIONS };

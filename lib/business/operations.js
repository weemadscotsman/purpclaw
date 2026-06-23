'use strict';

const crypto = require('crypto');
const { readJson, writeJson, readJsonl, appendJsonl } = require('./store');

const DEFAULT_COMPANY = {
  companyName: 'PurpClaw',
  legalName: null,
  jurisdiction: null,
  entityType: null,
  website: null,
  contactEmail: null,
  formationStatus: 'not-started',
  einStatus: 'not-started',
  bankStatus: 'not-started',
  accountingStatus: 'not-started',
  insuranceStatus: 'not-started',
  paymentProcessorStatus: 'not-started',
  messagingComplianceStatus: 'not-started',
  updatedAt: null,
};

const DEFAULT_PRODUCTS = [
  {
    sku: 'PURPCLAW-LOCAL',
    name: 'PurpClaw Local AI Workstation Setup',
    type: 'service',
    status: 'draft',
    price: null,
    currency: 'USD',
    proofRequired: ['repeatable install', 'health report', 'customer onboarding runbook'],
  },
  {
    sku: 'PURPCLAW-OPS',
    name: 'PurpClaw Managed Agent Operations',
    type: 'subscription',
    status: 'draft',
    price: null,
    currency: 'USD',
    proofRequired: ['workflow completion rate', 'operator approval controls', 'support SLA'],
  },
  {
    sku: 'PURPCLAW-POCKET',
    name: 'PurpClaw Pocket OS Deployment',
    type: 'service',
    status: 'draft',
    price: null,
    currency: 'USD',
    proofRequired: ['portable install', 'recovery test', 'data ownership statement'],
  },
];

const CHECKLIST = [
  ['proof', 'Document reproducible product proof and customer outcome'],
  ['jurisdiction', 'Choose formation jurisdiction with qualified legal/tax advice'],
  ['entity', 'Register the legal entity'],
  ['tax-id', 'Obtain the applicable tax identifier, such as an EIN in the US'],
  ['bank', 'Open a dedicated business bank account'],
  ['accounting', 'Set up bookkeeping, chart of accounts, and expense controls'],
  ['insurance', 'Review general liability, professional liability, and cyber coverage'],
  ['payments', 'Configure a payment processor and refund/terms policies'],
  ['website', 'Publish business identity, product, privacy, terms, and contact pages'],
  ['messaging', 'Register compliant Twilio sender and documented opt-in flow'],
  ['store', 'Create draft products and test checkout/fulfillment'],
  ['procurement', 'Create approved-vendor and purchase-approval policy'],
  ['credit', 'Review credit only after entity, tax ID, bank, budget, and repayment plan exist'],
  ['fundraise', 'Prepare consistent evidence, model, deck, data room, and investor target list'],
];

function initialize(rootDir, overrides = {}) {
  const existing = readJson(rootDir, 'company.json', DEFAULT_COMPANY);
  const company = {
    ...DEFAULT_COMPANY,
    ...existing,
    ...overrides,
    updatedAt: new Date().toISOString(),
  };
  const products = readJson(rootDir, 'products.json', DEFAULT_PRODUCTS);
  const checklist = readJson(
    rootDir,
    'checklist.json',
    CHECKLIST.map(([id, task]) => ({ id, task, status: 'pending', evidence: [] }))
  );
  writeJson(rootDir, 'company.json', company);
  writeJson(rootDir, 'products.json', products);
  writeJson(rootDir, 'checklist.json', checklist);
  return { company, products, checklist };
}

function readiness(rootDir) {
  const company = readJson(rootDir, 'company.json', DEFAULT_COMPANY);
  const checklist = readJson(
    rootDir,
    'checklist.json',
    CHECKLIST.map(([id, task]) => ({ id, task, status: 'pending', evidence: [] }))
  );
  const products = readJson(rootDir, 'products.json', []);
  const consents = readJsonl(rootDir, 'consent.jsonl');
  const completed = checklist.filter(item => item.status === 'complete').length;
  const requiredCompanyFields = ['legalName', 'jurisdiction', 'entityType', 'website', 'contactEmail'];
  const knownFields = requiredCompanyFields.filter(field => Boolean(company[field])).length;
  return {
    company,
    checklist,
    products,
    consents,
    score: Math.round(((completed + knownFields) / (checklist.length + requiredCompanyFields.length)) * 100),
    completed,
    total: checklist.length,
  };
}

function setCompanyField(rootDir, field, value) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_COMPANY, field)) {
    throw new Error(`unknown company field: ${field}`);
  }
  const company = readJson(rootDir, 'company.json', DEFAULT_COMPANY);
  company[field] = value;
  company.updatedAt = new Date().toISOString();
  writeJson(rootDir, 'company.json', company);
  return company;
}

function completeGate(rootDir, id, evidence) {
  if (!evidence) throw new Error('evidence is required to complete a gate');
  const checklist = readJson(
    rootDir,
    'checklist.json',
    CHECKLIST.map(([gateId, task]) => ({ id: gateId, task, status: 'pending', evidence: [] }))
  );
  const gate = checklist.find(item => item.id === id);
  if (!gate) throw new Error(`unknown gate: ${id}`);
  gate.status = 'complete';
  gate.evidence = [...new Set([...(gate.evidence || []), evidence])];
  gate.completedAt = new Date().toISOString();
  writeJson(rootDir, 'checklist.json', checklist);
  return gate;
}

function addLead(rootDir, input) {
  if (!input.name || !input.channel || !input.contact || !input.segment) {
    throw new Error('lead name, channel, contact, and segment are required');
  }
  const lead = {
    id: `lead-${crypto.randomUUID()}`,
    name: input.name,
    organization: input.organization || null,
    segment: input.segment,
    channel: input.channel,
    contact: input.contact,
    consent: input.consent || 'unknown',
    status: 'research',
    source: input.source || 'manual',
    createdAt: new Date().toISOString(),
  };
  appendJsonl(rootDir, 'leads.jsonl', lead);
  return lead;
}

function draftOutreach(rootDir, input) {
  const lead = readJsonl(rootDir, 'leads.jsonl').find(item => item.id === input.leadId);
  if (!lead) throw new Error(`lead not found: ${input.leadId}`);
  if (!input.message) throw new Error('message is required');
  const draft = {
    id: `outreach-${crypto.randomUUID()}`,
    leadId: lead.id,
    channel: lead.channel,
    recipient: lead.contact,
    message: input.message,
    status: 'draft',
    createdAt: new Date().toISOString(),
  };
  appendJsonl(rootDir, 'outreach.jsonl', draft);
  return draft;
}

module.exports = {
  DEFAULT_COMPANY,
  DEFAULT_PRODUCTS,
  CHECKLIST,
  initialize,
  readiness,
  setCompanyField,
  completeGate,
  addLead,
  draftOutreach,
};

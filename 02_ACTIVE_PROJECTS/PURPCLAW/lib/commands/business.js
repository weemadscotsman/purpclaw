'use strict';

const operations = require('../business/operations');
const twilio = require('../business/twilio');
const { readJsonl } = require('../business/store');

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function printHelp() {
  console.log(`
  purpclaw business init
  purpclaw business status
  purpclaw business set --field jurisdiction --value "US-DE"
  purpclaw business gate complete --id proof --evidence "docs/proof-report.md"
  purpclaw business products
  purpclaw business lead add --name "Example" --organization "Acme" --segment investor --channel email --contact person@example.com
  purpclaw business outreach draft --lead <lead-id> --message "..."
  purpclaw business twilio status
  purpclaw business twilio consent --phone +15551234567 --source "website form"
  purpclaw business twilio draft --to +15551234567 --message "..."
  purpclaw business twilio send --to +15551234567 --message "..." --execute

  Drafting is local. Sending requires recorded opt-in, Twilio credentials,
  and the explicit --execute flag. Legal filings, purchases, and credit
  applications are intentionally not automated by this command.
`);
}

async function run(args, ctx) {
  const { PURP_DIR } = ctx;
  const sub = (args[0] || 'status').toLowerCase();

  if (sub === 'init') {
    const state = operations.initialize(PURP_DIR);
    console.log(`Business workspace initialized with ${state.products.length} draft products and ${state.checklist.length} proof/launch gates.`);
    return;
  }

  if (sub === 'status' || sub === 'proof') {
    const state = operations.readiness(PURP_DIR);
    console.log(`Business readiness: ${state.score}%`);
    console.log(`Checklist: ${state.completed}/${state.total} complete`);
    console.log(`Products: ${state.products.length}`);
    console.log(`Recorded consent events: ${state.consents.length}`);
    for (const item of state.checklist) {
      console.log(`  ${item.status === 'complete' ? '[x]' : '[ ]'} ${item.task}`);
    }
    return;
  }

  if (sub === 'products') {
    const state = operations.readiness(PURP_DIR);
    for (const product of state.products) {
      console.log(`${product.sku}\t${product.status}\t${product.name}`);
    }
    return;
  }

  if (sub === 'set') {
    const company = operations.setCompanyField(
      PURP_DIR,
      valueAfter(args, '--field'),
      valueAfter(args, '--value')
    );
    console.log(`Updated company field; readiness data timestamp is ${company.updatedAt}.`);
    return;
  }

  if (sub === 'gate' && (args[1] || '').toLowerCase() === 'complete') {
    const gate = operations.completeGate(
      PURP_DIR,
      valueAfter(args, '--id'),
      valueAfter(args, '--evidence')
    );
    console.log(`Completed gate ${gate.id} with recorded evidence.`);
    return;
  }

  if (sub === 'lead' && (args[1] || '').toLowerCase() === 'add') {
    const lead = operations.addLead(PURP_DIR, {
      name: valueAfter(args, '--name'),
      organization: valueAfter(args, '--organization'),
      segment: valueAfter(args, '--segment'),
      channel: valueAfter(args, '--channel'),
      contact: valueAfter(args, '--contact'),
      consent: valueAfter(args, '--consent'),
      source: valueAfter(args, '--source'),
    });
    console.log(`Added lead ${lead.id} in research state; no outreach was sent.`);
    return;
  }

  if (sub === 'outreach' && (args[1] || '').toLowerCase() === 'draft') {
    const draft = operations.draftOutreach(PURP_DIR, {
      leadId: valueAfter(args, '--lead'),
      message: valueAfter(args, '--message'),
    });
    console.log(`Created outreach draft ${draft.id}; no outreach was sent.`);
    return;
  }

  if (sub === 'twilio') {
    const action = (args[1] || 'status').toLowerCase();
    if (action === 'status') {
      console.log(JSON.stringify({
        ...twilio.status(),
        drafts: readJsonl(PURP_DIR, 'outbox.jsonl').length,
        outbound: readJsonl(PURP_DIR, 'outbound.jsonl').length,
      }, null, 2));
      return;
    }
    if (action === 'consent') {
      const entry = twilio.recordConsent(PURP_DIR, {
        phone: valueAfter(args, '--phone'),
        source: valueAfter(args, '--source'),
        evidence: valueAfter(args, '--evidence'),
      });
      console.log(`Recorded opt-in ${entry.id} for ${entry.phone}.`);
      return;
    }
    if (action === 'draft') {
      const entry = twilio.draft(PURP_DIR, {
        to: valueAfter(args, '--to'),
        body: valueAfter(args, '--message'),
      });
      console.log(`Drafted ${entry.id}; no message was sent.`);
      return;
    }
    if (action === 'send') {
      if (!args.includes('--execute')) {
        throw new Error('refusing outbound send without explicit --execute');
      }
      const result = await twilio.send(PURP_DIR, {
        to: valueAfter(args, '--to'),
        body: valueAfter(args, '--message'),
      });
      console.log(`Twilio accepted message ${result.sid} with status ${result.status}.`);
      return;
    }
  }

  printHelp();
}

module.exports = { run };

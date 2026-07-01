'use strict';

const fs = require('fs');
const path = require('path');
const { Timeline } = require('./timeline');

const ROOT = path.resolve(__dirname, '..');
const DONOR_FILE = path.join(ROOT, 'registry', 'donor-artifacts.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function slug(value) {
  return String(value || 'artifact')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80) || 'artifact';
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value).split(',').map(v => v.trim()).filter(Boolean);
}

function rejectedMechanics(artifact) {
  return normalizeList(artifact.rejected_mechanics && artifact.rejected_mechanics.length ? artifact.rejected_mechanics : artifact.rejected);
}

class DonorArchaeology {
  constructor(file = DONOR_FILE) {
    this.file = file;
  }

  load() {
    const data = readJson(this.file, null);
    if (!data || typeof data !== 'object') {
      return {
        schema: 'purpclaw.donor-artifacts.v1',
        version: '0.1.0',
        updated: new Date().toISOString(),
        doctrine: {},
        artifacts: [],
        reports: [],
      };
    }
    if (!Array.isArray(data.artifacts)) data.artifacts = [];
    if (!Array.isArray(data.reports)) data.reports = [];
    return data;
  }

  save(data) {
    data.updated = new Date().toISOString();
    writeJson(this.file, data);
  }

  list(filter = {}) {
    let artifacts = this.load().artifacts;
    if (filter.status) artifacts = artifacts.filter(a => a.status === filter.status);
    if (filter.origin) artifacts = artifacts.filter(a => String(a.origin || '').toLowerCase() === String(filter.origin).toLowerCase());
    return artifacts.slice().sort((a, b) => String(a.origin).localeCompare(String(b.origin)) || String(a.name).localeCompare(String(b.name)));
  }

  get(id) {
    const key = slug(id);
    return this.load().artifacts.find(a => a.id === key || slug(a.name) === key) || null;
  }

  add(input) {
    if (!input.name || !input.origin || !input.behavioural_law) {
      throw new Error('Donor artifacts require name, origin, and behavioural_law.');
    }
    const data = this.load();
    const artifact = {
      id: input.id || slug(input.name),
      name: input.name,
      origin: input.origin,
      type: input.type || 'Behaviour Physics',
      status: input.status || 'candidate',
      value: input.value || 'unknown',
      behavioural_law: input.behavioural_law,
      integrated_into: normalizeList(input.integrated_into),
      rejected: normalizeList(input.rejected || input.rejected_mechanics),
      rejected_mechanics: normalizeList(input.rejected_mechanics || input.rejected),
      reason: input.reason || '',
      harvested_at: input.harvested_at || new Date().toISOString(),
      validation_note: input.validation_note || '',
      notes: input.notes || '',
    };
    const idx = data.artifacts.findIndex(a => a.id === artifact.id);
    if (idx >= 0) data.artifacts[idx] = { ...data.artifacts[idx], ...artifact };
    else data.artifacts.push(artifact);
    this.save(data);
    this._recordTimeline(artifact);
    return artifact;
  }

  integrationChecklist(artifact, validationNote = '') {
    const rejected = rejectedMechanics(artifact);
    const checks = [
      { key: 'behavioural_law', ok: !!String(artifact.behavioural_law || '').trim(), label: 'behavioural_law' },
      { key: 'integrated_into', ok: normalizeList(artifact.integrated_into).length > 0, label: 'integrated_into' },
      { key: 'rejected_mechanics', ok: rejected.length > 0, label: 'rejected_mechanics' },
      { key: 'validation_note', ok: !!String(validationNote || artifact.validation_note || '').trim(), label: 'validation note' },
    ];
    return {
      ok: checks.every(c => c.ok),
      checks,
      missing: checks.filter(c => !c.ok).map(c => c.label),
    };
  }

  integrate(id, opts = {}) {
    const key = slug(id);
    const data = this.load();
    const idx = data.artifacts.findIndex(a => a.id === key || slug(a.name) === key);
    if (idx < 0) throw new Error(`Donor artifact not found: ${id}`);

    const current = data.artifacts[idx];
    const validationNote = opts.validation_note || opts.validation || current.validation_note || '';
    const checklist = this.integrationChecklist(current, validationNote);
    if (!checklist.ok) {
      throw new Error(`Cannot integrate donor artifact. Missing: ${checklist.missing.join(', ')}`);
    }

    const now = new Date().toISOString();
    const updated = {
      ...current,
      status: 'integrated',
      rejected_mechanics: rejectedMechanics(current),
      validation_note: validationNote,
      integrated_at: opts.integrated_at || now,
      integration_history: [
        ...(Array.isArray(current.integration_history) ? current.integration_history : []),
        {
          at: now,
          validation_note: validationNote,
          actor: opts.actor || 'Donor Archaeology',
        },
      ],
    };

    const event = this._recordIntegrationTimeline(updated, validationNote);
    data.artifacts[idx] = updated;
    this.save(data);
    return { artifact: updated, checklist, timeline_event: event };
  }

  report(origin = null) {
    const artifacts = origin ? this.list({ origin }) : this.list();
    const recovered = artifacts.filter(a => a.status === 'harvested' || a.status === 'candidate');
      const rejected = [...new Set(artifacts.flatMap(a => rejectedMechanics(a)))];
    return {
      schema: 'purpclaw.donor-report.v1',
      generated_at: new Date().toISOString(),
      target: origin || 'all donors',
      recovered,
      rejected,
      doctrine: this.load().doctrine,
    };
  }

  heist(id, opts = {}) {
    const artifact = this.get(id);
    if (!artifact) throw new Error(`Donor artifact not found: ${id}`);
    const data = this.load();
    const report = {
      id: `heist_${Date.now().toString(36)}_${slug(artifact.id).slice(0, 24)}`,
      timestamp: new Date().toISOString(),
      protocol: 'purpclaw.heist-report.v1',
      target: artifact.origin,
      asset: artifact.name,
      type: artifact.type,
      status: opts.status || artifact.status || 'candidate',
      scout: opts.scout || 'Scout',
      thief: opts.thief || 'Goose',
      integrator: opts.integrator || 'Hermes',
      historian: opts.historian || 'Memory',
      behavioural_law: artifact.behavioural_law,
      integrated_into: artifact.integrated_into || [],
      rejected: rejectedMechanics(artifact),
      value: artifact.value || 'unknown',
      calling_card: opts.calling_card || `Boss, I got us more loot. ${artifact.name} is now in the stack.`,
      duck_observation: opts.duck_observation || 'The duck watched the entire operation.',
      note: opts.note || artifact.notes || '',
      refs: { donor_artifact_id: artifact.id },
    };
    data.reports.unshift(report);
    data.reports = data.reports.slice(0, 100);
    this.save(data);
    this._recordHeistTimeline(report);
    return report;
  }

  queueEvolution(id, opts = {}) {
    const artifact = this.get(id);
    if (!artifact) throw new Error(`Donor artifact not found: ${id}`);
    const mutator = require('./evolution/mutator');
    const proposal = mutator.queueExternalProposal({
      kind: 'append_planner_hint',
      risk: 'low',
      source: 'donor-archaeology',
      target: artifact.integrated_into && artifact.integrated_into.length ? artifact.integrated_into.join(', ') : 'planner-preferences',
      evidence: {
        donorArtifactId: artifact.id,
        origin: artifact.origin,
        status: artifact.status,
        value: artifact.value,
        rejected: rejectedMechanics(artifact),
        validation_note: artifact.validation_note || '',
      },
      reason: `Donor archaeology from ${artifact.origin}: ${artifact.behavioural_law}`,
      suggestedDiff: {
        file: 'agent_work/evolution/planner-preferences.md',
        action: 'append',
        source: 'donor-archaeology',
      },
      fragments: [{
        intent: 'donor-archaeology',
        desc: `${artifact.name}: ${artifact.behavioural_law}`,
        reason: artifact.reason || opts.reason || 'Harvested behavioural law; original implementation rejected unless separately approved.',
        at: Date.now(),
      }],
    });
    this._recordEvolutionTimeline(artifact, proposal);
    return { artifact, proposal };
  }

  describe(filter = {}) {
    const artifacts = this.list(filter);
    const lines = [`\nPURPCLAW Donor Archaeology - ${artifacts.length} artifacts\n`];
    lines.push('Doctrine: identify the behavioural law before integration.\n');
    for (const a of artifacts) {
      lines.push(`${a.name}`);
      lines.push(`  Origin: ${a.origin} | Type: ${a.type} | Status: ${a.status} | Value: ${a.value}`);
      lines.push(`  Law: ${a.behavioural_law}`);
      if (a.integrated_into && a.integrated_into.length) lines.push(`  Into: ${a.integrated_into.join(', ')}`);
      const rejected = rejectedMechanics(a);
      if (rejected.length) lines.push(`  Rejected: ${rejected.join(', ')}`);
      if (a.validation_note) lines.push(`  Validation: ${a.validation_note}`);
      if (a.reason) lines.push(`  Reason: ${a.reason}`);
      lines.push('');
    }
    return lines.join('\n');
  }

  describeReport(origin = null) {
    const report = this.report(origin);
    const lines = [`\nDONOR REPORT - ${report.target}\n`];
    lines.push('Recovered:');
    for (const a of report.recovered) lines.push(`  - ${a.name} (${a.status}): ${a.behavioural_law}`);
    lines.push('');
    lines.push('Rejected:');
    if (report.rejected.length) report.rejected.forEach(item => lines.push(`  - ${item}`));
    else lines.push('  - none recorded');
    lines.push('');
    lines.push('Rule: never import a feature until the underlying behavioural law is identified.');
    return lines.join('\n');
  }

  describeHeist(report) {
    const lines = [`\nHEIST REPORT - ${report.target}\n`];
    lines.push(`Asset: ${report.asset}`);
    lines.push(`Status: ${report.status}`);
    lines.push(`Value: ${report.value}`);
    lines.push('');
    lines.push(`Scout: ${report.scout}`);
    lines.push(`Thief: ${report.thief}`);
    lines.push(`Integrator: ${report.integrator}`);
    lines.push(`Historian: ${report.historian}`);
    lines.push('');
    lines.push(`Law: ${report.behavioural_law}`);
    if (report.integrated_into && report.integrated_into.length) lines.push(`Into: ${report.integrated_into.join(', ')}`);
    if (report.rejected && report.rejected.length) lines.push(`Rejected: ${report.rejected.join(', ')}`);
    lines.push('');
    lines.push(`Calling card: ${report.calling_card}`);
    lines.push(`Duck: ${report.duck_observation}`);
    return lines.join('\n');
  }

  describeEvolutionQueued(result) {
    const { artifact, proposal } = result;
    const lines = [`\nEVOLUTION FEED - ${artifact.name}\n`];
    lines.push(`Origin: ${artifact.origin}`);
    lines.push(`Proposal: ${proposal.id}`);
    lines.push(`Risk: ${proposal.risk}`);
    lines.push(`Kind: ${proposal.kind}`);
    lines.push(`Law: ${artifact.behavioural_law}`);
    lines.push('');
    lines.push(`Next: purpclaw evolve approve ${proposal.id}`);
    lines.push('Note: queued through the existing Auto-Evolve mutator path.');
    return lines.join('\n');
  }

  describeIntegration(result) {
    const { artifact, timeline_event } = result;
    const lines = [`\nDONOR INTEGRATION - ${artifact.name}\n`];
    lines.push(`Status: ${artifact.status}`);
    lines.push(`Origin: ${artifact.origin}`);
    lines.push(`Into: ${artifact.integrated_into.join(', ')}`);
    lines.push(`Rejected: ${rejectedMechanics(artifact).join(', ')}`);
    lines.push(`Validation: ${artifact.validation_note}`);
    lines.push(`Timeline: ${timeline_event.id}`);
    lines.push('');
    lines.push('Gate: passed candidate-to-integrated requirements.');
    return lines.join('\n');
  }

  _recordTimeline(artifact) {
    try {
      new Timeline().record({
        kind: 'donor.artifact_recorded',
        source: 'donor-archaeology',
        title: `Donor artifact recorded: ${artifact.name}`,
        summary: artifact.behavioural_law,
        location: 'Archive',
        subject: artifact.name,
        refs: { donor_artifact_id: artifact.id },
        data: {
          origin: artifact.origin,
          status: artifact.status,
          integrated_into: artifact.integrated_into,
        },
      });
    } catch (_) {}
  }

  _recordHeistTimeline(report) {
    try {
      new Timeline().record({
        kind: 'donor.heist_reported',
        source: 'donor-archaeology',
        title: `Heist report: ${report.asset}`,
        summary: report.calling_card,
        agents: [report.scout, report.thief, report.integrator, report.historian].map(a => String(a).toLowerCase()),
        location: 'Archive',
        subject: report.asset,
        refs: { donor_report_id: report.id, donor_artifact_id: report.refs.donor_artifact_id },
        data: {
          target: report.target,
          status: report.status,
          behavioural_law: report.behavioural_law,
          integrated_into: report.integrated_into,
          duck_observation: report.duck_observation,
        },
      });
    } catch (_) {}
  }

  _recordEvolutionTimeline(artifact, proposal) {
    try {
      new Timeline().record({
        kind: 'donor.evolution_queued',
        source: 'donor-archaeology',
        title: `Donor artifact queued for evolution: ${artifact.name}`,
        summary: artifact.behavioural_law,
        location: 'Archive',
        subject: artifact.name,
        refs: { donor_artifact_id: artifact.id, evolution_proposal_id: proposal.id },
        data: {
          origin: artifact.origin,
          proposal_kind: proposal.kind,
          risk: proposal.risk,
          next_command: `purpclaw evolve approve ${proposal.id}`,
        },
      });
    } catch (_) {}
  }

  _recordIntegrationTimeline(artifact, validationNote) {
    const timeline = new Timeline();
    return timeline.record({
      kind: 'donor.artifact_integrated',
      source: 'donor-archaeology',
      title: `Donor artifact integrated: ${artifact.name}`,
      summary: validationNote,
      location: 'Archive',
      subject: artifact.name,
      refs: { donor_artifact_id: artifact.id },
      data: {
        origin: artifact.origin,
        behavioural_law: artifact.behavioural_law,
        integrated_into: artifact.integrated_into,
        rejected_mechanics: rejectedMechanics(artifact),
        validation_note: validationNote,
      },
    });
  }
}

module.exports = { DonorArchaeology, DONOR_FILE };

if (require.main === module) {
  const donor = new DonorArchaeology();
  const args = process.argv.slice(2);
  if (args[0] === '--json') console.log(JSON.stringify(donor.load(), null, 2));
  else console.log(donor.describe());
}

// Shared test helper: populates a run folder with fully "ready" repository
// context (both implementation and test kinds) so tests that exercise
// normal (non-blocked) stage-prompt content don't have to duplicate the
// raw-evidence + supplemental-document wiring. Not a test file itself.

import * as fs from 'fs';
import * as path from 'path';
import { writeSupplementalContextTemplates, placeholderForSection } from '../src/instructions/supplementalContextTemplates';
import { REQUIRED_POPULATED_SECTIONS_BY_KIND } from '../src/instructions/supplementalContextParser';
import { SupplementalContextDocumentKind } from '../src/instructions/supplementalContextTypes';

// Replaces every required-readiness section's starter placeholder body with
// substantive stand-in text, so a document whose "Status:" is flipped to
// "populated" also satisfies the Batch 6 placeholder-completeness check
// (CONTEXT_REQUIRED_SECTION_NOT_POPULATED) rather than being reclassified
// "malformed" for still containing the literal template placeholder.
export function fillRequiredSections(text: string, kind: SupplementalContextDocumentKind): string {
  const requiredSections = REQUIRED_POPULATED_SECTIONS_BY_KIND[kind];
  if (!requiredSections) return text;
  let result = text;
  for (const heading of requiredSections) {
    const placeholder = placeholderForSection(kind, heading);
    const marker = `## ${heading}\n${placeholder}`;
    const replacement = `## ${heading}\nReady-context test fixture evidence for "${heading}".`;
    result = result.split(marker).join(replacement);
  }
  return result;
}

function rawEvidenceJson(role: string): string {
  return JSON.stringify({
    schemaVersion: '1.0.0',
    tool: { name: 'my-dev-kit', version: '1.10.2' },
    index: { indexPath: '/idx', manifestPath: '/idx/manifest.json' },
    request: { role },
    roleContext: { role },
    roleAdequacy: { status: 'context sufficient for implementation' },
    freshness: {
      role,
      state: 'fresh',
      comparedIdentities: [{ label: 'afterIndexPath', value: '/idx' }],
    },
    responsibilityMappings: { mappings: [{ responsibilityId: 'TST-READY-001', mappingStatus: 'mapped' }], truncated: false },
    truncation: { truncated: false, records: [] },
    fullFileFallback: { used: 0 },
    provenance: [{ id: 'p1' }],
    warnings: [],
  });
}

function populateKind(runFolder: string, kind: 'implementation' | 'test') {
  const packetRel = kind === 'implementation' ? 'artifacts/implementation-context-packet.txt' : 'artifacts/test-context-packet.txt';
  const reportRel = kind === 'implementation' ? 'reports/implementation-context-retrieval-report.txt' : 'reports/test-context-retrieval-report.txt';
  const role = kind === 'implementation' ? 'implementation' : 'test-implementation';

  const capsulePath = path.join(runFolder, `${kind}-capsule.json`);
  const auditPath = path.join(runFolder, `${kind}-audit.json`);
  fs.writeFileSync(capsulePath, rawEvidenceJson(role), 'utf8');
  fs.writeFileSync(auditPath, rawEvidenceJson(role), 'utf8');

  const packetKind: SupplementalContextDocumentKind = kind === 'implementation' ? 'implementation-context-packet' : 'test-context-packet';

  for (const rel of [packetRel, reportRel]) {
    const p = path.join(runFolder, rel);
    let text = fs
      .readFileSync(p, 'utf8')
      .replace('Status: template', 'Status: populated')
      .replace('Source context capsule: unknown', `Source context capsule: ${capsulePath}`)
      .replace('Source retrieval audit: unknown', `Source retrieval audit: ${auditPath}`);
    if (rel === packetRel) {
      text = fillRequiredSections(text, packetKind);
    }
    fs.writeFileSync(p, text, 'utf8');
  }
}

const STRATEGY_STAGE_ARTIFACT: Record<string, string> = {
  feature: 'artifacts/test-strategy-packet.txt',
  repair: 'artifacts/regression-test-strategy.txt',
  test: 'artifacts/test-strategy-packet.txt',
  refactor: 'artifacts/compatibility-test-strategy.txt',
  harden: 'artifacts/resilience-test-strategy.txt',
  extraction: 'artifacts/test-strategy-packet.txt',
};

const READY_RESPONSIBILITY_BLOCK = `
test responsibility ID: TST-READY-001
criticality: critical
traces to: ready-context test fixture
setup: n/a
action or trigger: n/a
expected result: n/a
test level: unit
`;

// Populates all context files a given mode requires (per the Batch 4 mode
// matrix) as fully "ready": populated supplemental documents referencing
// valid, fresh, adequate, non-truncated raw evidence, and (for test kind) a
// TestStrategyPacket whose one critical responsibility is fully mapped.
export function makeReadyRunFolder(runFolder: string, mode: string): void {
  fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(runFolder, 'reports'), { recursive: true });
  writeSupplementalContextTemplates(mode, runFolder);

  if (mode !== 'greenfield' && mode !== 'test') {
    populateKind(runFolder, 'implementation');
  }
  if (mode !== 'greenfield') {
    populateKind(runFolder, 'test');
    const strategyRel = STRATEGY_STAGE_ARTIFACT[mode];
    if (strategyRel) {
      fs.writeFileSync(path.join(runFolder, strategyRel), READY_RESPONSIBILITY_BLOCK, 'utf8');
    }
  }
}

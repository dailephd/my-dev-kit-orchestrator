// v1.5.0 Batch 5 -- conditional Semantic Continuity prompt contract.
//
// One owner for every piece of Semantic Continuity authoring guidance that
// promptGenerator.ts injects into an ACTIVATED run's stage prompts:
//
//   upstream trace authoring -> strategy RSP blocks -> implementation mapping
//   -> test-implementation mapping -> verification attribution -> judge review
//   (+ the my-dev-kit request / context-refresh guidance that carries RSP IDs)
//
// Guidance is conditional and additive: a legacy (absent-version) run,
// greenfield, and proof-only never receive any of it, so their prompts are
// unchanged. Nothing here reads run state except the strategy artifact's
// declared RSP IDs (through the existing Batch 0 validator), executes
// anything, or persists anything. Continuity itself is only ever evaluated by
// RunIntegrityGate; this module only teaches agents how to author the
// contracts the gate validates.

import * as fs from 'fs';
import * as path from 'path';
import { getWorkflow } from '../workflows';
import { isValidMode } from '../types';
import { SEMANTIC_CONTINUITY_CONTRACT_VERSION } from './runSemanticContinuity';
import { SEMANTIC_RESPONSIBILITY_UPSTREAM_PREFIXES, validateSemanticResponsibilities } from './semanticResponsibility';
import { findTestStrategySourceRequirement } from './testResponsibilityCriticality';
import { VERIFICATION_STATUSES } from './verificationResponsibilityEvidence';
import {
  SemanticContinuitySurfaceSummary,
  renderSemanticContinuityJudgeLines,
} from '../semanticContinuitySurface';

export interface SemanticPromptRunFacts {
  mode: string;
  runFolder: string;
  semanticContinuityVersion?: string;
  proofOnly?: boolean;
  targetRepoRoot?: string;
  sourceRepoRoot?: string;
}

export type SemanticPromptRole =
  | 'upstream'
  | 'strategy'
  | 'implementation'
  | 'test-implementation'
  | 'verification'
  | 'judge';

// Modes that can be activated: exactly the modes that own a test-strategy
// source requirement (never a second manually maintained registry).
export function isSemanticContinuityCapableMode(mode: string): boolean {
  return findTestStrategySourceRequirement(mode) !== undefined;
}

// Whether `start` should activate Semantic Continuity for a new staged run.
export function shouldActivateSemanticContinuity(mode: string, proofOnly: boolean | undefined): boolean {
  return proofOnly !== true && isSemanticContinuityCapableMode(mode);
}

// Prompt predicate: explicit supported version AND capable mode AND not proof-only.
export function isSemanticContinuityPromptActive(run: {
  mode: string;
  semanticContinuityVersion?: string;
  proofOnly?: boolean;
}): boolean {
  return (
    run.semanticContinuityVersion === SEMANTIC_CONTINUITY_CONTRACT_VERSION &&
    run.proofOnly !== true &&
    isSemanticContinuityCapableMode(run.mode)
  );
}

function strategyStageName(mode: string): string | undefined {
  const requirement = findTestStrategySourceRequirement(mode);
  return requirement ? requirement.strategyStageId.replace(`stage.${mode}.`, '') : undefined;
}

// Role of a stage in the semantic chain, from the workflow's own stage order
// and the existing strategy registry. Stages that do not participate
// (final-report) return undefined.
export function semanticPromptRoleForStage(mode: string, stageName: string): SemanticPromptRole | undefined {
  if (!isValidMode(mode)) return undefined;
  const strategy = strategyStageName(mode);
  if (strategy === undefined) return undefined;
  const stageNames = getWorkflow(mode).stages.map((s) => s.name);
  const index = stageNames.indexOf(stageName);
  const strategyIndex = stageNames.indexOf(strategy);
  if (index < 0 || strategyIndex < 0) return undefined;
  if (index < strategyIndex) return 'upstream';
  if (stageName === strategy) return 'strategy';
  if (stageName === 'implementation') return 'implementation';
  if (stageName === 'test-implementation') return 'test-implementation';
  if (stageName === 'verification') return 'verification';
  if (stageName === 'judge') return 'judge';
  return undefined;
}

// Exact canonical RSP IDs currently declared by the strategy artifact, only
// when it parses cleanly. Returns null when the artifact is absent or cannot
// provide a valid canonical list -- IDs are never invented.
export function readCanonicalRspIds(mode: string, runFolder: string): string[] | null {
  const requirement = findTestStrategySourceRequirement(mode);
  if (!requirement) return null;
  const file = path.join(runFolder, requirement.strategyArtifactRelativePath);
  let text: string;
  try {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const validation = validateSemanticResponsibilities(text);
  if (validation.issues.length > 0 || validation.responsibilities.length === 0) return null;
  return validation.responsibilities.map((r) => r.responsibilityId);
}

function strategyArtifactRelativePath(mode: string): string {
  return findTestStrategySourceRequirement(mode)?.strategyArtifactRelativePath ?? 'artifacts/test-strategy-packet.txt';
}

function upstreamArtifactFiles(mode: string): string[] {
  if (!isValidMode(mode)) return [];
  const strategy = strategyStageName(mode);
  const stages = getWorkflow(mode).stages;
  const strategyIndex = stages.findIndex((s) => s.name === strategy);
  return (strategyIndex >= 0 ? stages.slice(0, strategyIndex) : []).flatMap((s) => [
    s.artifactFile,
    ...(s.additionalArtifactFiles ?? []),
  ]);
}

const HEADER_SUFFIX = `(contract ${SEMANTIC_CONTINUITY_CONTRACT_VERSION})`;

// ─── Upstream trace authoring ───────────────────────────────────────────────

function upstreamSection(): string {
  return [
    `=== SEMANTIC CONTINUITY: UPSTREAM TRACE AUTHORING ${HEADER_SUFFIX} ===`,
    'This run uses Semantic Continuity. A later strategy responsibility may trace only to canonical IDs that are',
    'declared in an upstream artifact, so declare canonical trace IDs here where this artifact\'s content warrants them.',
    'Canonical prefixes (' + SEMANTIC_RESPONSIBILITY_UPSTREAM_PREFIXES.join(', ') + '):',
    '  REQ = requirement / requested obligation / success criterion',
    '  CTX = architecture or context contract / constraint / dependency fact',
    '  BEH = behavior that must be preserved or implemented',
    '  INV = invariant / condition that must remain true',
    '  TRN = state transition',
    '  PSE = implementation-neutral pseudocode or design step',
    'Canonical declaration syntax (one declaration per line, "<ID>: <text>", ID = PREFIX-NNN):',
    '  BEH-001: Reject malformed configuration before execution.',
    '  INV-001: Invalid configuration never reaches command execution.',
    '  TRN-001: invalid-input -> validation-error',
    'Use the prefixes that match the semantic content actually present; not every prefix is required in every artifact.',
    'ID stability (identity discipline, authored by you -- the runtime cannot prove two texts mean the same thing):',
    '  - preserve an existing trace ID when correcting the same semantic item',
    '  - do not renumber unaffected IDs',
    '  - do not reuse an existing ID for a different meaning',
    '  - add new IDs using a new unused canonical number',
    '  - do not fabricate a trace link to an ID that is not declared in an upstream artifact',
  ].join('\n');
}

// ─── Strategy RSP authoring ─────────────────────────────────────────────────

function strategySection(run: SemanticPromptRunFacts, correction: boolean): string {
  const upstream = upstreamArtifactFiles(run.mode);
  const lines = [
    `=== SEMANTIC CONTINUITY: STRATEGY RESPONSIBILITIES ${HEADER_SUFFIX} ===`,
    'This run uses Semantic Continuity. Declare every test responsibility in this artifact as a canonical RSP block.',
    'Every later stage carries these exact IDs, and RunIntegrityGate enforces them.',
    'Canonical block (one per responsibility, blank line between blocks):',
    '  test responsibility ID: RSP-001',
    '  criticality: critical',
    '  responsibility: Reject malformed configuration before execution',
    '  traces to: REQ-002, BEH-004, INV-003',
    '  setup: malformed configuration input',
    '  action or trigger: invoke configuration validation',
    '  expected result: validation fails before execution begins',
    '  test level: unit',
    'Requirements:',
    '  - at least one canonical RSP responsibility must exist',
    '  - every responsibility ID is RSP-NNN (RSP- plus three or more digits)',
    '  - every block includes all eight fields above',
    '  - criticality: critical | noncritical (choose exactly one)',
    '  - "traces to:" lists one or more comma-separated trace IDs that are ACTUALLY DECLARED ("<ID>: ..." lines) in upstream artifacts:',
    ...upstream.map((f) => `      ${run.runFolder}/${f}`),
    '  - do not invent trace IDs; if the required upstream trace declarations are absent, stop and report which upstream',
    '    artifact requires correction instead of authoring RSP blocks',
    '  - do not substitute TST-NNN for RSP-NNN: optional TST-* Design Trace IDs may coexist, but they are not the semantic responsibility identity',
    'Criticality (enforcement consequence -- a critical responsibility that is not fully carried through implementation, tests,',
    'and verification blocks the run; a noncritical one stays visible as a warning):',
    '  critical    = absence or failure would violate explicit requested behavior, success criteria, a required external contract,',
    '                a preserved invariant, non-negotiable regression behavior, or correctness-critical boundary/failure handling',
    '  noncritical = supplementary coverage whose absence should remain visible but should not prevent acceptance',
    '  Do not mark a required responsibility noncritical merely to avoid a blocking gate.',
    'ID stability when revising an existing strategy artifact:',
    '  - preserve the RSP ID of a responsibility whose meaning is preserved',
    '  - do not renumber unchanged responsibilities',
    '  - add new responsibilities with unused IDs',
    '  - remove obsolete responsibilities rather than silently repurposing their IDs',
  ];
  if (correction) {
    lines.push(
      'Correction scope: repair only the responsibilities affected by the blocker above. Keep unaffected RSP IDs and blocks',
      'exactly as they are; do not regenerate or renumber the whole strategy.',
    );
  }
  return lines.join('\n');
}

// ─── my-dev-kit request propagation ─────────────────────────────────────────

// Guidance that carries the canonical RSP IDs into the manually executed
// my-dev-kit context request. `rspIds` is the exact current list, or null when
// the strategy cannot provide one (never invented).
export function renderContextRequestRspGuidance(mode: string, rspIds: string[] | null): string {
  const lines: string[] = [];
  if (rspIds && rspIds.length > 0) {
    lines.push('Canonical semantic responsibility IDs for this run:');
    for (const id of rspIds) lines.push(`- ${id}`);
    lines.push(
      '',
      'Use exactly these IDs in my-dev-kit\'s testResponsibilityRefs.',
      'Do not substitute TST IDs or invent a separate responsibility namespace.',
      '',
    );
  } else {
    lines.push(
      `Canonical semantic responsibility IDs are not available: ${strategyArtifactRelativePath(mode)} does not yet declare a valid`,
      'canonical RSP list. Do not invent IDs; the semantic gate routes the run back to strategy repair.',
      'Once it does, use exactly the canonical RSP-NNN IDs from the strategy as my-dev-kit\'s testResponsibilityRefs.',
      '',
    );
  }
  // Never show concrete IDs that the strategy did not declare.
  const example = rspIds && rspIds.length > 0 ? rspIds : ['<canonical RSP ID from the strategy>'];
  lines.push(
    'The my-dev-kit request keeps its existing role-specific evidence request and additionally includes:',
    '  "testResponsibilityRefs": [' + example.map((id) => `"${id}"`).join(', ') + '],',
    '  "requestedEvidenceKinds": ["...existing required kinds for this role...", "responsibility-mappings"]',
    'Merge "responsibility-mappings" into the role-specific request; do not replace the existing required evidence kinds.',
  );
  return lines.join('\n');
}

// Refresh-only prompt block: exact IDs (or an explicit unavailable note).
export function renderSemanticContextRefreshBlock(run: SemanticPromptRunFacts): string {
  if (!isSemanticContinuityPromptActive(run)) return '';
  return `Semantic continuity request requirements ${HEADER_SUFFIX}:\n${renderContextRequestRspGuidance(run.mode, readCanonicalRspIds(run.mode, run.runFolder))
    .split('\n')
    .map((l) => (l.length > 0 ? `  ${l}` : l))
    .join('\n')}`;
}

function evidenceRefreshSteps(role: 'implementation' | 'test-implementation', mode: string, rspIds: string[] | null): string[] {
  const roleLabel = role === 'implementation' ? 'implementation' : 'test-implementation';
  const contextKind = role === 'implementation' ? 'implementation' : 'test';
  const changed = role === 'implementation' ? 'changed production files and symbols' : 'changed or added test files';
  const steps = [
    `Post-${role === 'implementation' ? 'change' : 'test'} evidence refresh (REQUIRED before this stage is ready to advance):`,
    `  1. Refresh the my-dev-kit repository index against the ${role === 'implementation' ? 'post-change repository' : 'final post-test repository'}.`,
    `  2. Create or update the ${roleLabel}-role my-dev-kit context request (this orchestrator does not execute my-dev-kit).`,
    '  3. Carry the canonical strategy RSP IDs into that request:',
    ...renderContextRequestRspGuidance(mode, rspIds)
      .split('\n')
      .map((l) => (l.length > 0 ? `       ${l}` : l)),
    `  4. Provide the actual ${changed} through the existing request fields.`,
  ];
  if (role === 'test-implementation') {
    steps.push('     Preserve the existing role-specific test evidence requirements (for example closest tests and test-infrastructure evidence).');
  }
  steps.push(
    '  5. Produce a current context capsule and retrieval audit.',
    `  6. Update the existing ${contextKind} context packet and retrieval report with the current capsule/audit paths and the final index identity.`,
    '     Do not create a new semantic context artifact; the existing pair is the carrier.',
  );
  return steps;
}

// ─── Implementation / test-implementation / verification ───────────────────

function implementationSection(run: SemanticPromptRunFacts, rspIds: string[] | null): string {
  const lines = [
    `=== SEMANTIC CONTINUITY: IMPLEMENTATION RESPONSIBILITY MAPPING ${HEADER_SUFFIX} ===`,
    `Inside the existing ImplementationReport, map EVERY canonical RSP declared in ${run.runFolder}/${strategyArtifactRelativePath(run.mode)} to production identity.`,
    'Canonical block (repeat once per RSP):',
    '  implementation responsibility ID: RSP-001',
    '  production file: src/config/schema.ts',
    '  production symbol: symbol:src/config/validate.ts#validateConfig',
    'Each block needs at least one "production file:" or "production symbol:" line; repeat the line to list several.',
    'Evidence meaning:',
    '  - RSP -> production identity is an authored declaration by you. my-dev-kit later corroborates that the repository identity',
    '    exists; it does NOT prove semantic causality.',
    '  - a declared file or symbol may be an existing owner of the behavior even when it was not newly created; do not claim every',
    '    declared file was changed.',
  ];
  if (run.mode === 'extraction') {
    lines.push(
      '  - extraction: production files and symbols are TARGET repository identities. The source repository is read-only evidence;',
      '    a source file is never implementation evidence for the target.',
    );
  }
  lines.push(...evidenceRefreshSteps('implementation', run.mode, rspIds));
  lines.push(
    'Stop condition: do not consider this stage semantically complete until the ImplementationReport contains the RSP mappings AND the',
    'post-change implementation context evidence has been refreshed. Do not claim verification success.',
  );
  return lines.join('\n');
}

function testImplementationSection(run: SemanticPromptRunFacts, rspIds: string[] | null): string {
  const lines = [
    `=== SEMANTIC CONTINUITY: TEST IMPLEMENTATION RESPONSIBILITY MAPPING ${HEADER_SUFFIX} ===`,
    `Inside the existing TestImplementationReport, map EVERY canonical RSP declared in ${run.runFolder}/${strategyArtifactRelativePath(run.mode)} to test files.`,
    'Canonical block (repeat once per RSP):',
    '  test implementation responsibility ID: RSP-001',
    '  test file: tests/config/validate.spec.ts',
    'Each block needs at least one exact project-relative "test file:" line; repeat the line to list several files.',
    'The contract is file-level only.',
    'Evidence meaning: the mapping is an authored declaration; my-dev-kit later corroborates that the declared test-file identities',
    'exist. It does not prove the assertions are correct or that the tests were executed.',
  ];
  if (run.mode === 'test') {
    lines.push('Test mode has no native implementation stage: no production implementation responsibility blocks are required.');
  }
  if (run.mode === 'extraction') {
    lines.push('Extraction: test files are TARGET repository identities; do not declare source repository files as target test evidence.');
  }
  lines.push(...evidenceRefreshSteps('test-implementation', run.mode, rspIds));
  lines.push(
    'Stop condition: do not advance to verification until the TestImplementationReport contains the RSP mappings AND the post-test',
    'context evidence has been refreshed.',
  );
  return lines.join('\n');
}

function verificationSection(run: SemanticPromptRunFacts): string {
  return [
    `=== SEMANTIC CONTINUITY: VERIFICATION ATTRIBUTION ${HEADER_SUFFIX} ===`,
    `Inside the existing VerificationReport, give EVERY canonical RSP in ${run.runFolder}/${strategyArtifactRelativePath(run.mode)} its own block.`,
    'Canonical block (repeat once per RSP):',
    '  verification responsibility ID: RSP-001',
    '  verification status: pass',
    '',
    '  verification evidence:',
    '  command: npm test -- tests/config/validate.spec.ts',
    '  working directory: .',
    '  exit code: 0',
    `Allowed statuses are exactly: ${VERIFICATION_STATUSES.join(' | ')}.`,
    'Rules:',
    '  - pass / fail require command-result evidence (command, working directory, exit code)',
    '  - skipped / blocked require a "reason:" line',
    '  - do not infer or invent command results: record the command actually run, its actual working directory, and its actual exit code',
    '  - one command may legitimately support more than one RSP; the same real command evidence may then be referenced under',
    '    each RSP block it genuinely verifies -- do not invent distinct commands just to make blocks look different',
    'Command evidence is coding-agent-reported; the Orchestrator does not execute it while parsing.',
  ].join('\n');
}

function judgeSection(summary: SemanticContinuitySurfaceSummary | undefined): string {
  const lines = [
    `=== SEMANTIC CONTINUITY: JUDGE REVIEW ${HEADER_SUFFIX} ===`,
    'RunIntegrityGate is the canonical deterministic integrity decision, and Semantic Continuity is evaluated inside it.',
    'Do not re-derive semantic continuity from prose; use the canonical result.',
  ];
  if (summary) {
    lines.push('Canonical Semantic Continuity / run-integrity summary:', ...renderSemanticContinuityJudgeLines(summary));
  } else {
    lines.push('Run `my-dev-kit-orchestrator prompt` for this stage to receive the current canonical summary.');
  }
  lines.push(
    'Judge policy:',
    '  - do not override a canonical NEED_CONTEXT with PASS',
    '  - if the expected verdict is NEED_CONTEXT, use that verdict',
    '  - if a canonical correction stage exists, report that exact stage as the recommended next stage',
    '  - if the canonical correction stage is none, do not invent a stage',
    '  - noncritical semantic warnings alone do not require a non-PASS verdict',
    '  - ordinary design, test, and implementation judgment still applies in addition to the integrity gate',
  );
  return lines.join('\n');
}

// ─── Public entry point ─────────────────────────────────────────────────────

export interface SemanticPromptSectionOptions {
  // Canonical judge summary (live path only).
  judgeSummary?: SemanticContinuitySurfaceSummary;
  // True when the section is embedded in a semantic correction prompt.
  correction?: boolean;
}

// The Semantic Continuity guidance for one stage, or '' when the run is not
// activated or the stage does not participate.
export function renderSemanticContinuityPromptSection(
  run: SemanticPromptRunFacts,
  stageName: string,
  options: SemanticPromptSectionOptions = {},
): string {
  if (!isSemanticContinuityPromptActive(run)) return '';
  const role = semanticPromptRoleForStage(run.mode, stageName);
  switch (role) {
    case 'upstream':
      return upstreamSection();
    case 'strategy':
      return strategySection(run, options.correction === true);
    case 'implementation':
      return implementationSection(run, readCanonicalRspIds(run.mode, run.runFolder));
    case 'test-implementation':
      return testImplementationSection(run, readCanonicalRspIds(run.mode, run.runFolder));
    case 'verification':
      return verificationSection(run);
    case 'judge':
      return judgeSection(options.judgeSummary);
    default:
      return '';
  }
}

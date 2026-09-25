// v1.5.0 Batch 5 -- compact Semantic Continuity projection of the canonical
// RunIntegrityGateResult for command and prompt surfaces.
//
// This is a pure projection. It never evaluates continuity, reads files, or
// re-derives any state: status, check, export, and the judge prompt all call
// summarizeSemanticContinuityGate() on the gate they already hold, so no
// surface can disagree with another about classification, blockers, warnings,
// the correction stage, or the expected judge verdict. Nothing is persisted.

import { RunIntegrityGateResult, RunIntegritySemanticClassification } from './runIntegrityGate';

export interface SemanticContinuitySurfaceSummary {
  contractVersion: string;
  classification: Exclude<RunIntegritySemanticClassification, 'not-required'>;
  // Batch 3 overall continuity state; absent for an unsupported contract version.
  continuityState?: string;
  runIntegrityReady: boolean;
  expectedJudgeVerdict: 'PASS' | 'NEED_CONTEXT';
  criticalResponsibilityCount?: number;
  criticalUnsatisfiedResponsibilityIds: string[];
  noncriticalResponsibilityCount?: number;
  noncriticalUnsatisfiedResponsibilityIds: string[];
  blockingResponsibilityIds: string[];
  warningResponsibilityIds: string[];
  blockingCodes: string[];
  warningCodes: string[];
  primaryBlockingCode?: string;
  primaryBlockingReason?: string;
  primaryResponsibilityId?: string;
  primaryLeg?: string;
  // Semantic-owned recommendation (null when none / run-contract resolution is required).
  recommendedCorrectionStage: string | null;
  // Gate-wide canonical recommendation (repository-context recommendation first).
  canonicalRecommendedCorrectionStage: string | null;
}

// Returns null when Semantic Continuity is not active for the run (legacy,
// greenfield, proof-only, or not applicable).
export function summarizeSemanticContinuityGate(gate: RunIntegrityGateResult): SemanticContinuitySurfaceSummary | null {
  if (!gate.semanticContinuityRequired || gate.semanticContinuityClassification === 'not-required') return null;
  const continuity = gate.semanticContinuity;
  const primary = gate.primarySemanticBlocker;
  return {
    contractVersion: gate.semanticContinuityVersion ?? '(unknown)',
    classification: gate.semanticContinuityClassification,
    ...(continuity ? { continuityState: continuity.state } : {}),
    runIntegrityReady: gate.runIntegrityReady,
    expectedJudgeVerdict: gate.expectedJudgeVerdict,
    ...(continuity ? { criticalResponsibilityCount: continuity.summary.criticalResponsibilities } : {}),
    criticalUnsatisfiedResponsibilityIds: continuity?.summary.criticalUnsatisfiedResponsibilityIds ?? [],
    ...(continuity ? { noncriticalResponsibilityCount: continuity.summary.noncriticalResponsibilities } : {}),
    noncriticalUnsatisfiedResponsibilityIds: continuity?.summary.noncriticalUnsatisfiedResponsibilityIds ?? [],
    blockingResponsibilityIds: gate.semanticContinuityBlockingResponsibilityIds,
    warningResponsibilityIds: gate.semanticContinuityWarningResponsibilityIds,
    blockingCodes: gate.semanticContinuityBlockingCodes,
    warningCodes: gate.semanticContinuityWarningCodes,
    ...(primary
      ? {
          primaryBlockingCode: primary.primaryCode,
          primaryBlockingReason: primary.primaryReason,
          ...(primary.responsibilityId !== undefined ? { primaryResponsibilityId: primary.responsibilityId } : {}),
          ...(primary.leg !== undefined ? { primaryLeg: primary.leg } : {}),
        }
      : {}),
    recommendedCorrectionStage: gate.semanticRecommendedCorrectionStage,
    canonicalRecommendedCorrectionStage: gate.recommendedCorrectionStage,
  };
}

function list(values: readonly string[]): string {
  return values.join(', ');
}

// Ordered [label, value] facts shared by status and export so both surfaces
// show the same fields with the same meaning. Only meaningful fields appear.
export function semanticContinuityFacts(s: SemanticContinuitySurfaceSummary): Array<[string, string]> {
  const facts: Array<[string, string]> = [
    ['Contract version', s.contractVersion],
    ['Semantic classification', s.classification],
  ];
  if (s.continuityState !== undefined) facts.push(['Continuity state', s.continuityState]);
  facts.push(['Run integrity ready', s.runIntegrityReady ? 'yes' : 'no']);
  if (s.criticalResponsibilityCount !== undefined) {
    facts.push(['Critical responsibilities (total / unsatisfied)', `${s.criticalResponsibilityCount} / ${s.criticalUnsatisfiedResponsibilityIds.length}`]);
  }
  if (s.noncriticalResponsibilityCount !== undefined) {
    facts.push(['Noncritical responsibilities (total / unsatisfied)', `${s.noncriticalResponsibilityCount} / ${s.noncriticalUnsatisfiedResponsibilityIds.length}`]);
  }
  if (s.blockingResponsibilityIds.length > 0) facts.push(['Blocking responsibility IDs', list(s.blockingResponsibilityIds)]);
  if (s.warningResponsibilityIds.length > 0) facts.push(['Warning responsibility IDs', list(s.warningResponsibilityIds)]);
  if (s.blockingCodes.length > 0) facts.push(['Blocking codes', list(s.blockingCodes)]);
  if (s.warningCodes.length > 0) facts.push(['Warning codes', list(s.warningCodes)]);
  if (s.classification === 'blocked') {
    facts.push(['Recommended correction stage', s.recommendedCorrectionStage ?? '(none: external resolution required)']);
  }
  return facts;
}

// Lines for `status`.
export function renderSemanticContinuityStatusLines(s: SemanticContinuitySurfaceSummary): string[] {
  return ['Semantic continuity:', ...semanticContinuityFacts(s).map(([label, value]) => `  ${label}: ${value}`)];
}

// Lines for `export` (key: value, same facts plus the camelCase identifiers
// the handoff contract names). Compact: no raw capsule/audit/parser output.
export function renderSemanticContinuityExportLines(s: SemanticContinuitySurfaceSummary): string[] {
  const lines = [
    `  contractVersion: ${s.contractVersion}`,
    `  semanticClassification: ${s.classification}`,
    `  continuityState: ${s.continuityState ?? '(unavailable)'}`,
    `  runIntegrityReady: ${s.runIntegrityReady}`,
    `  criticalResponsibilityCount: ${s.criticalResponsibilityCount ?? 0}`,
    `  criticalUnsatisfiedResponsibilityIds: ${s.criticalUnsatisfiedResponsibilityIds.length > 0 ? list(s.criticalUnsatisfiedResponsibilityIds) : '(none)'}`,
    `  noncriticalResponsibilityCount: ${s.noncriticalResponsibilityCount ?? 0}`,
    `  noncriticalUnsatisfiedResponsibilityIds: ${s.noncriticalUnsatisfiedResponsibilityIds.length > 0 ? list(s.noncriticalUnsatisfiedResponsibilityIds) : '(none)'}`,
    `  blockingCodes: ${s.blockingCodes.length > 0 ? list(s.blockingCodes) : '(none)'}`,
    `  warningCodes: ${s.warningCodes.length > 0 ? list(s.warningCodes) : '(none)'}`,
    `  expectedJudgeVerdict: ${s.expectedJudgeVerdict}`,
    `  recommendedCorrectionStage: ${s.recommendedCorrectionStage ?? '(none)'}`,
  ];
  if (s.blockingResponsibilityIds.length > 0) lines.push(`  blockingResponsibilityIds: ${list(s.blockingResponsibilityIds)}`);
  if (s.warningResponsibilityIds.length > 0) lines.push(`  warningResponsibilityIds: ${list(s.warningResponsibilityIds)}`);
  if (s.primaryBlockingCode) {
    lines.push(`  primaryBlockingCode: ${s.primaryBlockingCode}`);
    lines.push(`  primaryBlockingReason: ${s.primaryBlockingReason ?? ''}`);
  }
  return lines;
}

// Lines for `check`: classification maps to fail / warn / pass, and a blocked
// result names the primary blocker, affected RSP, broken leg, and correction stage.
export function renderSemanticContinuityCheckLines(s: SemanticContinuitySurfaceSummary): {
  lines: string[];
  hasFail: boolean;
  hasWarn: boolean;
} {
  const label = s.classification === 'blocked' ? 'fail' : s.classification === 'warning' ? 'warn' : 'pass';
  const lines = [`=== Semantic continuity ===`, `  [${label}] Semantic continuity ${s.contractVersion}: ${s.classification}${s.continuityState ? ` (continuity: ${s.continuityState})` : ''}`];
  if (s.criticalResponsibilityCount !== undefined) {
    lines.push(`         Critical responsibilities: ${s.criticalResponsibilityCount} total / ${s.criticalUnsatisfiedResponsibilityIds.length} unsatisfied`);
  }
  if (s.noncriticalResponsibilityCount !== undefined) {
    lines.push(`         Noncritical responsibilities: ${s.noncriticalResponsibilityCount} total / ${s.noncriticalUnsatisfiedResponsibilityIds.length} unsatisfied`);
  }
  if (s.classification === 'blocked') {
    lines.push(`         Primary blocking code: ${s.primaryBlockingCode ?? '(none)'}`);
    lines.push(`         Primary reason: ${s.primaryBlockingReason ?? '(none)'}`);
    if (s.primaryResponsibilityId) lines.push(`         Affected responsibility: ${s.primaryResponsibilityId}`);
    if (s.primaryLeg) lines.push(`         Broken leg: ${s.primaryLeg}`);
    if (s.blockingResponsibilityIds.length > 0) lines.push(`         Blocking responsibility IDs: ${list(s.blockingResponsibilityIds)}`);
    lines.push(`         Recommended correction stage: ${s.recommendedCorrectionStage ?? '(none: external resolution required)'}`);
  }
  if (s.warningResponsibilityIds.length > 0) lines.push(`         Warning responsibility IDs: ${list(s.warningResponsibilityIds)}`);
  if (s.warningCodes.length > 0) lines.push(`         Warning codes: ${list(s.warningCodes)}`);
  lines.push('');
  return { lines, hasFail: s.classification === 'blocked', hasWarn: s.classification === 'warning' };
}

// Lines for the live judge prompt. Includes only fields actually available.
export function renderSemanticContinuityJudgeLines(s: SemanticContinuitySurfaceSummary): string[] {
  const lines = [
    `  Semantic continuity contract: ${s.contractVersion}`,
    `  Semantic classification: ${s.classification}`,
  ];
  if (s.continuityState !== undefined) lines.push(`  Continuity state: ${s.continuityState}`);
  lines.push(`  Run integrity ready: ${s.runIntegrityReady ? 'yes' : 'no'}`);
  lines.push(`  Expected judge verdict: ${s.expectedJudgeVerdict}`);
  if (s.blockingResponsibilityIds.length > 0) lines.push(`  Blocking responsibility IDs: ${list(s.blockingResponsibilityIds)}`);
  if (s.warningResponsibilityIds.length > 0) lines.push(`  Warning responsibility IDs: ${list(s.warningResponsibilityIds)}`);
  if (s.primaryBlockingCode) lines.push(`  Primary blocking code: ${s.primaryBlockingCode}`);
  if (s.primaryBlockingReason) lines.push(`  Primary blocking reason: ${s.primaryBlockingReason}`);
  if (s.expectedJudgeVerdict === 'NEED_CONTEXT') {
    lines.push(`  Canonical recommended correction stage: ${s.canonicalRecommendedCorrectionStage ?? '(none)'}`);
  }
  return lines;
}

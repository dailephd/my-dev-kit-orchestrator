import { RunTelemetryActivation, TelemetryDiagnostic } from './runTelemetry';
import { readRunTelemetry } from './runTelemetryStore';
import { WorkflowEconomicsEvaluated, WorkflowEconomicsSummary, evaluateWorkflowEconomics } from './runWorkflowEconomics';

// Presentation for native run telemetry / Workflow Economics (v1.6.0, Batch 4).
//
// Pure formatting over two canonical owners: the telemetry reader
// (readRunTelemetry) for structure, and the Workflow Economics evaluator for
// every aggregate. This module aggregates nothing, writes nothing, records
// nothing, and evaluates no workflow policy. Telemetry findings are
// observational warnings only; they never influence RunIntegrityGate, judge
// integrity, lifecycle, correction routing, or final-report eligibility.
//
// Output is locale-independent, timezone-independent, and path-free.

export interface RunTelemetrySurface {
  activation: RunTelemetryActivation;
  summary: WorkflowEconomicsSummary;
  /** Canonical reader diagnostics (unsupported versions included), untouched. */
  diagnostics: TelemetryDiagnostic[];
}

/** One canonical read + one canonical evaluation. Read-only; never records. */
export function readRunTelemetrySurface(run: {
  projectRoot: string;
  runId: string;
  runTelemetryVersion?: string;
}): RunTelemetrySurface {
  const view = readRunTelemetry(run);
  const summary = evaluateWorkflowEconomics({
    runTelemetryVersion: run.runTelemetryVersion,
    records: view.records,
    diagnostics: view.activation === 'unsupported' ? [] : view.diagnostics,
  });
  return { activation: view.activation, summary, diagnostics: view.diagnostics };
}

// ─── Number formatting ────────────────────────────────────────────────────────

const UNAVAILABLE = 'unavailable';

/** Integer counts: plain base-10. */
function count(value: number): string {
  return String(value);
}

/** Decimals: at most 2 places, trailing zeroes trimmed, never scientific; null/non-finite -> unavailable. */
export function formatEconomicsNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return UNAVAILABLE;
  const rounded = Number(value.toFixed(2));
  if (Math.abs(rounded) >= 1e21) return BigInt(Math.round(rounded)).toString();
  return String(rounded);
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no';
}

function unrecognizedTotal(s: WorkflowEconomicsEvaluated): number {
  return (
    s.lifecycle.requestedStateCounts.unrecognized +
    s.semanticContinuity.semanticUnrecognizedClassificationCount +
    s.semanticContinuity.continuityStateCounts.unrecognized
  );
}

function isEvaluated(summary: WorkflowEconomicsSummary): summary is WorkflowEconomicsEvaluated {
  return summary.availability === 'available' || summary.availability === 'partial';
}

// ─── Status ───────────────────────────────────────────────────────────────────

/** Compact section for `status`. Empty for a legacy (not-activated) run. */
export function buildWorkflowEconomicsStatusLines(summary: WorkflowEconomicsSummary): string[] {
  if (summary.availability === 'not-activated') return [];
  const lines = ['Workflow Economics:', `  Availability: ${summary.availability}`];
  if (!isEvaluated(summary)) return lines;

  const c = summary.coverage;
  const fmt = formatEconomicsNumber;
  lines.push(
    `  Interactions: ${count(c.completedInvocationCount)} completed, ${count(c.succeededInvocationCount)} succeeded, ${count(c.failedInvocationCount)} failed, ${count(c.incompleteInvocationCount)} incomplete`,
    `  Commands: start ${count(summary.interactions.start.completed)}, prompt ${count(summary.interactions.prompt.completed)}, mark ${count(summary.interactions.mark.completed)}`,
    `  Prompts: ${count(summary.prompts.promptRenderedCount)} rendered, ${fmt(summary.prompts.totalPromptCharacters)} characters total, ${fmt(summary.prompts.averagePromptCharacters)} characters average`,
    `  Orchestrator duration: ${fmt(summary.durations.totalInvocationDurationMs)} ms total, ${fmt(summary.durations.averageInvocationDurationMs)} ms average`,
    `  Stage movement: ${count(summary.stages.forwardStageTransitionCount)} forward, ${count(summary.stages.backwardStageTransitionCount)} backward (revisits), ${count(summary.stages.unchangedStageBoundaryCount)} unchanged`,
    `  Correction prompts: ${count(summary.prompts.correctionPromptRenderCount)}`,
    `  Integrity observations: ${count(summary.integrity.integrityBlockedEntryCount)} blocked entries, ${count(summary.integrity.integrityRecoveryCount)} recoveries`,
    `  Final eligibility observations: ${count(summary.judge.finalEligibilityReachedCount)} reached, ${count(summary.judge.finalEligibilityLostCount)} lost`,
    `  Observed workflow span: ${summary.observedWorkflowSpanMs === null ? UNAVAILABLE : `${fmt(summary.observedWorkflowSpanMs)} ms (wall clock, not active work time)`}`,
    `  Coverage: ${count(c.telemetryDiagnosticCount)} diagnostics, ${count(c.wallClockAnomalyCount)} wall-clock anomalies, numeric limit exceeded: ${yesNo(c.numericLimitExceeded)}, concurrent intervals: ${yesNo(c.concurrencyDetected)}, ambiguous boundaries: ${count(summary.ambiguousTransitionBoundaryCount)}`,
  );
  const unrecognized = unrecognizedTotal(summary);
  if (unrecognized > 0) lines.push(`  Unrecognized values: ${count(unrecognized)}`);
  return lines;
}

// ─── Export ───────────────────────────────────────────────────────────────────

/** Fixed-shape section body for `export` (counts only; never grows with records). Empty for legacy runs. */
export function buildWorkflowEconomicsExportLines(summary: WorkflowEconomicsSummary): string[] {
  if (summary.availability === 'not-activated') return [];
  if (!isEvaluated(summary)) return [`  Availability: ${summary.availability}`];

  const fmt = formatEconomicsNumber;
  const c = summary.coverage;
  const i = summary.interactions;
  const p = summary.prompts;
  const d = summary.durations;
  const st = summary.stages;
  const lc = summary.lifecycle;
  const ig = summary.integrity;
  const j = summary.judge;
  const sc = summary.semanticContinuity;
  const cmd = (name: 'start' | 'prompt' | 'mark'): string =>
    `${count(i[name].completed)} completed / ${count(i[name].succeeded)} succeeded / ${count(i[name].failed)} failed`;
  const s = sc.continuityStateCounts;

  const lines = [
    `  Economics version: ${summary.economicsVersion}`,
    `  Telemetry availability: ${summary.availability}`,
    `  Completed interactions: ${count(c.completedInvocationCount)}`,
    `  Succeeded interactions: ${count(c.succeededInvocationCount)}`,
    `  Failed interactions: ${count(c.failedInvocationCount)}`,
    `  Incomplete interactions: ${count(c.incompleteInvocationCount)}`,
    `  Telemetry diagnostics: ${count(c.telemetryDiagnosticCount)}`,
    `  start: ${cmd('start')}`,
    `  prompt: ${cmd('prompt')}`,
    `  mark: ${cmd('mark')}`,
    `  Prompt renders: ${count(p.promptRenderedCount)}`,
    `  Normal prompt renders: ${count(p.normalPromptRenderCount)}`,
    `  Correction prompt renders: ${count(p.correctionPromptRenderCount)}`,
    `  Prompt characters total: ${fmt(p.totalPromptCharacters)}`,
    `  Prompt characters minimum: ${fmt(p.minimumPromptCharacters)}`,
    `  Prompt characters maximum: ${fmt(p.maximumPromptCharacters)}`,
    `  Prompt characters average: ${fmt(p.averagePromptCharacters)}`,
    `  Orchestrator invocation duration total (ms): ${fmt(d.totalInvocationDurationMs)}`,
    `  Orchestrator invocation duration minimum (ms): ${fmt(d.minimumInvocationDurationMs)}`,
    `  Orchestrator invocation duration maximum (ms): ${fmt(d.maximumInvocationDurationMs)}`,
    `  Orchestrator invocation duration average (ms): ${fmt(d.averageInvocationDurationMs)}`,
    `  Start duration total (ms): ${fmt(d.startDurationMs)}`,
    `  Prompt duration total (ms): ${fmt(d.promptDurationMs)}`,
    `  Mark duration total (ms): ${fmt(d.markDurationMs)}`,
    `  Observed workflow span (ms, wall clock; not active work time): ${fmt(summary.observedWorkflowSpanMs)}`,
    `  Stage comparable boundaries: ${count(st.stageComparableBoundaryCount)}`,
    `  Forward stage transitions: ${count(st.forwardStageTransitionCount)}`,
    `  Backward stage transitions: ${count(st.backwardStageTransitionCount)}`,
    `  Stage revisits: ${count(st.stageRevisitCount)}`,
    `  Unchanged stage boundaries: ${count(st.unchangedStageBoundaryCount)}`,
    `  Successful mark interactions: ${count(lc.successfulMarkCount)}`,
    `  Failed mark interactions: ${count(lc.failedMarkCount)}`,
    `  Mark requested incomplete: ${count(lc.requestedStateCounts.incomplete)}`,
    `  Mark requested blocked: ${count(lc.requestedStateCounts.blocked)}`,
    `  Mark requested complete: ${count(lc.requestedStateCounts.complete)}`,
    `  Mark resulting-state observations: ${count(lc.resultingStateObservationCount)}`,
    `  Integrity observations: ${count(ig.integrityObservationCount)}`,
    `  Integrity ready observations: ${count(ig.integrityReadyObservationCount)}`,
    `  Integrity blocked observations: ${count(ig.integrityBlockedObservationCount)}`,
    `  Integrity blocked entries: ${count(ig.integrityBlockedEntryCount)}`,
    `  Integrity recoveries: ${count(ig.integrityRecoveryCount)}`,
    `  Judge observations: ${count(j.judgeObservationCount)}`,
    `  Judge accepted observations: ${count(j.judgeAcceptedObservationCount)}`,
    `  Judge rejected observations: ${count(j.judgeRejectedObservationCount)}`,
    `  Final eligibility eligible observations: ${count(j.finalEligibleObservationCount)}`,
    `  Final eligibility ineligible observations: ${count(j.finalIneligibleObservationCount)}`,
    `  Final eligibility reached: ${count(j.finalEligibilityReachedCount)}`,
    `  Final eligibility lost: ${count(j.finalEligibilityLostCount)}`,
    `  Continuity snapshots observed: ${count(sc.semanticContinuityObservationCount)}`,
    `  Continuity snapshots not applicable: ${count(sc.semanticContinuityNotApplicableCount)}`,
    `  Continuity snapshots unavailable: ${count(sc.semanticContinuityUnavailableCount)}`,
    `  Continuity snapshots ready: ${count(sc.semanticReadyObservationCount)}`,
    `  Continuity snapshots warning: ${count(sc.semanticWarningObservationCount)}`,
    `  Continuity snapshots blocking: ${count(sc.semanticBlockingObservationCount)}`,
    `  Continuity snapshot states: not-applicable ${count(s.notApplicable)}, pending ${count(s.pending)}, complete ${count(s.complete)}, incomplete ${count(s.incomplete)}, indeterminate ${count(s.indeterminate)}, failed ${count(s.failed)}, blocked ${count(s.blocked)}, invalid ${count(s.invalid)}`,
    `  Wall-clock anomalies: ${count(c.wallClockAnomalyCount)}`,
    `  Numeric limit exceeded: ${yesNo(c.numericLimitExceeded)}`,
    `  Concurrent intervals: ${yesNo(c.concurrencyDetected)}`,
    `  Ambiguous transition boundaries: ${count(summary.ambiguousTransitionBoundaryCount)}`,
    `  Unrecognized values: ${count(unrecognizedTotal(summary))}`,
  ];
  return lines;
}

// ─── Check ────────────────────────────────────────────────────────────────────

/** Maximum individually displayed telemetry warning lines. */
export const TELEMETRY_CHECK_DISPLAY_CAP = 20;

export interface RunTelemetryCheckSection {
  lines: string[];
  hasWarn: boolean;
}

const SAFE_RECORD_FILE = /^inv-[0-9a-f]{32}\.json$/;

function safeText(text: string): string {
  const cleaned = Array.from(text, (ch) => (ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f ? ' ' : ch)).join('');
  return cleaned.length > 120 ? `${cleaned.slice(0, 117)}...` : cleaned;
}

function describeReaderDiagnostic(diagnostic: TelemetryDiagnostic): string {
  // UNREADABLE_RECORD carries OS error text that can include absolute paths.
  const message = diagnostic.code === 'UNREADABLE_RECORD' ? 'A telemetry record or directory could not be read' : safeText(diagnostic.message);
  const file = diagnostic.file !== undefined && SAFE_RECORD_FILE.test(diagnostic.file) ? ` (${diagnostic.file})` : '';
  return `[warn] ${diagnostic.code}: ${message}${file}`;
}

/**
 * `=== Run telemetry ===` section for the comprehensive check paths. Null for a
 * legacy run. Reader diagnostic codes are reused verbatim; the few
 * coverage-derived codes below are only for valid-but-partial conditions the
 * reader cannot know. Every finding is `warn`; none is a workflow failure.
 */
export function buildRunTelemetryCheckSection(surface: RunTelemetrySurface): RunTelemetryCheckSection | null {
  if (surface.activation === 'not-required') return null;

  const findings = surface.diagnostics.map(describeReaderDiagnostic).sort();
  const summary = surface.summary;
  if (isEvaluated(summary)) {
    const c = summary.coverage;
    if (c.incompleteInvocationCount > 0) {
      findings.push(`[warn] INCOMPLETE_TELEMETRY_INVOCATION: ${count(c.incompleteInvocationCount)} recorded interaction(s) started but have no completed record`);
    }
    if (c.wallClockAnomalyCount > 0) {
      findings.push(`[warn] TELEMETRY_WALL_CLOCK_ANOMALY: ${count(c.wallClockAnomalyCount)} completed record(s) end before they start`);
    }
    if (c.numericLimitExceeded) {
      findings.push('[warn] TELEMETRY_NUMERIC_LIMIT_EXCEEDED: an aggregate could not be represented safely');
    }
    const unrecognized = unrecognizedTotal(summary);
    if (unrecognized > 0) {
      findings.push(`[warn] TELEMETRY_UNRECOGNIZED_VALUE: ${count(unrecognized)} recorded value(s) are outside the known vocabulary`);
    }
  }

  const lines = ['=== Run telemetry ==='];
  if (findings.length === 0) {
    lines.push('  [pass] telemetry records valid', '');
    return { lines, hasWarn: false };
  }
  for (const finding of findings.slice(0, TELEMETRY_CHECK_DISPLAY_CAP)) lines.push(`  ${finding}`);
  if (findings.length > TELEMETRY_CHECK_DISPLAY_CAP) {
    lines.push(`  [warn] TELEMETRY_DIAGNOSTICS_TRUNCATED: ${count(findings.length - TELEMETRY_CHECK_DISPLAY_CAP)} additional diagnostics not shown (${count(findings.length)} total)`);
  }
  lines.push('');
  return { lines, hasWarn: true };
}

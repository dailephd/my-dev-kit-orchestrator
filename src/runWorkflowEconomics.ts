import {
  RUN_TELEMETRY_VERSION,
  RunTelemetryCommand,
  RunTelemetryObservations,
  RunTelemetryRecord,
  TelemetryDiagnostic,
  compareTelemetryRecords,
  resolveRunTelemetryActivation,
} from './runTelemetry';
import { readRunTelemetry } from './runTelemetryStore';

// Deterministic Workflow Economics (v1.6.0 ORC-TELEMETRY, Batch 3).
//
// ONE pure evaluator over native telemetry observations. It is a DERIVED
// projection: nothing is persisted, and the same accepted record set always
// yields the same summary. It never evaluates RunIntegrityGate, judge
// integrity, lifecycle, or Semantic Continuity; it only counts values those
// owners already produced and Batch 2 copied into completed records. It reads
// no clock, spawns nothing, and writes nothing.
//
// Economics is descriptive. It is not workflow eligibility, and availability
// never means pass/fail/ready/blocked.
//
// Namespaces stay distinct: this version is not the package version, the
// telemetry schema version, or any ECO-00 schema version.

export const WORKFLOW_ECONOMICS_VERSION = '1.0.0';

/**
 * not-activated: legacy run, no economics required (not a warning).
 * available:     supported telemetry, full observation coverage.
 * partial:       supported telemetry, summarized, but coverage is incomplete
 *                (pending records, reader diagnostics, clock anomalies, or an
 *                aggregate that cannot be represented safely).
 * unsupported:   explicit unsupported runTelemetryVersion; never read as 1.0.0.
 */
export type WorkflowEconomicsAvailability = 'not-activated' | 'available' | 'partial' | 'unsupported';

export interface CommandInteractionCounts {
  completed: number;
  succeeded: number;
  failed: number;
}

export interface WorkflowEconomicsCoverage {
  completedInvocationCount: number;
  succeededInvocationCount: number;
  failedInvocationCount: number;
  /** Accepted unique pending invocations with no accepted completed record of the same id. Invalid records are diagnostics, not incomplete invocations. */
  incompleteInvocationCount: number;
  telemetryDiagnosticCount: number;
  /** True when adjacent completed intervals overlap; deterministic order is then not causal order. */
  concurrencyDetected: boolean;
  /** Completed records whose completedAt precedes startedAt (excluded from span/boundary inference). */
  wallClockAnomalyCount: number;
  /** True when a total could not be represented safely; the affected totals are null. */
  numericLimitExceeded: boolean;
}

export interface WorkflowEconomicsPrompts {
  /** Completed prompt records carrying a promptCharacterCount. Terminal messages that emitted no prompt are excluded. */
  promptRenderedCount: number;
  normalPromptRenderCount: number;
  /** Correction prompt renderings only. One rendering does not prove a correction cycle. */
  correctionPromptRenderCount: number;
  /** Characters (JS string length) of emitted prompts. Not tokens; never converted to tokens or cost. */
  totalPromptCharacters: number | null;
  minimumPromptCharacters: number | null;
  maximumPromptCharacters: number | null;
  /** total / rendered, 2 decimals via Number(x.toFixed(2)); null when nothing rendered. */
  averagePromptCharacters: number | null;
}

export interface WorkflowEconomicsDurations {
  /** Time inside recorded Orchestrator CLI interactions (monotonic). Not agent, human, model, or target-project time. */
  totalInvocationDurationMs: number | null;
  minimumInvocationDurationMs: number | null;
  maximumInvocationDurationMs: number | null;
  averageInvocationDurationMs: number | null;
  startDurationMs: number | null;
  promptDurationMs: number | null;
  markDurationMs: number | null;
}

export interface WorkflowEconomicsStages {
  /** Adjacent, non-overlapping completed pairs that both carry currentStage and stageIndex. */
  stageComparableBoundaryCount: number;
  stageTransitionCount: number;
  forwardStageTransitionCount: number;
  backwardStageTransitionCount: number;
  unchangedStageBoundaryCount: number;
  /** Equals backwardStageTransitionCount. Re-rendering a prompt is not a revisit. */
  stageRevisitCount: number;
}

export interface LifecycleStateCounts {
  incomplete: number;
  blocked: number;
  complete: number;
  /** Persisted tokens outside the current manual-state vocabulary. */
  unrecognized: number;
}

export interface WorkflowEconomicsLifecycle {
  successfulMarkCount: number;
  failedMarkCount: number;
  requestedStateCounts: LifecycleStateCounts;
  /** Recorded resulting-state observations only (no reconstructed history). */
  resultingStateObservationCount: number;
}

export interface WorkflowEconomicsIntegrity {
  /** Snapshots with availability observed and a boolean readiness. Not gate evaluations. */
  integrityObservationCount: number;
  integrityReadyObservationCount: number;
  integrityBlockedObservationCount: number;
  integrityComparableBoundaryCount: number;
  /** ready -> blocked between adjacent non-overlapping observed snapshots. */
  integrityBlockedEntryCount: number;
  /** blocked -> ready between adjacent non-overlapping observed snapshots. */
  integrityRecoveryCount: number;
}

export interface WorkflowEconomicsJudge {
  /** Snapshots, not judge attempts: repeated snapshots may describe one judge report. */
  judgeObservationCount: number;
  judgeAcceptedObservationCount: number;
  judgeRejectedObservationCount: number;
  finalEligibilityObservationCount: number;
  finalEligibleObservationCount: number;
  finalIneligibleObservationCount: number;
  finalEligibilityComparableBoundaryCount: number;
  finalEligibilityReachedCount: number;
  finalEligibilityLostCount: number;
}

export interface SemanticStateCounts {
  notApplicable: number;
  pending: number;
  complete: number;
  incomplete: number;
  indeterminate: number;
  failed: number;
  blocked: number;
  invalid: number;
  unrecognized: number;
}

export interface WorkflowEconomicsSemanticContinuity {
  semanticContinuityObservationCount: number;
  semanticContinuityNotApplicableCount: number;
  semanticContinuityUnavailableCount: number;
  /** From the explicit persisted classification (ready | warning | blocked) only. */
  semanticReadyObservationCount: number;
  semanticWarningObservationCount: number;
  semanticBlockingObservationCount: number;
  semanticUnrecognizedClassificationCount: number;
  continuityStateCounts: SemanticStateCounts;
}

export interface WorkflowEconomicsEvaluated {
  economicsVersion: typeof WORKFLOW_ECONOMICS_VERSION;
  availability: 'available' | 'partial';
  telemetryVersion: typeof RUN_TELEMETRY_VERSION;
  coverage: WorkflowEconomicsCoverage;
  interactions: Record<RunTelemetryCommand, CommandInteractionCounts>;
  prompts: WorkflowEconomicsPrompts;
  durations: WorkflowEconomicsDurations;
  /** latest completedAt - earliest startedAt over accepted completed records. Wall-clock span, NOT active work time. */
  observedWorkflowSpanMs: number | null;
  /** Adjacent completed pairs whose intervals overlap (B.startedAt < A.completedAt). */
  ambiguousTransitionBoundaryCount: number;
  stages: WorkflowEconomicsStages;
  lifecycle: WorkflowEconomicsLifecycle;
  integrity: WorkflowEconomicsIntegrity;
  judge: WorkflowEconomicsJudge;
  semanticContinuity: WorkflowEconomicsSemanticContinuity;
}

export interface WorkflowEconomicsNotEvaluated {
  economicsVersion: typeof WORKFLOW_ECONOMICS_VERSION;
  availability: 'not-activated' | 'unsupported';
  telemetryVersion: null;
}

export type WorkflowEconomicsSummary = WorkflowEconomicsEvaluated | WorkflowEconomicsNotEvaluated;

export interface WorkflowEconomicsInput {
  /** run.json#runTelemetryVersion, verbatim. Activation comes only from this. */
  runTelemetryVersion?: string;
  /** Accepted records from the canonical telemetry reader (any order; normalized here). */
  records: readonly RunTelemetryRecord[];
  /** Diagnostics from the canonical telemetry reader; only their count is used. */
  diagnostics: readonly TelemetryDiagnostic[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COMMANDS: readonly RunTelemetryCommand[] = ['start', 'prompt', 'mark'];

type Completed = RunTelemetryRecord & { completedAt: string; durationMs: number };

function observationsOf(record: RunTelemetryRecord): Partial<RunTelemetryObservations> {
  return record.observations as Partial<RunTelemetryObservations>;
}

function round2(value: number): number {
  return Number((value).toFixed(2));
}

/** Sum in the given order; null if the result is not a finite (and, for counts, safe-integer) number. */
function checkedSum(values: readonly number[], integer: boolean): number | null {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isFinite(total) || (integer && !Number.isSafeInteger(total))) return null;
  }
  return total;
}

function checkedAverage(total: number | null, count: number): number | null {
  if (total === null || count === 0) return null;
  const average = total / count;
  return Number.isFinite(average) ? round2(average) : null;
}

function extremum(values: readonly number[], pick: (a: number, b: number) => number): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => pick(a, b));
}

function emptyLifecycleCounts(): LifecycleStateCounts {
  return { incomplete: 0, blocked: 0, complete: 0, unrecognized: 0 };
}

function emptySemanticStateCounts(): SemanticStateCounts {
  return { notApplicable: 0, pending: 0, complete: 0, incomplete: 0, indeterminate: 0, failed: 0, blocked: 0, invalid: 0, unrecognized: 0 };
}

const SEMANTIC_STATE_KEYS: Record<string, keyof SemanticStateCounts> = {
  'not-applicable': 'notApplicable',
  pending: 'pending',
  complete: 'complete',
  incomplete: 'incomplete',
  indeterminate: 'indeterminate',
  failed: 'failed',
  blocked: 'blocked',
  invalid: 'invalid',
};

function outcomeOf(record: RunTelemetryRecord): 'succeeded' | 'failed' | undefined {
  const outcome = observationsOf(record).outcome;
  return outcome === 'succeeded' || outcome === 'failed' ? outcome : undefined;
}

function stageFactsOf(record: RunTelemetryRecord): number | undefined {
  const obs = observationsOf(record);
  return obs.currentStage !== undefined && typeof obs.stageIndex === 'number' ? obs.stageIndex : undefined;
}

function integrityReadyOf(record: RunTelemetryRecord): boolean | undefined {
  const integrity = observationsOf(record).integrity;
  return integrity?.availability === 'observed' && typeof integrity.runIntegrityReady === 'boolean' ? integrity.runIntegrityReady : undefined;
}

function finalEligibleOf(record: RunTelemetryRecord): boolean | undefined {
  const judge = observationsOf(record).judge;
  return judge?.availability === 'observed' && typeof judge.finalReportEligible === 'boolean' ? judge.finalReportEligible : undefined;
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

/**
 * Pure. Same accepted record set -> deep-equal summary, independent of the
 * order of `records`. Pending records never contribute to completed metrics.
 */
export function evaluateWorkflowEconomics(input: WorkflowEconomicsInput): WorkflowEconomicsSummary {
  const activation = resolveRunTelemetryActivation(input.runTelemetryVersion);
  if (activation === 'not-required') {
    return { economicsVersion: WORKFLOW_ECONOMICS_VERSION, availability: 'not-activated', telemetryVersion: null };
  }
  if (activation === 'unsupported') {
    return { economicsVersion: WORKFLOW_ECONOMICS_VERSION, availability: 'unsupported', telemetryVersion: null };
  }

  // Canonical deterministic order (startedAt, then invocationId); never re-derived from files.
  const ordered = [...input.records].sort(compareTelemetryRecords);
  const completed = ordered.filter((r): r is Completed => r.state === 'completed' && r.completedAt !== undefined && r.durationMs !== undefined);
  const completedIds = new Set(completed.map((r) => r.invocationId));
  // A leftover pending copy of a completed invocation is a reader diagnostic, never a second invocation.
  const incomplete = ordered.filter((r) => r.state === 'pending' && !completedIds.has(r.invocationId));

  let numericLimitExceeded = false;
  const sum = (values: readonly number[], integer: boolean): number | null => {
    const total = checkedSum(values, integer);
    if (total === null) numericLimitExceeded = true;
    return total;
  };

  // Interactions
  const interactions = {} as Record<RunTelemetryCommand, CommandInteractionCounts>;
  for (const command of COMMANDS) {
    const own = completed.filter((r) => r.command === command);
    const succeeded = own.filter((r) => outcomeOf(r) === 'succeeded').length;
    interactions[command] = { completed: own.length, succeeded, failed: own.filter((r) => outcomeOf(r) === 'failed').length };
  }
  const succeededInvocationCount = COMMANDS.reduce((n, c) => n + interactions[c].succeeded, 0);
  const failedInvocationCount = COMMANDS.reduce((n, c) => n + interactions[c].failed, 0);

  // Prompts
  const promptRecords = completed.filter((r) => r.command === 'prompt');
  const characterCounts = promptRecords
    .map((r) => observationsOf(r).promptCharacterCount)
    .filter((n): n is number => typeof n === 'number');
  const totalPromptCharacters = sum(characterCounts, true);
  const prompts: WorkflowEconomicsPrompts = {
    promptRenderedCount: characterCounts.length,
    normalPromptRenderCount: promptRecords.filter((r) => observationsOf(r).promptKind === 'stage').length,
    correctionPromptRenderCount: promptRecords.filter((r) => observationsOf(r).promptKind === 'correction').length,
    totalPromptCharacters: characterCounts.length === 0 ? 0 : totalPromptCharacters,
    minimumPromptCharacters: extremum(characterCounts, Math.min),
    maximumPromptCharacters: extremum(characterCounts, Math.max),
    averagePromptCharacters: checkedAverage(totalPromptCharacters, characterCounts.length),
  };

  // Durations (persisted monotonic values only; per-command sums define the total)
  const perCommandDuration = {} as Record<RunTelemetryCommand, number | null>;
  for (const command of COMMANDS) {
    perCommandDuration[command] = sum(completed.filter((r) => r.command === command).map((r) => r.durationMs), false);
  }
  const perCommandValues = COMMANDS.map((c) => perCommandDuration[c]);
  const totalDuration = perCommandValues.some((v) => v === null) ? null : sum(perCommandValues as number[], false);
  const allDurations = completed.map((r) => r.durationMs);
  const durations: WorkflowEconomicsDurations = {
    totalInvocationDurationMs: totalDuration,
    minimumInvocationDurationMs: extremum(allDurations, Math.min),
    maximumInvocationDurationMs: extremum(allDurations, Math.max),
    averageInvocationDurationMs: checkedAverage(totalDuration, completed.length),
    startDurationMs: perCommandDuration.start,
    promptDurationMs: perCommandDuration.prompt,
    markDurationMs: perCommandDuration.mark,
  };

  // Wall-clock intervals
  const intervals = completed.map((r) => ({ start: Date.parse(r.startedAt), end: Date.parse(r.completedAt) }));
  const sane = intervals.map((i) => i.end >= i.start);
  const wallClockAnomalyCount = sane.filter((ok) => !ok).length;
  let observedWorkflowSpanMs: number | null = null;
  if (completed.length > 0 && wallClockAnomalyCount === 0) {
    observedWorkflowSpanMs = Math.max(...intervals.map((i) => i.end)) - Math.min(...intervals.map((i) => i.start));
  }

  // Adjacent boundaries in deterministic order
  const stages: WorkflowEconomicsStages = {
    stageComparableBoundaryCount: 0, stageTransitionCount: 0, forwardStageTransitionCount: 0,
    backwardStageTransitionCount: 0, unchangedStageBoundaryCount: 0, stageRevisitCount: 0,
  };
  const integrityTransitions = { comparable: 0, blockedEntry: 0, recovery: 0 };
  const eligibilityTransitions = { comparable: 0, reached: 0, lost: 0 };
  let ambiguousTransitionBoundaryCount = 0;

  for (let i = 1; i < completed.length; i += 1) {
    const previous = completed[i - 1];
    const next = completed[i];
    if (!sane[i - 1] || !sane[i]) continue; // anomalous clock: nothing safe to infer
    if (intervals[i].start < intervals[i - 1].end) {
      ambiguousTransitionBoundaryCount += 1; // overlap: order is not causal; infer nothing
      continue;
    }

    const previousStage = stageFactsOf(previous);
    const nextStage = stageFactsOf(next);
    if (previousStage !== undefined && nextStage !== undefined) {
      stages.stageComparableBoundaryCount += 1;
      if (nextStage > previousStage) stages.forwardStageTransitionCount += 1;
      else if (nextStage < previousStage) stages.backwardStageTransitionCount += 1;
      else stages.unchangedStageBoundaryCount += 1;
    }

    const previousReady = integrityReadyOf(previous);
    const nextReady = integrityReadyOf(next);
    if (previousReady !== undefined && nextReady !== undefined) {
      integrityTransitions.comparable += 1;
      if (previousReady && !nextReady) integrityTransitions.blockedEntry += 1;
      if (!previousReady && nextReady) integrityTransitions.recovery += 1;
    }

    const previousEligible = finalEligibleOf(previous);
    const nextEligible = finalEligibleOf(next);
    if (previousEligible !== undefined && nextEligible !== undefined) {
      eligibilityTransitions.comparable += 1;
      if (!previousEligible && nextEligible) eligibilityTransitions.reached += 1;
      if (previousEligible && !nextEligible) eligibilityTransitions.lost += 1;
    }
  }
  stages.stageTransitionCount = stages.forwardStageTransitionCount + stages.backwardStageTransitionCount;
  stages.stageRevisitCount = stages.backwardStageTransitionCount;

  // Lifecycle (mark)
  const marks = completed.filter((r) => r.command === 'mark');
  const requestedStateCounts = emptyLifecycleCounts();
  let resultingStateObservationCount = 0;
  for (const record of marks) {
    const mark = observationsOf(record).mark;
    if (!mark) continue;
    if (mark.requestedState === 'incomplete' || mark.requestedState === 'blocked' || mark.requestedState === 'complete') {
      requestedStateCounts[mark.requestedState] += 1;
    } else {
      requestedStateCounts.unrecognized += 1;
    }
    if (mark.resultingState !== undefined) resultingStateObservationCount += 1;
  }

  // Integrity snapshots
  const integrityFlags = completed.map(integrityReadyOf).filter((v): v is boolean => v !== undefined);
  const integrity: WorkflowEconomicsIntegrity = {
    integrityObservationCount: integrityFlags.length,
    integrityReadyObservationCount: integrityFlags.filter((v) => v).length,
    integrityBlockedObservationCount: integrityFlags.filter((v) => !v).length,
    integrityComparableBoundaryCount: integrityTransitions.comparable,
    integrityBlockedEntryCount: integrityTransitions.blockedEntry,
    integrityRecoveryCount: integrityTransitions.recovery,
  };

  // Judge / final eligibility snapshots
  const judges = completed.map((r) => observationsOf(r).judge).filter((j) => j?.availability === 'observed');
  const eligibility = completed.map(finalEligibleOf).filter((v): v is boolean => v !== undefined);
  const judge: WorkflowEconomicsJudge = {
    judgeObservationCount: judges.length,
    judgeAcceptedObservationCount: judges.filter((j) => j?.verdictAccepted === true).length,
    judgeRejectedObservationCount: judges.filter((j) => j?.verdictAccepted === false).length,
    finalEligibilityObservationCount: eligibility.length,
    finalEligibleObservationCount: eligibility.filter((v) => v).length,
    finalIneligibleObservationCount: eligibility.filter((v) => !v).length,
    finalEligibilityComparableBoundaryCount: eligibilityTransitions.comparable,
    finalEligibilityReachedCount: eligibilityTransitions.reached,
    finalEligibilityLostCount: eligibilityTransitions.lost,
  };

  // Semantic Continuity snapshots (persisted finite vocabulary only)
  const semantic = completed.map((r) => observationsOf(r).semanticContinuity);
  const observedSemantic = semantic.filter((s) => s?.availability === 'observed');
  const continuityStateCounts = emptySemanticStateCounts();
  for (const snapshot of observedSemantic) {
    if (snapshot?.continuityState === undefined) continue;
    continuityStateCounts[SEMANTIC_STATE_KEYS[snapshot.continuityState] ?? 'unrecognized'] += 1;
  }
  const classifications = observedSemantic.map((s) => s?.classification).filter((c): c is string => c !== undefined);
  const semanticContinuity: WorkflowEconomicsSemanticContinuity = {
    semanticContinuityObservationCount: observedSemantic.length,
    semanticContinuityNotApplicableCount: semantic.filter((s) => s?.availability === 'not-applicable').length,
    semanticContinuityUnavailableCount: semantic.filter((s) => s?.availability === 'unavailable').length,
    semanticReadyObservationCount: classifications.filter((c) => c === 'ready').length,
    semanticWarningObservationCount: classifications.filter((c) => c === 'warning').length,
    semanticBlockingObservationCount: classifications.filter((c) => c === 'blocked').length,
    semanticUnrecognizedClassificationCount: classifications.filter((c) => c !== 'ready' && c !== 'warning' && c !== 'blocked').length,
    continuityStateCounts,
  };

  const coverage: WorkflowEconomicsCoverage = {
    completedInvocationCount: completed.length,
    succeededInvocationCount,
    failedInvocationCount,
    incompleteInvocationCount: incomplete.length,
    telemetryDiagnosticCount: input.diagnostics.length,
    concurrencyDetected: ambiguousTransitionBoundaryCount > 0,
    wallClockAnomalyCount,
    numericLimitExceeded,
  };
  const partial = incomplete.length > 0 || input.diagnostics.length > 0 || wallClockAnomalyCount > 0 || numericLimitExceeded;

  return {
    economicsVersion: WORKFLOW_ECONOMICS_VERSION,
    availability: partial ? 'partial' : 'available',
    telemetryVersion: RUN_TELEMETRY_VERSION,
    coverage,
    interactions,
    prompts,
    durations,
    observedWorkflowSpanMs,
    ambiguousTransitionBoundaryCount,
    stages,
    lifecycle: {
      successfulMarkCount: interactions.mark.succeeded,
      failedMarkCount: interactions.mark.failed,
      requestedStateCounts,
      resultingStateObservationCount,
    },
    integrity,
    judge,
    semanticContinuity,
  };
}

/**
 * Read-only convenience for callers holding run metadata: reads through the
 * canonical telemetry reader (no second parser), then evaluates. Writes nothing.
 */
export function computeRunWorkflowEconomics(run: {
  projectRoot: string;
  runId: string;
  runTelemetryVersion?: string;
}): WorkflowEconomicsSummary {
  const view = readRunTelemetry(run);
  return evaluateWorkflowEconomics({
    runTelemetryVersion: run.runTelemetryVersion,
    records: view.records,
    diagnostics: view.activation === 'unsupported' ? [] : view.diagnostics,
  });
}

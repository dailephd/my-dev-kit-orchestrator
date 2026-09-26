import {
  MonotonicTimer,
  RunTelemetryCommand,
  RunTelemetryIntegrityObservation,
  RunTelemetryJudgeObservation,
  RunTelemetryObservations,
  RunTelemetryOutcome,
  RunTelemetryRecord,
  RunTelemetrySemanticContinuityObservation,
  isTelemetryToken,
  nowUtcIso,
  resolveRunTelemetryActivation,
  startMonotonicTimer,
} from './runTelemetry';
import { completeInvocation, createPendingInvocation } from './runTelemetryStore';
import type { RunIntegrityGateResult } from './runIntegrityGate';
import type { JudgeIntegrityResult } from './judgeIntegrity';
import { summarizeSemanticContinuityGate } from './semanticContinuitySurface';

// Telemetry observation adapter (v1.6.0 ORC-TELEMETRY, Batch 2).
//
// Dependency direction is one-way: canonical owners (run integrity gate, judge
// integrity, Semantic Continuity surface) -> this projector -> telemetry
// contract/store. It only COPIES bounded facts from results a command has
// already computed. It never evaluates a gate, judge, lifecycle, or Semantic
// Continuity rule, and no canonical owner imports it.
//
// Telemetry is non-blocking: every failure becomes at most one bounded stderr
// warning and never changes the command's output, exit code, or workflow state.

/** The subset of run metadata the adapter needs. */
export interface TelemetryRunFacts {
  runId: string;
  mode: string;
  projectRoot: string;
  currentStage: string;
  status: string;
  stages: ReadonlyArray<{ name: string }>;
  runTelemetryVersion?: string;
}

function token(value: string | null | undefined): string | undefined {
  return value !== undefined && value !== null && isTelemetryToken(value) ? value : undefined;
}

function defined<T extends object>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) if (entry !== undefined) out[key] = entry;
  return out as T;
}

/** Core facts every completed record carries. */
export function projectCoreObservations(run: TelemetryRunFacts, outcome: RunTelemetryOutcome): RunTelemetryObservations {
  const index = run.stages.findIndex((stage) => stage.name === run.currentStage);
  return defined({
    outcome,
    mode: run.mode,
    currentStage: token(run.currentStage),
    stageIndex: index >= 0 ? index : undefined,
    stageCount: run.stages.length,
    runStatus: token(run.status),
  }) as RunTelemetryObservations;
}

export function projectIntegrityObservation(gate: RunIntegrityGateResult): RunTelemetryIntegrityObservation {
  return defined({
    availability: 'observed' as const,
    runIntegrityReady: gate.runIntegrityReady,
    expectedJudgeVerdict: token(gate.expectedJudgeVerdict),
    primaryBlockingCode: token(gate.primaryBlockingCode),
    recommendedCorrectionStage: token(gate.recommendedCorrectionStage),
  });
}

export function projectJudgeObservation(
  judge: JudgeIntegrityResult,
  finalReportEligible?: boolean,
): RunTelemetryJudgeObservation {
  return defined({
    availability: 'observed' as const,
    judgeArtifactPresent: judge.judgeArtifactPresent,
    verdictParseStatus: token(judge.judgeVerdictParseStatus),
    authoredVerdict: token(judge.authoredJudgeVerdict),
    verdictAccepted: judge.judgeVerdictAccepted,
    correctionRequired: judge.correctionRequired,
    correctionBlocked: judge.correctionBlocked,
    finalReportEligible,
  });
}

/** Uses the existing canonical summary; `not-applicable` mirrors its null result. */
export function projectSemanticContinuityObservation(gate: RunIntegrityGateResult): RunTelemetrySemanticContinuityObservation {
  const summary = summarizeSemanticContinuityGate(gate);
  if (!summary) return { availability: 'not-applicable' };
  return defined({
    availability: 'observed' as const,
    classification: token(summary.classification),
    continuityState: token(summary.continuityState),
    blockingCodeCount: summary.blockingCodes.length,
    warningCodeCount: summary.warningCodes.length,
    criticalResponsibilityCount: summary.criticalResponsibilityCount,
    noncriticalResponsibilityCount: summary.noncriticalResponsibilityCount,
    primaryBlockingCode: token(summary.primaryBlockingCode),
  });
}

export interface TelemetryCanonicalResults {
  gate?: RunIntegrityGateResult;
  judge?: JudgeIntegrityResult;
  finalReportEligible?: boolean;
}

/** Domains the command did not compute are explicitly `unavailable`, never absent-means-pass. */
export function projectCanonicalObservations(results: TelemetryCanonicalResults): Partial<RunTelemetryObservations> {
  return {
    integrity: results.gate ? projectIntegrityObservation(results.gate) : { availability: 'unavailable' },
    judge: results.judge ? projectJudgeObservation(results.judge, results.finalReportEligible) : { availability: 'unavailable' },
    semanticContinuity: results.gate ? projectSemanticContinuityObservation(results.gate) : { availability: 'unavailable' },
  };
}

// ─── Invocation session ───────────────────────────────────────────────────────

export interface TelemetrySession {
  /** True when a pending record was durably created. */
  readonly recording: boolean;
  /** Completes the invocation with outcome=succeeded. Never throws. */
  succeed(extra?: Partial<RunTelemetryObservations>): void;
  /** Completes the invocation with outcome=failed (handled failure). Never throws. */
  fail(extra?: Partial<RunTelemetryObservations>): void;
}

const INACTIVE_SESSION: TelemetrySession = { recording: false, succeed: () => undefined, fail: () => undefined };

export interface BeginTelemetryOptions {
  /** Reuse an anchor captured earlier (e.g. at command entry). */
  timer?: MonotonicTimer;
  startedAt?: string;
}

/**
 * Begins recording one workflow interaction. Legacy runs return an inactive
 * session silently; an unsupported version records nothing and warns once.
 */
export function beginTelemetryInvocation(
  run: TelemetryRunFacts,
  command: RunTelemetryCommand,
  options: BeginTelemetryOptions = {},
): TelemetrySession {
  let warned = false;
  const warn = (code: string): void => {
    if (warned) return;
    warned = true;
    try {
      console.error(`Telemetry warning: ${code}`);
    } catch {
      // Telemetry never affects the command.
    }
  };

  try {
    const activation = resolveRunTelemetryActivation(run.runTelemetryVersion);
    if (activation === 'not-required') return INACTIVE_SESSION;
    if (activation === 'unsupported') {
      warn('UNSUPPORTED_RUN_TELEMETRY_VERSION');
      return INACTIVE_SESSION;
    }

    const timer = options.timer ?? startMonotonicTimer();
    const created = createPendingInvocation(run.projectRoot, {
      runId: run.runId,
      command,
      startedAt: options.startedAt ?? nowUtcIso(),
    });
    if (!created.ok) {
      warn(created.error.code);
      return INACTIVE_SESSION;
    }
    const pending: RunTelemetryRecord = created.value.record;
    let finished = false;

    const finish = (outcome: RunTelemetryOutcome, extra?: Partial<RunTelemetryObservations>): void => {
      if (finished) return;
      finished = true;
      try {
        const observations = defined({ ...projectCoreObservations(run, outcome), ...extra, outcome }) as RunTelemetryObservations;
        const done = completeInvocation(run.projectRoot, pending, { durationMs: timer.elapsedMs(), observations });
        if (!done.ok) warn(done.error.code);
      } catch {
        warn('IO_ERROR');
      }
    };

    return { recording: true, succeed: (extra) => finish('succeeded', extra), fail: (extra) => finish('failed', extra) };
  } catch {
    warn('IO_ERROR');
    return INACTIVE_SESSION;
  }
}

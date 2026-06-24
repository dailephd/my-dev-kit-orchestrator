import { JudgeVerdict, ParsedJudgeReport, parseJudgeReport } from './judgeParser';

// The set of stage names that correction routing can target.
// These are the canonical stage names as used in workflow stage definitions.
export const CORRECTABLE_STAGES = [
  'architecture-context',
  'behavior-model',
  'pseudocode-packet',
  'test-strategy',
  'test-implementation',
  'implementation',
  'verification',
] as const;

export type CorrectableStage = (typeof CORRECTABLE_STAGES)[number];

export type RouteStatus =
  | 'pass'
  | 'correction_required'
  | 'blocked'
  | 'unknown_verdict'
  | 'missing_verdict';

export interface CorrectionRouteResult {
  verdict: JudgeVerdict | null;
  recommendedStage: string | null;
  routedStage: CorrectableStage | null;
  routeStatus: RouteStatus;
  warnings: string[];
  errors: string[];
  isBlocked: boolean;
  strictFail: boolean;
}

/**
 * Deterministic routing table: maps each non-PASS verdict to a default
 * correction stage. SCOPE_VIOLATION and BLOCKED do not route to a stage —
 * they produce the "blocked" status instead.
 */
const VERDICT_ROUTE_TABLE: Partial<Record<JudgeVerdict, CorrectableStage>> = {
  NEED_CONTEXT: 'architecture-context',
  DESIGN_INCOMPLETE: 'behavior-model',
  PSEUDOCODE_INCOMPLETE: 'pseudocode-packet',
  IMPLEMENTATION_MISMATCH: 'implementation',
  TEST_COVERAGE_INCOMPLETE: 'test-strategy',
  ARCHITECTURE_MISMATCH: 'architecture-context',
  NEED_VERIFICATION: 'verification',
};

const BLOCKED_VERDICTS = new Set<JudgeVerdict>(['SCOPE_VIOLATION', 'BLOCKED']);

export function isCorrectableStage(s: string): s is CorrectableStage {
  return (CORRECTABLE_STAGES as readonly string[]).includes(s);
}

/**
 * Routes a parsed judge report to a correction stage.
 *
 * - PASS → routeStatus: 'pass', no correction
 * - null verdict with parseError → routeStatus: 'unknown_verdict'
 * - null verdict without parseError → routeStatus: 'missing_verdict'
 * - SCOPE_VIOLATION / BLOCKED → routeStatus: 'blocked', isBlocked: true
 * - Other known verdicts → routeStatus: 'correction_required', routedStage from table
 *
 * If recommendedNextStage conflicts with the table default, a warning is added.
 * In strict mode, a conflict produces strictFail: true.
 */
export function routeJudgeVerdict(
  parsed: ParsedJudgeReport,
  options: { strict?: boolean } = {},
): CorrectionRouteResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (parsed.parseError) {
    errors.push(parsed.parseError);
    return {
      verdict: null,
      recommendedStage: parsed.recommendedNextStage,
      routedStage: null,
      routeStatus: 'unknown_verdict',
      warnings,
      errors,
      isBlocked: false,
      strictFail: false,
    };
  }

  if (parsed.verdict === null) {
    return {
      verdict: null,
      recommendedStage: parsed.recommendedNextStage,
      routedStage: null,
      routeStatus: 'missing_verdict',
      warnings,
      errors,
      isBlocked: false,
      strictFail: false,
    };
  }

  if (parsed.verdict === 'PASS') {
    return {
      verdict: 'PASS',
      recommendedStage: parsed.recommendedNextStage,
      routedStage: null,
      routeStatus: 'pass',
      warnings,
      errors,
      isBlocked: false,
      strictFail: false,
    };
  }

  if (BLOCKED_VERDICTS.has(parsed.verdict)) {
    return {
      verdict: parsed.verdict,
      recommendedStage: parsed.recommendedNextStage,
      routedStage: null,
      routeStatus: 'blocked',
      warnings,
      errors,
      isBlocked: true,
      strictFail: false,
    };
  }

  // Correction-required verdicts
  const tableStage = VERDICT_ROUTE_TABLE[parsed.verdict] ?? null;

  // Honour recommended stage when it's a valid correctable stage
  let routedStage: CorrectableStage | null = tableStage;
  if (parsed.recommendedNextStage) {
    if (isCorrectableStage(parsed.recommendedNextStage)) {
      if (parsed.recommendedNextStage !== tableStage) {
        // Conflict between table and recommendation
        const msg =
          `Judge recommended "${parsed.recommendedNextStage}" but routing table suggests ` +
          `"${tableStage}" for verdict ${parsed.verdict}. Using recommended stage.`;
        warnings.push(msg);
        if (options.strict) {
          errors.push(`Strict mode: verdict/recommended-stage conflict is a failure. ${msg}`);
        }
      }
      // Recommended stage wins when it's correctable
      routedStage = parsed.recommendedNextStage as CorrectableStage;
    } else {
      warnings.push(
        `Recommended next stage "${parsed.recommendedNextStage}" is not a known correctable stage; ` +
          `using table default "${tableStage}".`,
      );
    }
  }

  return {
    verdict: parsed.verdict,
    recommendedStage: parsed.recommendedNextStage,
    routedStage,
    routeStatus: 'correction_required',
    warnings,
    errors,
    isBlocked: false,
    strictFail: options.strict === true && errors.length > 0,
  };
}

/**
 * High-level helper: parse a judge report string and route it in one call.
 */
export function parseAndRoute(
  content: string,
  options: { strict?: boolean } = {},
): CorrectionRouteResult {
  const parsed = parseJudgeReport(content);
  return routeJudgeVerdict(parsed, options);
}

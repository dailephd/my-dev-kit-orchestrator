// Supported judge verdicts as a const tuple for exhaustive typing
export const JUDGE_VERDICTS = [
  'PASS',
  'DESIGN_INCOMPLETE',
  'PSEUDOCODE_INCOMPLETE',
  'IMPLEMENTATION_MISMATCH',
  'TEST_COVERAGE_INCOMPLETE',
  'ARCHITECTURE_MISMATCH',
  'NEED_VERIFICATION',
  'NEED_CONTEXT',
  'SCOPE_VIOLATION',
  'BLOCKED',
] as const;

export type JudgeVerdict = (typeof JUDGE_VERDICTS)[number];

export interface ParsedJudgeReport {
  verdict: JudgeVerdict | null;
  recommendedNextStage: string | null;
  raw: string;
  parseError: string | null;
}

// Matches "Verdict: SOME_VERDICT" or "Verdict: SOME_VERDICT (optional trailing text)"
const VERDICT_RE = /^Verdict:\s+([A-Z_]+)(?:\s|$)/im;

// Matches "Recommended next stage: <stage-name>" or
// "Recommended next stage if not PASS: <stage-name>"
const RECOMMENDED_STAGE_RE =
  /^Recommended next stage(?:[^:]*)?:\s+([a-z][a-z0-9-]*)(?:\s|$)/im;

export function isValidVerdict(v: string): v is JudgeVerdict {
  return (JUDGE_VERDICTS as readonly string[]).includes(v);
}

/**
 * Parses the content of a judge-report.txt file.
 * Returns the verdict (or null if absent/unknown), the recommended next stage,
 * and a parseError if the verdict token was present but unrecognized.
 */
export function parseJudgeReport(content: string): ParsedJudgeReport {
  const raw = content;

  const verdictMatch = VERDICT_RE.exec(content);
  const recommendedMatch = RECOMMENDED_STAGE_RE.exec(content);

  const recommendedNextStage = recommendedMatch ? recommendedMatch[1].trim() : null;

  if (!verdictMatch) {
    return { verdict: null, recommendedNextStage, raw, parseError: null };
  }

  const token = verdictMatch[1].trim();
  if (!isValidVerdict(token)) {
    return {
      verdict: null,
      recommendedNextStage,
      raw,
      parseError: `Unrecognized verdict token: "${token}". Supported: ${JUDGE_VERDICTS.join(', ')}`,
    };
  }

  return { verdict: token, recommendedNextStage, raw, parseError: null };
}

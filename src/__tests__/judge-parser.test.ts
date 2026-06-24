import {
  parseJudgeReport,
  isValidVerdict,
  JUDGE_VERDICTS,
  JudgeVerdict,
} from '../judgeParser';

describe('JUDGE_VERDICTS', () => {
  it('includes all required verdicts', () => {
    const expected = [
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
    ];
    for (const v of expected) {
      expect(JUDGE_VERDICTS).toContain(v);
    }
  });
});

describe('isValidVerdict', () => {
  it('returns true for all supported verdicts', () => {
    for (const v of JUDGE_VERDICTS) {
      expect(isValidVerdict(v)).toBe(true);
    }
  });

  it('returns false for unknown tokens', () => {
    expect(isValidVerdict('UNKNOWN')).toBe(false);
    expect(isValidVerdict('pass')).toBe(false);
    expect(isValidVerdict('')).toBe(false);
    expect(isValidVerdict('FAIL')).toBe(false);
  });
});

describe('parseJudgeReport', () => {
  it('parses a simple PASS verdict', () => {
    const result = parseJudgeReport('Verdict: PASS\n');
    expect(result.verdict).toBe('PASS');
    expect(result.recommendedNextStage).toBeNull();
    expect(result.parseError).toBeNull();
  });

  it('parses IMPLEMENTATION_MISMATCH', () => {
    const result = parseJudgeReport('Verdict: IMPLEMENTATION_MISMATCH');
    expect(result.verdict).toBe('IMPLEMENTATION_MISMATCH');
    expect(result.parseError).toBeNull();
  });

  it('parses NEED_CONTEXT', () => {
    const result = parseJudgeReport('Verdict: NEED_CONTEXT');
    expect(result.verdict).toBe('NEED_CONTEXT');
  });

  it('parses DESIGN_INCOMPLETE', () => {
    const result = parseJudgeReport('Verdict: DESIGN_INCOMPLETE');
    expect(result.verdict).toBe('DESIGN_INCOMPLETE');
  });

  it('parses PSEUDOCODE_INCOMPLETE', () => {
    const result = parseJudgeReport('Verdict: PSEUDOCODE_INCOMPLETE');
    expect(result.verdict).toBe('PSEUDOCODE_INCOMPLETE');
  });

  it('parses TEST_COVERAGE_INCOMPLETE', () => {
    const result = parseJudgeReport('Verdict: TEST_COVERAGE_INCOMPLETE');
    expect(result.verdict).toBe('TEST_COVERAGE_INCOMPLETE');
  });

  it('parses ARCHITECTURE_MISMATCH', () => {
    const result = parseJudgeReport('Verdict: ARCHITECTURE_MISMATCH');
    expect(result.verdict).toBe('ARCHITECTURE_MISMATCH');
  });

  it('parses NEED_VERIFICATION', () => {
    const result = parseJudgeReport('Verdict: NEED_VERIFICATION');
    expect(result.verdict).toBe('NEED_VERIFICATION');
  });

  it('parses SCOPE_VIOLATION', () => {
    const result = parseJudgeReport('Verdict: SCOPE_VIOLATION');
    expect(result.verdict).toBe('SCOPE_VIOLATION');
  });

  it('parses BLOCKED', () => {
    const result = parseJudgeReport('Verdict: BLOCKED');
    expect(result.verdict).toBe('BLOCKED');
  });

  it('returns null verdict when no Verdict: line exists', () => {
    const result = parseJudgeReport('This is a judge report without a verdict field.');
    expect(result.verdict).toBeNull();
    expect(result.parseError).toBeNull();
  });

  it('returns parseError for unknown verdict token', () => {
    const result = parseJudgeReport('Verdict: SOMETHING_ELSE');
    expect(result.verdict).toBeNull();
    expect(result.parseError).toMatch(/SOMETHING_ELSE/);
    expect(result.parseError).toMatch(/Unrecognized verdict token/);
  });

  it('is case-insensitive for the Verdict: label (regex is /i)', () => {
    const result = parseJudgeReport('verdict: PASS');
    expect(result.verdict).toBe('PASS');
  });

  it('handles extra surrounding prose', () => {
    const content = [
      'Judge Report',
      '',
      'Summary: The implementation does not match the pseudocode.',
      '',
      'Verdict: IMPLEMENTATION_MISMATCH',
      '',
      'Recommended next stage: implementation',
    ].join('\n');
    const result = parseJudgeReport(content);
    expect(result.verdict).toBe('IMPLEMENTATION_MISMATCH');
    expect(result.recommendedNextStage).toBe('implementation');
  });

  it('parses recommended next stage', () => {
    const result = parseJudgeReport(
      'Verdict: PSEUDOCODE_INCOMPLETE\nRecommended next stage: pseudocode-packet',
    );
    expect(result.recommendedNextStage).toBe('pseudocode-packet');
  });

  it('parses "Recommended next stage if not PASS:" variant', () => {
    const result = parseJudgeReport(
      'Verdict: PASS\nRecommended next stage if not PASS: pseudocode-packet',
    );
    expect(result.verdict).toBe('PASS');
    expect(result.recommendedNextStage).toBe('pseudocode-packet');
  });

  it('parses "Recommended next stage - <stage>" dash-separator variant', () => {
    const result = parseJudgeReport(
      'Verdict: DESIGN_INCOMPLETE\nRecommended next stage - behavior-model',
    );
    expect(result.verdict).toBe('DESIGN_INCOMPLETE');
    expect(result.recommendedNextStage).toBe('behavior-model');
  });

  it('parses "Recommended stage: <stage>" short label variant', () => {
    const result = parseJudgeReport(
      'Verdict: PSEUDOCODE_INCOMPLETE\nRecommended stage: pseudocode-packet',
    );
    expect(result.recommendedNextStage).toBe('pseudocode-packet');
  });

  it('parses "Next stage: <stage>" label variant', () => {
    const result = parseJudgeReport(
      'Verdict: IMPLEMENTATION_MISMATCH\nNext stage: implementation',
    );
    expect(result.recommendedNextStage).toBe('implementation');
  });

  it('parses "Route to: <stage>" label variant', () => {
    const result = parseJudgeReport(
      'Verdict: NEED_CONTEXT\nRoute to: architecture-context',
    );
    expect(result.recommendedNextStage).toBe('architecture-context');
  });

  it('parses "Routed stage: <stage>" label variant', () => {
    const result = parseJudgeReport(
      'Verdict: ARCHITECTURE_MISMATCH\nRouted stage: architecture-context',
    );
    expect(result.recommendedNextStage).toBe('architecture-context');
  });

  it('returns null recommendedNextStage when field is absent', () => {
    const result = parseJudgeReport('Verdict: PASS');
    expect(result.recommendedNextStage).toBeNull();
  });

  it('preserves raw content', () => {
    const content = 'Verdict: PASS\nsome extra text';
    const result = parseJudgeReport(content);
    expect(result.raw).toBe(content);
  });

  it('handles empty content', () => {
    const result = parseJudgeReport('');
    expect(result.verdict).toBeNull();
    expect(result.parseError).toBeNull();
    expect(result.recommendedNextStage).toBeNull();
  });

  // All verdicts round-trip
  it.each(JUDGE_VERDICTS as unknown as JudgeVerdict[])('round-trips verdict %s', (v) => {
    const result = parseJudgeReport(`Verdict: ${v}`);
    expect(result.verdict).toBe(v);
    expect(result.parseError).toBeNull();
  });
});

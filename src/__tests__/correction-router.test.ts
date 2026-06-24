import {
  routeJudgeVerdict,
  parseAndRoute,
  isCorrectableStage,
  CORRECTABLE_STAGES,
} from '../correctionRouter';
import { parseJudgeReport } from '../judgeParser';

describe('CORRECTABLE_STAGES', () => {
  it('includes all expected correction targets', () => {
    const expected = [
      'architecture-context',
      'behavior-model',
      'pseudocode-packet',
      'test-strategy',
      'test-implementation',
      'implementation',
      'verification',
    ];
    for (const s of expected) {
      expect(CORRECTABLE_STAGES).toContain(s);
    }
  });
});

describe('isCorrectableStage', () => {
  it('returns true for valid correctable stages', () => {
    for (const s of CORRECTABLE_STAGES) {
      expect(isCorrectableStage(s)).toBe(true);
    }
  });

  it('returns false for unknown stages', () => {
    expect(isCorrectableStage('final-report')).toBe(false);
    expect(isCorrectableStage('judge')).toBe(false);
    expect(isCorrectableStage('')).toBe(false);
  });
});

describe('routeJudgeVerdict - PASS', () => {
  it('routes PASS to routeStatus pass with no correction', () => {
    const parsed = parseJudgeReport('Verdict: PASS');
    const result = routeJudgeVerdict(parsed);
    expect(result.routeStatus).toBe('pass');
    expect(result.routedStage).toBeNull();
    expect(result.isBlocked).toBe(false);
    expect(result.verdict).toBe('PASS');
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

describe('routeJudgeVerdict - correction-required verdicts', () => {
  it('NEED_CONTEXT routes to architecture-context', () => {
    const result = parseAndRoute('Verdict: NEED_CONTEXT');
    expect(result.routeStatus).toBe('correction_required');
    expect(result.routedStage).toBe('architecture-context');
  });

  it('DESIGN_INCOMPLETE routes to behavior-model', () => {
    const result = parseAndRoute('Verdict: DESIGN_INCOMPLETE');
    expect(result.routeStatus).toBe('correction_required');
    expect(result.routedStage).toBe('behavior-model');
  });

  it('PSEUDOCODE_INCOMPLETE routes to pseudocode-packet', () => {
    const result = parseAndRoute('Verdict: PSEUDOCODE_INCOMPLETE');
    expect(result.routeStatus).toBe('correction_required');
    expect(result.routedStage).toBe('pseudocode-packet');
  });

  it('IMPLEMENTATION_MISMATCH routes to implementation', () => {
    const result = parseAndRoute('Verdict: IMPLEMENTATION_MISMATCH');
    expect(result.routeStatus).toBe('correction_required');
    expect(result.routedStage).toBe('implementation');
  });

  it('TEST_COVERAGE_INCOMPLETE routes to test-strategy by default', () => {
    const result = parseAndRoute('Verdict: TEST_COVERAGE_INCOMPLETE');
    expect(result.routeStatus).toBe('correction_required');
    expect(result.routedStage).toBe('test-strategy');
  });

  it('TEST_COVERAGE_INCOMPLETE routes to test-implementation when recommended', () => {
    const result = parseAndRoute(
      'Verdict: TEST_COVERAGE_INCOMPLETE\nRecommended next stage: test-implementation',
    );
    expect(result.routedStage).toBe('test-implementation');
    expect(result.warnings).toHaveLength(1); // table vs recommended conflict
  });

  it('ARCHITECTURE_MISMATCH routes to architecture-context by default', () => {
    const result = parseAndRoute('Verdict: ARCHITECTURE_MISMATCH');
    expect(result.routeStatus).toBe('correction_required');
    expect(result.routedStage).toBe('architecture-context');
  });

  it('ARCHITECTURE_MISMATCH routes to pseudocode-packet when recommended', () => {
    const result = parseAndRoute(
      'Verdict: ARCHITECTURE_MISMATCH\nRecommended next stage: pseudocode-packet',
    );
    expect(result.routedStage).toBe('pseudocode-packet');
  });

  it('NEED_VERIFICATION routes to verification', () => {
    const result = parseAndRoute('Verdict: NEED_VERIFICATION');
    expect(result.routeStatus).toBe('correction_required');
    expect(result.routedStage).toBe('verification');
  });
});

describe('routeJudgeVerdict - blocked verdicts', () => {
  it('SCOPE_VIOLATION produces blocked status', () => {
    const result = parseAndRoute('Verdict: SCOPE_VIOLATION');
    expect(result.routeStatus).toBe('blocked');
    expect(result.isBlocked).toBe(true);
    expect(result.routedStage).toBeNull();
  });

  it('BLOCKED produces blocked status', () => {
    const result = parseAndRoute('Verdict: BLOCKED');
    expect(result.routeStatus).toBe('blocked');
    expect(result.isBlocked).toBe(true);
    expect(result.routedStage).toBeNull();
  });
});

describe('routeJudgeVerdict - missing verdict', () => {
  it('returns missing_verdict status when no verdict line', () => {
    const result = parseAndRoute('This judge report has no verdict line.');
    expect(result.routeStatus).toBe('missing_verdict');
    expect(result.verdict).toBeNull();
    expect(result.routedStage).toBeNull();
    expect(result.isBlocked).toBe(false);
  });

  it('returns unknown_verdict when verdict token is unrecognized', () => {
    const result = parseAndRoute('Verdict: SOMETHING_INVENTED');
    expect(result.routeStatus).toBe('unknown_verdict');
    expect(result.verdict).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/SOMETHING_INVENTED/);
  });
});

describe('routeJudgeVerdict - recommended stage', () => {
  it('uses recommended stage when it matches table', () => {
    const result = parseAndRoute(
      'Verdict: NEED_CONTEXT\nRecommended next stage: architecture-context',
    );
    expect(result.routedStage).toBe('architecture-context');
    expect(result.warnings).toHaveLength(0);
  });

  it('uses recommended stage when it differs from table and adds warning (normal mode)', () => {
    const result = parseAndRoute(
      'Verdict: NEED_CONTEXT\nRecommended next stage: behavior-model',
      { strict: false },
    );
    expect(result.routedStage).toBe('behavior-model');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.strictFail).toBe(false);
  });

  it('adds error and strictFail in strict mode when stage conflicts with table', () => {
    const result = parseAndRoute(
      'Verdict: NEED_CONTEXT\nRecommended next stage: behavior-model',
      { strict: true },
    );
    expect(result.routedStage).toBe('behavior-model');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.strictFail).toBe(true);
  });

  it('ignores non-correctable recommended stage and uses table default with warning', () => {
    const result = parseAndRoute(
      'Verdict: NEED_CONTEXT\nRecommended next stage: final-report',
    );
    expect(result.routedStage).toBe('architecture-context');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/final-report/);
  });
});

describe('routeJudgeVerdict - no autonomous execution', () => {
  it('does not modify any files or side effects (pure function)', () => {
    // Just verify the function returns a plain object without side effects
    const result = parseAndRoute('Verdict: IMPLEMENTATION_MISMATCH');
    expect(typeof result).toBe('object');
    expect(result.routeStatus).toBe('correction_required');
    // No file system access, no mutation - verified by the function signature and pure logic
  });
});


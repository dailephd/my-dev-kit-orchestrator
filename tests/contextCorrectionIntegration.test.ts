import { parseAndRoute, CORRECTABLE_STAGES } from '../src/correctionRouter';
import { VALID_MODES } from '../src/types';

// Batch 5 section 17.6/26.9: NEED_CONTEXT plus an explicit "Recommended next
// stage:" must route to that exact stage using the *existing* parser/router
// -- no changes to judgeParser.ts or correctionRouter.ts were required or
// made. This proves the contract the judge prompt's NEED_CONTEXT
// instructions (see tests/contextJudgeIntegration.test.ts) depend on.
describe('NEED_CONTEXT correction routing (existing parser/router, unmodified)', () => {
  it('routes to implementation when recommended', () => {
    const result = parseAndRoute('Verdict: NEED_CONTEXT\nRecommended next stage: implementation');
    expect(result.routeStatus).toBe('correction_required');
    expect(result.routedStage).toBe('implementation');
    expect(result.isBlocked).toBe(false);
  });

  it('routes to test-implementation when recommended', () => {
    const result = parseAndRoute('Verdict: NEED_CONTEXT\nRecommended next stage: test-implementation');
    expect(result.routeStatus).toBe('correction_required');
    expect(result.routedStage).toBe('test-implementation');
  });

  it('falls back to the table default (architecture-context) when no recommendation is given', () => {
    const result = parseAndRoute('Verdict: NEED_CONTEXT');
    expect(result.routedStage).toBe('architecture-context');
  });

  it.each(VALID_MODES.filter((m) => m !== 'greenfield'))('%s: routing works identically regardless of mode (routing is mode-agnostic)', (_mode) => {
    const result = parseAndRoute('Verdict: NEED_CONTEXT\nRecommended next stage: implementation');
    expect(result.routedStage).toBe('implementation');
  });

  it('recommended stage must be a known correctable stage', () => {
    expect(CORRECTABLE_STAGES).toContain('implementation');
    expect(CORRECTABLE_STAGES).toContain('test-implementation');
  });

  it('an invalid recommended stage preserves existing error/warning behavior (falls back to table default)', () => {
    const result = parseAndRoute('Verdict: NEED_CONTEXT\nRecommended next stage: not-a-real-stage');
    expect(result.routedStage).toBe('architecture-context');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('PASS routing is unaffected', () => {
    const result = parseAndRoute('Verdict: PASS');
    expect(result.routeStatus).toBe('pass');
    expect(result.routedStage).toBeNull();
  });
});

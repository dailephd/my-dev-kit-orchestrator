import {
  TEST_STRATEGY_SOURCE_REQUIREMENTS,
  findTestStrategySourceRequirement,
  parseTestResponsibilityBlocks,
  computeCriticalResponsibilitySummary,
  allCriticalResponsibilitiesFullyMapped,
} from '../src/instructions/testResponsibilityCriticality';

const VALID_BLOCK = `
test responsibility ID: TST-001
criticality: critical
traces to: BehaviorModel invariant #1
setup: create a run
action or trigger: call foo()
expected result: returns bar
test level: unit

test responsibility ID: TST-002
criticality: noncritical
traces to: boundary case
setup: n/a
action or trigger: call baz()
expected result: returns qux
test level: integration
`;

describe('TEST_STRATEGY_SOURCE_REQUIREMENTS', () => {
  it('covers exactly the six applicable modes with exact stage IDs', () => {
    const modes = TEST_STRATEGY_SOURCE_REQUIREMENTS.map((r) => r.mode).sort();
    expect(modes).toEqual(['extraction', 'feature', 'harden', 'refactor', 'repair', 'test'].sort());
  });

  it('uses the exact mode-specific strategy stage IDs, not a name-only fallback', () => {
    expect(findTestStrategySourceRequirement('repair')?.strategyStageId).toBe('stage.repair.regression-test-strategy');
    expect(findTestStrategySourceRequirement('refactor')?.strategyStageId).toBe('stage.refactor.compatibility-test-strategy');
    expect(findTestStrategySourceRequirement('harden')?.strategyStageId).toBe('stage.harden.resilience-test-strategy');
    expect(findTestStrategySourceRequirement('feature')?.strategyStageId).toBe('stage.feature.test-strategy');
    expect(findTestStrategySourceRequirement('test')?.strategyStageId).toBe('stage.test.test-strategy');
    expect(findTestStrategySourceRequirement('extraction')?.strategyStageId).toBe('stage.extraction.test-strategy');
  });

  it('every requirement points to the exact downstream test-implementation stage for its mode', () => {
    for (const req of TEST_STRATEGY_SOURCE_REQUIREMENTS) {
      expect(req.testImplementationStageId).toBe(`stage.${req.mode}.test-implementation`);
    }
  });
});

describe('parseTestResponsibilityBlocks', () => {
  it('parses valid IDs, criticality, and all required fields', () => {
    const result = parseTestResponsibilityBlocks(VALID_BLOCK);
    expect(result.issues).toEqual([]);
    expect(result.responsibilities).toHaveLength(2);
    expect(result.responsibilities[0]).toMatchObject({ responsibilityId: 'TST-001', criticality: 'critical' });
    expect(result.responsibilities[1]).toMatchObject({ responsibilityId: 'TST-002', criticality: 'noncritical' });
  });

  it('reports no responsibilities for empty input', () => {
    const result = parseTestResponsibilityBlocks('');
    expect(result.responsibilities).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it('reports missing criticality', () => {
    const text = `
test responsibility ID: TST-003
traces to: x
setup: x
action or trigger: x
expected result: x
test level: unit
`;
    const result = parseTestResponsibilityBlocks(text);
    expect(result.issues.map((i) => i.code)).toContain('CONTEXT_TEST_RESPONSIBILITY_CRITICALITY_MISSING');
  });

  it('reports invalid criticality', () => {
    const text = `
test responsibility ID: TST-004
criticality: maybe
traces to: x
setup: x
action or trigger: x
expected result: x
test level: unit
`;
    const result = parseTestResponsibilityBlocks(text);
    expect(result.issues.map((i) => i.code)).toContain('CONTEXT_TEST_RESPONSIBILITY_CRITICALITY_INVALID');
  });

  it('reports duplicate responsibility IDs', () => {
    const text = VALID_BLOCK + `\ntest responsibility ID: TST-001\ncriticality: critical\ntraces to: dup\nsetup: x\naction or trigger: x\nexpected result: x\ntest level: unit\n`;
    const result = parseTestResponsibilityBlocks(text);
    expect(result.duplicateResponsibilityIds).toEqual(['TST-001']);
    expect(result.issues.map((i) => i.code)).toContain('CONTEXT_TEST_RESPONSIBILITY_DUPLICATE');
  });

  it('preserves deterministic responsibility ordering', () => {
    const result1 = parseTestResponsibilityBlocks(VALID_BLOCK);
    const result2 = parseTestResponsibilityBlocks(VALID_BLOCK);
    expect(result1.responsibilities.map((r) => r.responsibilityId)).toEqual(result2.responsibilities.map((r) => r.responsibilityId));
    expect(result1.responsibilities.map((r) => r.responsibilityId)).toEqual(['TST-001', 'TST-002']);
  });
});

describe('computeCriticalResponsibilitySummary + allCriticalResponsibilitiesFullyMapped', () => {
  it('reports all critical mappings mapped', () => {
    const parsed = parseTestResponsibilityBlocks(VALID_BLOCK);
    const summary = computeCriticalResponsibilitySummary(parsed, [
      { responsibilityId: 'TST-001', mappingStatus: 'mapped' },
      { responsibilityId: 'TST-002', mappingStatus: 'mapped' },
    ]);
    expect(summary.criticalResponsibilities).toBe(1);
    expect(summary.criticalMapped).toBe(1);
    expect(allCriticalResponsibilitiesFullyMapped(summary)).toBe(true);
  });

  it('blocks when a critical mapping is absent', () => {
    const parsed = parseTestResponsibilityBlocks(VALID_BLOCK);
    const summary = computeCriticalResponsibilitySummary(parsed, [{ responsibilityId: 'TST-002', mappingStatus: 'mapped' }]);
    expect(summary.criticalMissing).toBe(1);
    expect(allCriticalResponsibilitiesFullyMapped(summary)).toBe(false);
    expect(summary.unmappedCriticalIds).toContain('TST-001');
  });

  it('blocks when a critical mapping is partially-mapped', () => {
    const parsed = parseTestResponsibilityBlocks(VALID_BLOCK);
    const summary = computeCriticalResponsibilitySummary(parsed, [{ responsibilityId: 'TST-001', mappingStatus: 'partially-mapped' }]);
    expect(summary.criticalPartiallyMapped).toBe(1);
    expect(allCriticalResponsibilitiesFullyMapped(summary)).toBe(false);
  });

  it('blocks when a critical mapping is unmapped or not-applicable', () => {
    const parsed = parseTestResponsibilityBlocks(VALID_BLOCK);
    const unmapped = computeCriticalResponsibilitySummary(parsed, [{ responsibilityId: 'TST-001', mappingStatus: 'unmapped' }]);
    expect(unmapped.criticalUnmapped).toBe(1);
    const notApplicable = computeCriticalResponsibilitySummary(parsed, [{ responsibilityId: 'TST-001', mappingStatus: 'not-applicable' }]);
    expect(notApplicable.criticalUnmapped).toBe(1);
  });

  it('treats noncritical partial/unmapped/missing as warnings only, not blocking', () => {
    const parsed = parseTestResponsibilityBlocks(VALID_BLOCK);
    const summary = computeCriticalResponsibilitySummary(parsed, [{ responsibilityId: 'TST-001', mappingStatus: 'mapped' }]);
    expect(summary.noncriticalMappingWarnings.length).toBeGreaterThan(0);
    expect(allCriticalResponsibilitiesFullyMapped(summary)).toBe(true);
  });

  it('is vacuously fully-mapped when there are no critical responsibilities', () => {
    const parsed = parseTestResponsibilityBlocks(`
test responsibility ID: TST-005
criticality: noncritical
traces to: x
setup: x
action or trigger: x
expected result: x
test level: unit
`);
    const summary = computeCriticalResponsibilitySummary(parsed, []);
    expect(summary.criticalResponsibilities).toBe(0);
    expect(allCriticalResponsibilitiesFullyMapped(summary)).toBe(true);
  });

  it('tracks duplicate IDs and unknown-criticality IDs from the parse result', () => {
    const dupText = VALID_BLOCK + `\ntest responsibility ID: TST-001\ncriticality: critical\ntraces to: dup\nsetup: x\naction or trigger: x\nexpected result: x\ntest level: unit\n`;
    const parsed = parseTestResponsibilityBlocks(dupText);
    const summary = computeCriticalResponsibilitySummary(parsed, []);
    expect(summary.duplicateResponsibilityIds).toEqual(['TST-001']);
  });
});

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

const CURRENT_BATCH4_RESPONSIBILITY_IDS = Array.from(
  { length: 21 },
  (_, index) => `TST-${String(index + 1).padStart(3, '0')}`,
);
const CURRENT_BATCH4_CRITICAL_IDS = CURRENT_BATCH4_RESPONSIBILITY_IDS.filter((id) => id !== 'TST-018');

function responsibilityBlock(id: string, criticality = 'critical'): string {
  return `
### Responsibility ${id}
test responsibility ID: ${id}
criticality: ${criticality}
traces to: behavior and failure-mode contract for ${id}
setup: create the required fixture
action or trigger: evaluate the readiness boundary
expected result: the declared invariant remains protected
test level: integration
`;
}

const CURRENT_BATCH4_STRATEGY_SHAPE = [
  'Artifact: ResilienceTestStrategy',
  '',
  ...CURRENT_BATCH4_RESPONSIBILITY_IDS.flatMap((id) =>
    responsibilityBlock(id, id === 'TST-018' ? 'noncritical' : 'critical').trim().split('\n').concat(''),
  ),
  '## Assumptions tested',
  '',
  '- A-01 through A-12 are covered by the responsibilities above.',
  '',
  '## Coverage gaps',
  '',
  '- No unsupported coverage claim is introduced.',
  '',
  '## Remaining risks',
  '',
  '- Rendered review remains a manual acceptance step.',
  '',
  '## Required verification commands',
  '',
  '- npm run typecheck',
  '- npm test -- --runInBand',
  '',
  '## Downstream use',
  '',
  '- Test implementation consumes string responsibility IDs only.',
  '',
  'Status: complete',
].join('\n');

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

  it('ignores the real packet preamble and trailer while extracting all 21 responsibilities and exactly 20 critical IDs', () => {
    const result = parseTestResponsibilityBlocks(CURRENT_BATCH4_STRATEGY_SHAPE);
    expect(result.issues).toEqual([]);
    expect(result.responsibilities.map((responsibility) => responsibility.responsibilityId)).toEqual(
      CURRENT_BATCH4_RESPONSIBILITY_IDS,
    );
    expect(
      result.responsibilities
        .filter((responsibility) => responsibility.criticality === 'critical')
        .map((responsibility) => responsibility.responsibilityId),
    ).toEqual(CURRENT_BATCH4_CRITICAL_IDS);
  });

  it.each([
    ['coverage-gap section', 'Coverage gaps:\n- one known gap remains documented'],
    ['risk section', 'Remaining risks:\n- rendering needs manual inspection'],
    ['required verification commands', 'Required verification commands:\n- npm run typecheck\n- npm test'],
    ['downstream-use section', 'Downstream use:\n- pass string IDs to the producer'],
    ['status section', 'Status: complete'],
  ])('does not classify a %s as a responsibility', (_label, trailer) => {
    const result = parseTestResponsibilityBlocks(`${VALID_BLOCK}\n${trailer}\n`);
    expect(result.issues).toEqual([]);
    expect(result.responsibilities.map((responsibility) => responsibility.responsibilityId)).toEqual([
      'TST-001',
      'TST-002',
    ]);
  });

  it('reports a structurally real responsibility entry whose ID is missing', () => {
    const text = `
## Responsibility with an accidentally omitted ID
criticality: critical
traces to: invariant A-01
setup: create a run
action or trigger: evaluate readiness
expected result: refresh is required
test level: unit
`;
    const result = parseTestResponsibilityBlocks(text);
    expect(result.responsibilities).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).toEqual(['CONTEXT_TEST_RESPONSIBILITY_ID_MISSING']);
  });

  it('reports an exact legacy Test responsibilities list without IDs', () => {
    const result = parseTestResponsibilityBlocks([
      'Artifact: TestStrategyPacket',
      'Workflow mode: feature',
      '',
      'Test responsibilities:',
      '- Verify the login form validates empty fields.',
      '- Verify the logout button clears the session.',
      '',
      'Status: complete',
    ].join('\n'));

    expect(result.responsibilities).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).toEqual(['CONTEXT_TEST_RESPONSIBILITY_ID_MISSING']);
  });

  it('reports malformed responsibility IDs without suppressing the responsibility record', () => {
    const result = parseTestResponsibilityBlocks(VALID_BLOCK.replace('TST-001', 'TST 001'));
    expect(result.responsibilities[0]?.responsibilityId).toBe('TST 001');
    expect(result.issues.map((issue) => issue.code)).toContain('CONTEXT_TEST_RESPONSIBILITY_ID_INVALID');
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

  it('supports multiline entries beneath different Markdown heading depths', () => {
    const text = `
# Primary responsibility
test responsibility ID: TST-101
criticality: critical
traces to: invariant one
  and invariant two
setup: create a run
  with populated evidence
action or trigger: evaluate readiness
expected result: readiness is deterministic
test level: unit

#### Secondary responsibility
test responsibility ID: TST-102
criticality: noncritical
traces to: editorial freedom
setup: update prose
action or trigger: validate documentation
expected result: semantic structure remains valid
test level: integration
`;
    const result = parseTestResponsibilityBlocks(text);
    expect(result.issues).toEqual([]);
    expect(result.responsibilities.map((responsibility) => responsibility.responsibilityId)).toEqual([
      'TST-101',
      'TST-102',
    ]);
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

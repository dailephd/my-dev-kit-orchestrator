import { buildInstructionCatalog } from '../src/instructions/catalog';
import { validateCatalog } from '../src/instructions/catalogValidation';
import { InstructionCatalog } from '../src/instructions/catalogTypes';

function clone(catalog: InstructionCatalog): InstructionCatalog {
  return JSON.parse(JSON.stringify(catalog));
}

describe('valid catalog', () => {
  it('the constructed catalog passes validation with no issues', () => {
    const result = validateCatalog(buildInstructionCatalog());
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('validation failure table', () => {
  it('duplicate ID (same kind) fails', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.stages[1].id = catalog.stages[0].id;
    const result = validateCatalog(catalog);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'CATALOG_DUPLICATE_ID')).toBe(true);
  });

  it('duplicate ID across different entry kinds fails', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.commands[0].id = catalog.rules[0].id as unknown as typeof catalog.commands[0]['id'];
    const result = validateCatalog(catalog);
    expect(result.issues.some((i) => i.code === 'CATALOG_DUPLICATE_ID')).toBe(true);
  });

  it('missing command reference fails', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.stages[0].commandRefs = ['command.unknown.does-not-exist' as never];
    const result = validateCatalog(catalog);
    expect(
      result.issues.some((i) => i.code === 'CATALOG_MISSING_REFERENCE' && i.relationship === 'commandRefs'),
    ).toBe(true);
  });

  it('missing rule reference fails', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.stages[0].ruleRefs = ['rule.unknown.does-not-exist' as never];
    const result = validateCatalog(catalog);
    expect(result.issues.some((i) => i.code === 'CATALOG_MISSING_REFERENCE' && i.relationship === 'ruleRefs')).toBe(
      true,
    );
  });

  it('missing stage reference (workflow.stageRefs) fails', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.workflows[0].stageRefs.push('stage.unknown.does-not-exist' as never);
    const result = validateCatalog(catalog);
    expect(
      result.issues.some((i) => i.code === 'CATALOG_MISSING_REFERENCE' && i.relationship === 'stageRefs'),
    ).toBe(true);
  });

  it('missing workflow reference (stage.workflowRef) fails', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.stages[0].workflowRef = 'workflow.unknown' as never;
    const result = validateCatalog(catalog);
    expect(
      result.issues.some((i) => i.code === 'CATALOG_MISSING_REFERENCE' && i.relationship === 'workflowRef'),
    ).toBe(true);
  });

  it('missing report contract fails', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.stages[0].reportContractRef = 'report.unknown-contract' as never;
    const result = validateCatalog(catalog);
    expect(result.issues.some((i) => i.code === 'CATALOG_MISSING_REFERENCE')).toBe(true);
  });

  it('commandRef pointing to a rule fails with invalid reference type', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.stages[0].commandRefs = [catalog.rules[0].id as unknown as typeof catalog.stages[0]['commandRefs'][0]];
    const result = validateCatalog(catalog);
    expect(result.issues.some((i) => i.code === 'CATALOG_INVALID_REFERENCE_TYPE')).toBe(true);
  });

  it('ruleRef pointing to a command fails with invalid reference type', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.stages[0].ruleRefs = [catalog.commands[0].id as unknown as typeof catalog.stages[0]['ruleRefs'][0]];
    const result = validateCatalog(catalog);
    expect(result.issues.some((i) => i.code === 'CATALOG_INVALID_REFERENCE_TYPE')).toBe(true);
  });

  it('reportContractRef pointing to a workflow fails with invalid reference type', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.stages[0].reportContractRef = catalog.workflows[0].id as unknown as typeof catalog.stages[0]['reportContractRef'];
    const result = validateCatalog(catalog);
    expect(result.issues.some((i) => i.code === 'CATALOG_INVALID_REFERENCE_TYPE')).toBe(true);
  });

  it('workflow stageRef pointing to a command fails with invalid reference type', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.workflows[0].stageRefs[0] = catalog.commands[0].id as unknown as typeof catalog.workflows[0]['stageRefs'][0];
    const result = validateCatalog(catalog);
    expect(result.issues.some((i) => i.code === 'CATALOG_INVALID_REFERENCE_TYPE')).toBe(true);
  });

  it('stage mode mismatch fails (stage.workflowRef does not list the stage)', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.stages[0].workflowRef = catalog.workflows[1].id;
    const result = validateCatalog(catalog);
    expect(result.issues.some((i) => i.code === 'CATALOG_STAGE_MODE_MISMATCH')).toBe(true);
  });

  it('orphan stage binding fails (catalog stage with no runtime counterpart)', () => {
    const catalog = clone(buildInstructionCatalog());
    const extraStage = {
      ...catalog.stages[0],
      id: 'stage.feature.not-a-real-stage',
      stageName: 'not-a-real-stage',
    };
    catalog.stages.push(extraStage as typeof catalog.stages[0]);
    catalog.workflows[0].stageRefs.push(extraStage.id as never);
    const result = validateCatalog(catalog);
    expect(result.issues.some((i) => i.code === 'CATALOG_ORPHAN_STAGE_BINDING')).toBe(true);
  });

  it('missing stage binding fails (runtime stage absent from catalog)', () => {
    const catalog = clone(buildInstructionCatalog());
    const removedId = catalog.workflows[0].stageRefs.pop();
    catalog.stages = catalog.stages.filter((s) => s.id !== removedId);
    const result = validateCatalog(catalog);
    expect(
      result.issues.some(
        (i) => i.code === 'CATALOG_MISSING_STAGE_BINDING' || i.code === 'CATALOG_UNKNOWN_STAGE',
      ),
    ).toBe(true);
  });
});

describe('rule dependency cycles', () => {
  it('an acyclic rule graph passes', () => {
    const result = validateCatalog(buildInstructionCatalog());
    expect(result.issues.some((i) => i.code === 'CATALOG_REFERENCE_CYCLE')).toBe(false);
  });

  it('a self-referencing rule fails', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.rules[0].ruleRefs = [catalog.rules[0].id];
    const result = validateCatalog(catalog);
    const cycleIssues = result.issues.filter((i) => i.code === 'CATALOG_REFERENCE_CYCLE');
    expect(cycleIssues.length).toBeGreaterThan(0);
  });

  it('a direct two-rule cycle fails', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.rules[0].ruleRefs = [catalog.rules[1].id];
    catalog.rules[1].ruleRefs = [catalog.rules[0].id];
    const result = validateCatalog(catalog);
    const cycleIssues = result.issues.filter((i) => i.code === 'CATALOG_REFERENCE_CYCLE');
    expect(cycleIssues.length).toBeGreaterThan(0);
  });

  it('an indirect multi-rule cycle fails', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.rules[0].ruleRefs = [catalog.rules[1].id];
    catalog.rules[1].ruleRefs = [catalog.rules[2].id];
    catalog.rules[2].ruleRefs = [catalog.rules[0].id];
    const result = validateCatalog(catalog);
    const cycleIssues = result.issues.filter((i) => i.code === 'CATALOG_REFERENCE_CYCLE');
    expect(cycleIssues.length).toBeGreaterThan(0);
  });

  it('cycle detection result is deterministic across repeated runs', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.rules[0].ruleRefs = [catalog.rules[1].id];
    catalog.rules[1].ruleRefs = [catalog.rules[0].id];
    const first = validateCatalog(clone(catalog)).issues.filter((i) => i.code === 'CATALOG_REFERENCE_CYCLE');
    const second = validateCatalog(clone(catalog)).issues.filter((i) => i.code === 'CATALOG_REFERENCE_CYCLE');
    expect(first).toEqual(second);
  });

  it('cycle result includes the affected rule IDs', () => {
    const catalog = clone(buildInstructionCatalog());
    const ruleAId = catalog.rules[0].id;
    const ruleBId = catalog.rules[1].id;
    catalog.rules[0].ruleRefs = [ruleBId];
    catalog.rules[1].ruleRefs = [ruleAId];
    const result = validateCatalog(catalog);
    const cycleIssue = result.issues.find((i) => i.code === 'CATALOG_REFERENCE_CYCLE');
    expect(cycleIssue).toBeDefined();
    expect(cycleIssue!.message).toEqual(expect.stringContaining(ruleAId));
    expect(cycleIssue!.message).toEqual(expect.stringContaining(ruleBId));
  });
});

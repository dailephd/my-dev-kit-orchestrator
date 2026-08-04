import { buildInstructionCatalog } from '../src/instructions/catalog';
import { validateCatalog } from '../src/instructions/catalogValidation';
import { getAllWorkflows } from '../src/workflows';

describe('stage instruction completeness (Batch 3)', () => {
  const catalog = buildInstructionCatalog();

  it('has 7 workflows and 79 stage entries', () => {
    expect(catalog.workflows).toHaveLength(7);
    expect(catalog.stages).toHaveLength(79);
  });

  it('every stage has non-empty task instructions', () => {
    for (const stage of catalog.stages) {
      expect(stage.taskInstructions.trim().length).toBeGreaterThan(0);
    }
  });

  it('every stage has at least one non-empty validation requirement', () => {
    for (const stage of catalog.stages) {
      expect(stage.validationRequirements.length).toBeGreaterThan(0);
      for (const req of stage.validationRequirements) expect(req.trim().length).toBeGreaterThan(0);
    }
  });

  it('every stage has at least one non-empty stop condition', () => {
    for (const stage of catalog.stages) {
      expect(stage.stopConditions.length).toBeGreaterThan(0);
      for (const cond of stage.stopConditions) expect(cond.trim().length).toBeGreaterThan(0);
    }
  });

  it('no stage contains a TODO/TBD/placeholder marker', () => {
    const placeholderRe = /\b(todo|tbd|placeholder|same as before)\b/i;
    for (const stage of catalog.stages) {
      expect(stage.taskInstructions).not.toMatch(placeholderRe);
      for (const req of stage.validationRequirements) expect(req).not.toMatch(placeholderRe);
      for (const cond of stage.stopConditions) expect(cond).not.toMatch(placeholderRe);
    }
  });

  it('no stage has duplicate strings within its own validation requirements or stop conditions', () => {
    for (const stage of catalog.stages) {
      const vr = stage.validationRequirements.map((s) => s.trim().toLowerCase());
      const sc = stage.stopConditions.map((s) => s.trim().toLowerCase());
      expect(new Set(vr).size).toBe(vr.length);
      expect(new Set(sc).size).toBe(sc.length);
    }
  });

  it('exact stage IDs remain unique across the catalog', () => {
    const ids = catalog.stages.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('repeated stage names across modes remain mode-specific (distinct content or explicitly shared by design)', () => {
    const implementationStages = catalog.stages.filter((s) => s.stageName === 'implementation');
    expect(implementationStages.length).toBe(5); // feature, repair, refactor, harden, extraction
    const ids = implementationStages.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the full catalog passes validation with no completeness issues', () => {
    const result = validateCatalog(catalog);
    const completenessCodes = new Set([
      'CATALOG_MISSING_TASK_INSTRUCTIONS',
      'CATALOG_MISSING_VALIDATION_REQUIREMENTS',
      'CATALOG_MISSING_STOP_CONDITIONS',
      'CATALOG_DUPLICATE_TASK_INSTRUCTION',
      'CATALOG_DUPLICATE_VALIDATION_REQUIREMENT',
      'CATALOG_DUPLICATE_STOP_CONDITION',
    ]);
    const completenessIssues = result.issues.filter((i) => completenessCodes.has(i.code));
    expect(completenessIssues).toEqual([]);
  });

  it('every runtime stage has a catalog counterpart with real content', () => {
    for (const wf of getAllWorkflows()) {
      for (const stage of wf.stages) {
        const entry = catalog.stages.find((s) => s.id === `stage.${wf.mode}.${stage.name}`);
        expect(entry).toBeDefined();
        expect(entry!.taskInstructions.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('catalog validation failure cases for completeness rules', () => {
  it('missing task instructions fails', () => {
    const catalog = JSON.parse(JSON.stringify(buildInstructionCatalog()));
    catalog.stages[0].taskInstructions = '';
    const result = validateCatalog(catalog);
    expect(result.issues.some((i: { code: string }) => i.code === 'CATALOG_MISSING_TASK_INSTRUCTIONS')).toBe(true);
  });

  it('missing validation requirements fails', () => {
    const catalog = JSON.parse(JSON.stringify(buildInstructionCatalog()));
    catalog.stages[0].validationRequirements = [];
    const result = validateCatalog(catalog);
    expect(result.issues.some((i: { code: string }) => i.code === 'CATALOG_MISSING_VALIDATION_REQUIREMENTS')).toBe(
      true,
    );
  });

  it('missing stop conditions fails', () => {
    const catalog = JSON.parse(JSON.stringify(buildInstructionCatalog()));
    catalog.stages[0].stopConditions = [];
    const result = validateCatalog(catalog);
    expect(result.issues.some((i: { code: string }) => i.code === 'CATALOG_MISSING_STOP_CONDITIONS')).toBe(true);
  });

  it('duplicate task instruction line fails', () => {
    const catalog = JSON.parse(JSON.stringify(buildInstructionCatalog()));
    catalog.stages[0].taskInstructions = 'Do the thing.\nDo the thing.';
    const result = validateCatalog(catalog);
    expect(result.issues.some((i: { code: string }) => i.code === 'CATALOG_DUPLICATE_TASK_INSTRUCTION')).toBe(true);
  });

  it('duplicate validation requirement fails', () => {
    const catalog = JSON.parse(JSON.stringify(buildInstructionCatalog()));
    catalog.stages[0].validationRequirements = ['same requirement', 'Same Requirement'];
    const result = validateCatalog(catalog);
    expect(
      result.issues.some((i: { code: string }) => i.code === 'CATALOG_DUPLICATE_VALIDATION_REQUIREMENT'),
    ).toBe(true);
  });

  it('duplicate stop condition fails', () => {
    const catalog = JSON.parse(JSON.stringify(buildInstructionCatalog()));
    catalog.stages[0].stopConditions = ['do not do X', 'do not do X'];
    const result = validateCatalog(catalog);
    expect(result.issues.some((i: { code: string }) => i.code === 'CATALOG_DUPLICATE_STOP_CONDITION')).toBe(true);
  });

  it('existing Batch 1 validation cases still pass alongside the new completeness checks', () => {
    const result = validateCatalog(buildInstructionCatalog());
    expect(result.valid).toBe(true);
  });
});

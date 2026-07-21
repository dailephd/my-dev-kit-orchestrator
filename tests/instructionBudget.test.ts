import { buildInstructionCatalog } from '../src/instructions/catalog';
import { resolveStage } from '../src/instructions/catalogResolver';
import { validateBudgetLimits, accountForBudget, measureEntryCharacters } from '../src/instructions/instructionBudget';
import { InstructionBudgetLimits, StageResolutionResult } from '../src/instructions/catalogTypes';

const UNLIMITED: InstructionBudgetLimits = {
  maxCommands: null,
  maxRules: null,
  maxRuleDepth: null,
  maxEntryCharacters: null,
  maxTotalCharacters: null,
};

function verificationResolution(): StageResolutionResult {
  const catalog = buildInstructionCatalog();
  const result = resolveStage(catalog, 'stage.feature.verification');
  if (!result.ok) throw new Error('expected stage.feature.verification to resolve');
  return result.result;
}

describe('budget limit validation', () => {
  it('accepts all-unlimited limits', () => {
    const result = validateBudgetLimits(UNLIMITED);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('accepts valid bounded limits', () => {
    const result = validateBudgetLimits({
      maxCommands: 10,
      maxRules: 20,
      maxRuleDepth: 5,
      maxEntryCharacters: 5000,
      maxTotalCharacters: 50000,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects negative limits', () => {
    const result = validateBudgetLimits({ ...UNLIMITED, maxCommands: -1 });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.limitName === 'maxCommands')).toBe(true);
  });

  it('rejects fractional limits', () => {
    const result = validateBudgetLimits({ ...UNLIMITED, maxRules: 2.5 });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.limitName === 'maxRules')).toBe(true);
  });

  it('rejects non-finite limits', () => {
    const result = validateBudgetLimits({ ...UNLIMITED, maxTotalCharacters: Infinity });
    expect(result.valid).toBe(false);
  });
});

describe('budget accounting', () => {
  it('reports a command-count overflow', () => {
    const resolution = verificationResolution();
    const accounting = accountForBudget(resolution, { ...UNLIMITED, maxCommands: 0 });
    const finding = accounting.findings.find((f) => f.limitName === 'maxCommands')!;
    expect(finding.overLimit).toBe(true);
    expect(finding.affectedEntryIds.length).toBeGreaterThan(0);
    expect(accounting.adequate).toBe(false);
  });

  it('reports a rule-count overflow', () => {
    const resolution = verificationResolution();
    const accounting = accountForBudget(resolution, { ...UNLIMITED, maxRules: 0 });
    const finding = accounting.findings.find((f) => f.limitName === 'maxRules')!;
    expect(finding.overLimit).toBe(true);
    expect(finding.affectedEntryIds.length).toBeGreaterThan(0);
  });

  it('reports a rule-depth overflow when transitive rules exist', () => {
    const resolution = verificationResolution();
    const accounting = accountForBudget(resolution, { ...UNLIMITED, maxRuleDepth: 0 });
    const finding = accounting.findings.find((f) => f.limitName === 'maxRuleDepth')!;
    expect(finding.used).toBeGreaterThan(0);
    expect(finding.overLimit).toBe(true);
  });

  it('reports a per-entry character overflow', () => {
    const resolution = verificationResolution();
    const accounting = accountForBudget(resolution, { ...UNLIMITED, maxEntryCharacters: 1 });
    const finding = accounting.findings.find((f) => f.limitName === 'maxEntryCharacters')!;
    expect(finding.overLimit).toBe(true);
    expect(finding.affectedEntryIds.length).toBeGreaterThan(0);
  });

  it('reports a total-character overflow', () => {
    const resolution = verificationResolution();
    const accounting = accountForBudget(resolution, { ...UNLIMITED, maxTotalCharacters: 1 });
    const finding = accounting.findings.find((f) => f.limitName === 'maxTotalCharacters')!;
    expect(finding.overLimit).toBe(true);
    expect(accounting.overLimit).toBe(true);
    expect(accounting.adequate).toBe(false);
  });

  it('never silently drops required content when over budget', () => {
    const resolution = verificationResolution();
    const tightAccounting = accountForBudget(resolution, { ...UNLIMITED, maxTotalCharacters: 1 });
    const unlimitedAccounting = accountForBudget(resolution, UNLIMITED);
    expect(Object.keys(tightAccounting.perEntryCharacters)).toEqual(
      Object.keys(unlimitedAccounting.perEntryCharacters),
    );
    expect(tightAccounting.totalCharacters).toBe(unlimitedAccounting.totalCharacters);
  });

  it('a passing budget is adequate with no over-limit findings', () => {
    const resolution = verificationResolution();
    const accounting = accountForBudget(resolution, UNLIMITED);
    expect(accounting.adequate).toBe(true);
    expect(accounting.overLimit).toBe(false);
    expect(accounting.findings.every((f) => !f.overLimit)).toBe(true);
  });

  it('accounting order is deterministic across repeated runs', () => {
    const resolution = verificationResolution();
    const first = accountForBudget(resolution, { ...UNLIMITED, maxTotalCharacters: 1 });
    const second = accountForBudget(resolution, { ...UNLIMITED, maxTotalCharacters: 1 });
    expect(first).toEqual(second);
  });

  it('character measurement is stable for identical entries', () => {
    const resolution = verificationResolution();
    const first = measureEntryCharacters(resolution.stage);
    const second = measureEntryCharacters(resolution.stage);
    expect(first).toBe(second);
    expect(first).toBeGreaterThan(0);
  });

  it('character measurement is independent of object key order', () => {
    const a = { id: 'x', kind: 'command' as const, title: 't', description: 'd' };
    const b = { description: 'd', kind: 'command' as const, id: 'x', title: 't' };
    expect(measureEntryCharacters(a as never)).toBe(measureEntryCharacters(b as never));
  });
});

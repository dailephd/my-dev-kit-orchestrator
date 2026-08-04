import { buildInstructionCatalog } from '../src/instructions/catalog';
import { assembleWorkflowInstructionPacket } from '../src/instructions/workflowInstructionPacket';
import { InstructionBudgetLimits, InstructionCatalog } from '../src/instructions/catalogTypes';

const UNLIMITED: InstructionBudgetLimits = {
  maxCommands: null,
  maxRules: null,
  maxRuleDepth: null,
  maxEntryCharacters: null,
  maxTotalCharacters: null,
};

function catalogWithOptionalCommand(): InstructionCatalog {
  const catalog = JSON.parse(JSON.stringify(buildInstructionCatalog())) as InstructionCatalog;
  const stage = catalog.stages.find((s) => s.id === 'stage.feature.implementation')!;
  stage.optionalCommandRefs = ['command.my-dev-kit.index' as never];
  return catalog;
}

function catalogWithOptionalRuleChain(): InstructionCatalog {
  const catalog = JSON.parse(JSON.stringify(buildInstructionCatalog())) as InstructionCatalog;
  catalog.rules.push({
    id: 'rule.optional-test.leaf' as never,
    kind: 'rule',
    title: 'leaf',
    description: 'test leaf rule',
    category: 'optional-test',
    instruction: 'A leaf rule required by the optional root.',
    ruleRefs: [],
  });
  catalog.rules.push({
    id: 'rule.optional-test.root' as never,
    kind: 'rule',
    title: 'root',
    description: 'test root rule',
    category: 'optional-test',
    instruction: 'An optional root rule with one required dependency.',
    ruleRefs: ['rule.optional-test.leaf' as never],
  });
  const stage = catalog.stages.find((s) => s.id === 'stage.feature.implementation')!;
  stage.optionalRuleRefs = ['rule.optional-test.root' as never];
  return catalog;
}

describe('required-content budget behavior', () => {
  it('required content fitting limits produces an adequate packet', () => {
    const result = assembleWorkflowInstructionPacket({
      catalog: buildInstructionCatalog(),
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
      limits: UNLIMITED,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.packet.adequacy.status).toBe('adequate');
  });

  it('required rule-count overflow retains all required rules and marks the packet inadequate', () => {
    const result = assembleWorkflowInstructionPacket({
      catalog: buildInstructionCatalog(),
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
      limits: { ...UNLIMITED, maxRules: 0 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packet.resolvedRules.length).toBeGreaterThan(0);
      expect(result.packet.adequacy.status).toBe('inadequate');
      expect(result.packet.adequacy.requiredContentComplete).toBe(true);
      expect(result.packet.adequacy.requiredBudgetSatisfied).toBe(false);
    }
  });

  it('required per-entry character overflow retains the entry and reports affected IDs', () => {
    const result = assembleWorkflowInstructionPacket({
      catalog: buildInstructionCatalog(),
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
      limits: { ...UNLIMITED, maxEntryCharacters: 1 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packet.primaryEntry.id).toBe('stage.feature.implementation');
      expect(result.packet.adequacy.status).toBe('inadequate');
      expect(result.packet.adequacy.affectedEntryIds.length).toBeGreaterThan(0);
    }
  });

  it('required total-character overflow retains all required content and marks inadequate', () => {
    const result = assembleWorkflowInstructionPacket({
      catalog: buildInstructionCatalog(),
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
      limits: { ...UNLIMITED, maxTotalCharacters: 1 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packet.resolvedRules.length).toBeGreaterThan(0);
      expect(result.packet.reportContract).toBeDefined();
      expect(result.packet.adequacy.status).toBe('inadequate');
    }
  });

  it('required overflow never becomes optional truncation', () => {
    const result = assembleWorkflowInstructionPacket({
      catalog: buildInstructionCatalog(),
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
      limits: { ...UNLIMITED, maxRules: 0 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packet.truncation.truncated).toBe(false);
      expect(result.packet.truncation.droppedOptionalRuleIds).toEqual([]);
    }
  });
});

describe('optional-content budget behavior', () => {
  it('an optional command is included when it fits', () => {
    const result = assembleWorkflowInstructionPacket({
      catalog: catalogWithOptionalCommand(),
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
      limits: UNLIMITED,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packet.resolvedCommands.map((c) => c.id)).toContain('command.my-dev-kit.index');
      expect(result.packet.resolvedCommands.find((c) => c.id === 'command.my-dev-kit.index')?.included).toBe(
        'optional',
      );
      expect(result.packet.adequacy.optionalContentDropped).toBe(false);
    }
  });

  it('an optional command is omitted when it exceeds maxCommands', () => {
    const result = assembleWorkflowInstructionPacket({
      catalog: catalogWithOptionalCommand(),
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
      limits: { ...UNLIMITED, maxCommands: 0 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packet.resolvedCommands).toEqual([]);
      expect(result.packet.truncation.truncated).toBe(true);
      expect(result.packet.truncation.droppedOptionalCommandIds).toEqual(['command.my-dev-kit.index']);
      expect(result.packet.adequacy.optionalContentDropped).toBe(true);
      expect(result.packet.adequacy.requiredContentComplete).toBe(true);
    }
  });

  it('an optional rule is included when its complete closure fits', () => {
    const result = assembleWorkflowInstructionPacket({
      catalog: catalogWithOptionalRuleChain(),
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
      limits: UNLIMITED,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ids = result.packet.resolvedRules.map((r) => r.id);
      expect(ids).toEqual(expect.arrayContaining(['rule.optional-test.root', 'rule.optional-test.leaf']));
    }
  });

  it('the complete optional rule closure is omitted (not partially included) when it does not fit', () => {
    const catalog = catalogWithOptionalRuleChain();
    const baseline = assembleWorkflowInstructionPacket({
      catalog: buildInstructionCatalog(),
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
      limits: UNLIMITED,
    });
    expect(baseline.ok).toBe(true);
    const requiredRuleCount = baseline.ok ? baseline.packet.resolvedRules.length : 0;

    const result = assembleWorkflowInstructionPacket({
      catalog,
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
      limits: { ...UNLIMITED, maxRules: requiredRuleCount },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ids = result.packet.resolvedRules.map((r) => r.id);
      expect(ids).not.toContain('rule.optional-test.root');
      expect(ids).not.toContain('rule.optional-test.leaf');
      expect(result.packet.truncation.droppedOptionalRuleIds).toContain('rule.optional-test.root');
      expect(result.packet.truncation.droppedOptionalDependencyIds).toContain('rule.optional-test.leaf');
    }
  });

  it('optional omissions are deterministic', () => {
    const catalog = catalogWithOptionalCommand();
    const limits = { ...UNLIMITED, maxCommands: 0 };
    const first = assembleWorkflowInstructionPacket({ catalog, workflowId: 'workflow.feature', stageId: 'stage.feature.implementation', limits });
    const second = assembleWorkflowInstructionPacket({ catalog, workflowId: 'workflow.feature', stageId: 'stage.feature.implementation', limits });
    expect(first).toEqual(second);
  });

  it('truncation records identify the root and every affected dependency', () => {
    const catalog = catalogWithOptionalRuleChain();
    const baseline = assembleWorkflowInstructionPacket({
      catalog: buildInstructionCatalog(),
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
      limits: UNLIMITED,
    });
    const requiredRuleCount = baseline.ok ? baseline.packet.resolvedRules.length : 0;
    const result = assembleWorkflowInstructionPacket({
      catalog,
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
      limits: { ...UNLIMITED, maxRules: requiredRuleCount },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const record = result.packet.truncation.records.find((r) => r.rootOptionalEntryId === 'rule.optional-test.root');
      expect(record).toBeDefined();
      expect(record!.affectedEntryIds).toEqual(expect.arrayContaining(['rule.optional-test.root', 'rule.optional-test.leaf']));
      expect(record!.limitingField).toBe('maxRules');
    }
  });

  it('optional omission does not make requiredContentComplete false', () => {
    const result = assembleWorkflowInstructionPacket({
      catalog: catalogWithOptionalCommand(),
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
      limits: { ...UNLIMITED, maxCommands: 0 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.packet.adequacy.requiredContentComplete).toBe(true);
  });

  it('a malformed optional reference fails assembly rather than being silently truncated', () => {
    const catalog = JSON.parse(JSON.stringify(buildInstructionCatalog())) as InstructionCatalog;
    const stage = catalog.stages.find((s) => s.id === 'stage.feature.implementation')!;
    stage.optionalCommandRefs = ['command.unknown.missing' as never];
    const result = assembleWorkflowInstructionPacket({
      catalog,
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
    });
    expect(result.ok).toBe(false);
  });

  it('an optional rule cycle fails assembly rather than being silently truncated', () => {
    const catalog = JSON.parse(JSON.stringify(buildInstructionCatalog())) as InstructionCatalog;
    catalog.rules.push({
      id: 'rule.optional-test.cycle-a' as never,
      kind: 'rule',
      title: 'cycle-a',
      description: 'cycle test',
      category: 'optional-test',
      instruction: 'cycle a',
      ruleRefs: ['rule.optional-test.cycle-b' as never],
    });
    catalog.rules.push({
      id: 'rule.optional-test.cycle-b' as never,
      kind: 'rule',
      title: 'cycle-b',
      description: 'cycle test',
      category: 'optional-test',
      instruction: 'cycle b',
      ruleRefs: ['rule.optional-test.cycle-a' as never],
    });
    const stage = catalog.stages.find((s) => s.id === 'stage.feature.implementation')!;
    stage.optionalRuleRefs = ['rule.optional-test.cycle-a' as never];
    const result = assembleWorkflowInstructionPacket({
      catalog,
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
    });
    expect(result.ok).toBe(false);
  });
});

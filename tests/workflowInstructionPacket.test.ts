import { buildInstructionCatalog } from '../src/instructions/catalog';
import {
  assembleWorkflowInstructionPacket,
  WORKFLOW_INSTRUCTION_PACKET_SCHEMA_VERSION,
  DEFAULT_WORKFLOW_INSTRUCTION_PACKET_LIMITS,
} from '../src/instructions/workflowInstructionPacket';
import { InstructionCatalog } from '../src/instructions/catalogTypes';

function clone(catalog: InstructionCatalog): InstructionCatalog {
  return JSON.parse(JSON.stringify(catalog));
}

function assembleFeatureImplementation(catalog: InstructionCatalog = buildInstructionCatalog()) {
  return assembleWorkflowInstructionPacket({
    catalog,
    workflowId: 'workflow.feature',
    stageId: 'stage.feature.implementation',
  });
}

describe('packet construction', () => {
  it('assembles a valid feature/implementation packet', () => {
    const result = assembleFeatureImplementation();
    expect(result.ok).toBe(true);
  });

  it('schemaVersion is 1.0.0', () => {
    const result = assembleFeatureImplementation();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.packet.schemaVersion).toBe('1.0.0');
    expect(WORKFLOW_INSTRUCTION_PACKET_SCHEMA_VERSION).toBe('1.0.0');
  });

  it('records catalog schema and version', () => {
    const catalog = buildInstructionCatalog();
    const result = assembleWorkflowInstructionPacket({
      catalog,
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packet.catalogSchemaVersion).toBe(catalog.schemaVersion);
      expect(result.packet.catalogVersion).toBe(catalog.catalogVersion);
    }
  });

  it('workflowId is workflow.feature and stageId is stage.feature.implementation', () => {
    const result = assembleFeatureImplementation();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packet.workflowId).toBe('workflow.feature');
      expect(result.packet.stageId).toBe('stage.feature.implementation');
    }
  });

  it('exactly one primary entry matching the feature implementation stage', () => {
    const result = assembleFeatureImplementation();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packet.primaryEntry.id).toBe('stage.feature.implementation');
      expect(result.packet.primaryEntry.kind).toBe('stage');
      expect(result.packet.primaryEntry.stageName).toBe('implementation');
    }
  });

  it('required rules resolve, including transitive shared workflow rules', () => {
    const result = assembleFeatureImplementation();
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ids = result.packet.resolvedRules.map((r) => r.id);
      expect(ids).toEqual(
        expect.arrayContaining([
          'rule.stage.no-implementation-before-pseudocode',
          'rule.context.report-missing-context',
          'rule.scope.report-blocker-before-broadening',
        ]),
      );
      expect(result.packet.resolvedRules.every((r) => r.included === 'required')).toBe(true);
    }
  });

  it('exactly one report contract resolves', () => {
    const result = assembleFeatureImplementation();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packet.reportContract.id).toBe('report.implementation');
      expect(result.packet.reportContract.kind).toBe('report-contract');
    }
  });

  it('validation requirements and stop conditions are explicit and non-empty', () => {
    const result = assembleFeatureImplementation();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packet.validationRequirements.length).toBeGreaterThan(0);
      expect(result.packet.stopConditions.length).toBeGreaterThan(0);
      expect(result.packet.stopConditions).toEqual(
        expect.arrayContaining(['do not claim verification success without command evidence']),
      );
    }
  });

  it('unresolvedReferences is empty on a successful assembly', () => {
    const result = assembleFeatureImplementation();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.packet.unresolvedReferences).toEqual([]);
  });

  it('assembly output is deterministic across repeated calls', () => {
    const first = assembleFeatureImplementation();
    const second = assembleFeatureImplementation();
    expect(first).toEqual(second);
  });
});

describe('packet assembly failures', () => {
  it('fails for an invalid catalog', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.stages[0].id = catalog.stages[1].id;
    const result = assembleWorkflowInstructionPacket({
      catalog,
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
    });
    expect(result.ok).toBe(false);
  });

  it('fails for an unknown workflow', () => {
    const result = assembleWorkflowInstructionPacket({
      catalog: buildInstructionCatalog(),
      workflowId: 'workflow.does-not-exist',
      stageId: 'stage.feature.implementation',
    });
    expect(result.ok).toBe(false);
  });

  it('fails for an unknown stage', () => {
    const result = assembleWorkflowInstructionPacket({
      catalog: buildInstructionCatalog(),
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.does-not-exist',
    });
    expect(result.ok).toBe(false);
  });

  it('fails for a cross-workflow stage', () => {
    const result = assembleWorkflowInstructionPacket({
      catalog: buildInstructionCatalog(),
      workflowId: 'workflow.repair',
      stageId: 'stage.feature.implementation',
    });
    expect(result.ok).toBe(false);
  });

  it('fails when a required command reference is missing', () => {
    const catalog = clone(buildInstructionCatalog());
    const stage = catalog.stages.find((s) => s.id === 'stage.feature.implementation')!;
    stage.commandRefs = ['command.unknown.missing' as never];
    const result = assembleWorkflowInstructionPacket({
      catalog,
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
    });
    expect(result.ok).toBe(false);
  });

  it('fails when a required rule reference is missing', () => {
    const catalog = clone(buildInstructionCatalog());
    const stage = catalog.stages.find((s) => s.id === 'stage.feature.implementation')!;
    stage.ruleRefs = ['rule.unknown.missing' as never];
    const result = assembleWorkflowInstructionPacket({
      catalog,
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
    });
    expect(result.ok).toBe(false);
  });

  it('fails on a wrong reference type', () => {
    const catalog = clone(buildInstructionCatalog());
    const stage = catalog.stages.find((s) => s.id === 'stage.feature.implementation')!;
    stage.commandRefs = [catalog.rules[0].id as unknown as typeof stage.commandRefs[0]];
    const result = assembleWorkflowInstructionPacket({
      catalog,
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
    });
    expect(result.ok).toBe(false);
  });

  it('fails on a required rule cycle', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.rules[0].ruleRefs = [catalog.rules[1].id];
    catalog.rules[1].ruleRefs = [catalog.rules[0].id];
    const result = assembleWorkflowInstructionPacket({
      catalog,
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
    });
    expect(result.ok).toBe(false);
  });

  it('fails when the report contract is missing', () => {
    const catalog = clone(buildInstructionCatalog());
    const stage = catalog.stages.find((s) => s.id === 'stage.feature.implementation')!;
    stage.reportContractRef = 'report.does-not-exist' as never;
    const result = assembleWorkflowInstructionPacket({
      catalog,
      workflowId: 'workflow.feature',
      stageId: 'stage.feature.implementation',
    });
    expect(result.ok).toBe(false);
  });
});

describe('default packet limits', () => {
  it('all current required feature/implementation content fits under the defaults', () => {
    const result = assembleFeatureImplementation();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packet.adequacy.status).toBe('adequate');
      expect(result.packet.budget.overLimit).toBe(false);
    }
  });

  it('default limits have headroom above the current representative content', () => {
    const result = assembleFeatureImplementation();
    expect(result.ok).toBe(true);
    if (result.ok) {
      const maxEntry = Math.max(...Object.values(result.packet.budget.perEntryCharacters));
      expect(DEFAULT_WORKFLOW_INSTRUCTION_PACKET_LIMITS.maxEntryCharacters).toBeGreaterThan(maxEntry);
      expect(DEFAULT_WORKFLOW_INSTRUCTION_PACKET_LIMITS.maxTotalCharacters).toBeGreaterThan(
        result.packet.budget.totalCharacters * 2,
      );
      expect(DEFAULT_WORKFLOW_INSTRUCTION_PACKET_LIMITS.maxRules).toBeGreaterThan(result.packet.resolvedRules.length);
    }
  });
});

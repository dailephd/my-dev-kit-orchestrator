import {
  buildInstructionCatalog,
  isWorkflowId,
  isStageId,
  isCommandId,
  isRuleId,
  isReportContractId,
  makeWorkflowId,
  makeStageId,
} from '../src/instructions';
import { getAllWorkflows } from '../src/workflows';
import { VALID_MODES } from '../src/types';

describe('stable ID format', () => {
  it('accepts every valid workflow ID', () => {
    for (const mode of VALID_MODES) {
      expect(isWorkflowId(`workflow.${mode}`)).toBe(true);
    }
  });

  it('accepts every valid stage ID produced by the runtime workflows', () => {
    for (const wf of getAllWorkflows()) {
      for (const stage of wf.stages) {
        expect(isStageId(makeStageId(wf.mode, stage.name))).toBe(true);
      }
    }
  });

  it('accepts valid command, rule, and report-contract IDs', () => {
    expect(isCommandId('command.my-dev-kit.index')).toBe(true);
    expect(isRuleId('rule.stage.no-implementation-before-pseudocode')).toBe(true);
    expect(isReportContractId('report.implementation')).toBe(true);
  });

  it('rejects uppercase IDs', () => {
    expect(isWorkflowId('Workflow.feature')).toBe(false);
    expect(isStageId('stage.Feature.request-brief')).toBe(false);
  });

  it('rejects whitespace', () => {
    expect(isWorkflowId('workflow. feature')).toBe(false);
    expect(isRuleId('rule.stage. no-implementation')).toBe(false);
  });

  it('rejects empty segments', () => {
    expect(isWorkflowId('workflow.')).toBe(false);
    expect(isStageId('stage..request-brief')).toBe(false);
  });

  it('rejects wrong prefixes', () => {
    expect(isWorkflowId('stage.feature')).toBe(false);
    expect(isStageId('workflow.feature.request-brief')).toBe(false);
    expect(isCommandId('rule.my-dev-kit.index')).toBe(false);
    expect(isRuleId('command.stage.no-implementation')).toBe(false);
    expect(isReportContractId('rule.implementation')).toBe(false);
  });

  it('rejects path separators', () => {
    expect(isStageId('stage/feature/request-brief')).toBe(false);
    expect(isWorkflowId('workflow.feature\\x')).toBe(false);
  });

  it('derived IDs are stable regardless of array order', () => {
    const idsInOrder = VALID_MODES.map((mode) => makeWorkflowId(mode));
    const idsReversed = [...VALID_MODES].reverse().map((mode) => makeWorkflowId(mode));
    expect([...idsInOrder].sort()).toEqual([...idsReversed].sort());
  });
});

describe('catalog completeness', () => {
  const catalog = buildInstructionCatalog();

  it('has exactly seven workflow entries', () => {
    expect(catalog.workflows).toHaveLength(7);
  });

  it('has exactly 79 mode-specific stage entries', () => {
    expect(catalog.stages).toHaveLength(79);
  });

  it('has one catalog workflow entry for every runtime mode', () => {
    const modes = catalog.workflows.map((wf) => wf.mode).sort();
    expect(modes).toEqual([...VALID_MODES].sort());
  });

  it('every runtime stage has a corresponding catalog stage entry', () => {
    for (const wf of getAllWorkflows()) {
      for (const stage of wf.stages) {
        const id = makeStageId(wf.mode, stage.name);
        expect(catalog.stages.some((s) => s.id === id)).toBe(true);
      }
    }
  });

  it('every workflow stageRefs list matches runtime stage order exactly', () => {
    for (const wf of getAllWorkflows()) {
      const catalogWf = catalog.workflows.find((c) => c.mode === wf.mode);
      expect(catalogWf).toBeDefined();
      const expectedRefs = wf.stages.map((s) => makeStageId(wf.mode, s.name));
      expect(catalogWf!.stageRefs).toEqual(expectedRefs);
    }
  });

  it('has no extra catalog stage entries beyond runtime stages', () => {
    const runtimeIds = new Set(
      getAllWorkflows().flatMap((wf) => wf.stages.map((s) => makeStageId(wf.mode, s.name))),
    );
    for (const stage of catalog.stages) {
      expect(runtimeIds.has(stage.id)).toBe(true);
    }
  });

  it('every stage has exactly one report-contract reference', () => {
    for (const stage of catalog.stages) {
      expect(typeof stage.reportContractRef).toBe('string');
      expect(stage.reportContractRef.length).toBeGreaterThan(0);
    }
  });

  it('repeated stage names across different modes have distinct stage IDs', () => {
    const implementationStageIds = catalog.stages
      .filter((s) => s.stageName === 'implementation')
      .map((s) => s.id);
    expect(new Set(implementationStageIds).size).toBe(implementationStageIds.length);
    expect(implementationStageIds).toEqual(
      expect.arrayContaining([
        'stage.feature.implementation',
        'stage.repair.implementation',
        'stage.refactor.implementation',
        'stage.harden.implementation',
        'stage.extraction.implementation',
      ]),
    );
  });
});

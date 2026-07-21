import { buildInstructionCatalog } from '../src/instructions/catalog';
import {
  resolveWorkflow,
  resolveStage,
  resolveStageByWorkflowAndName,
  resolveStageForWorkflow,
} from '../src/instructions/catalogResolver';
import { InstructionCatalog } from '../src/instructions/catalogTypes';

function clone(catalog: InstructionCatalog): InstructionCatalog {
  return JSON.parse(JSON.stringify(catalog));
}

describe('exact resolution', () => {
  const catalog = buildInstructionCatalog();

  it('resolves a workflow by exact ID', () => {
    const result = resolveWorkflow(catalog, 'workflow.feature');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result.mode).toBe('feature');
  });

  it('resolves a stage by exact stage ID', () => {
    const result = resolveStage(catalog, 'stage.feature.implementation');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result.stage.stageName).toBe('implementation');
  });

  it('resolves a stage by exact workflow ID plus exact stage name', () => {
    const result = resolveStageByWorkflowAndName(catalog, 'workflow.feature', 'implementation');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result.stage.id).toBe('stage.feature.implementation');
  });

  it('rejects an unknown workflow ID', () => {
    const result = resolveWorkflow(catalog, 'workflow.does-not-exist');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].code).toBe('CATALOG_UNKNOWN_WORKFLOW');
  });

  it('rejects an unknown stage ID', () => {
    const result = resolveStage(catalog, 'stage.feature.does-not-exist');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].code).toBe('CATALOG_UNKNOWN_STAGE');
  });

  it('rejects a cross-workflow stage request', () => {
    const result = resolveStageForWorkflow(catalog, 'workflow.repair', 'stage.feature.implementation');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].code).toBe('CATALOG_STAGE_MODE_MISMATCH');
  });

  it('resolves stage command dependencies', () => {
    const result = resolveStageByWorkflowAndName(catalog, 'workflow.feature', 'architecture-context');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.commands.length).toBeGreaterThan(0);
      expect(result.result.commands.map((c) => c.id)).toEqual(
        expect.arrayContaining(['command.my-dev-kit.index', 'command.my-dev-kit.context']),
      );
    }
  });

  it('resolves direct rules for a stage', () => {
    const result = resolveStage(catalog, 'stage.feature.judge');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.rules.map((r) => r.id)).toEqual(
        expect.arrayContaining(['rule.judge.require-pass-verdict']),
      );
    }
  });

  it('resolves transitive rule dependencies', () => {
    const result = resolveStage(catalog, 'stage.feature.verification');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ids = result.result.rules.map((r) => r.id);
      expect(ids).toEqual(expect.arrayContaining(['rule.verification.no-claim-without-evidence']));
      expect(ids).toEqual(expect.arrayContaining(['rule.verification.require-command-evidence']));
    }
  });

  it('deduplicates dependencies reachable through more than one path', () => {
    const result = resolveStage(catalog, 'stage.feature.verification');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ids = result.result.rules.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('resolves the report contract exactly once', () => {
    const result = resolveStage(catalog, 'stage.feature.implementation');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.reportContract.id).toBe('report.implementation');
    }
  });

  it('result ordering is deterministic across repeated resolutions', () => {
    const first = resolveStage(catalog, 'stage.feature.verification');
    const second = resolveStage(catalog, 'stage.feature.verification');
    expect(first).toEqual(second);
  });

  it('provenance ordering is deterministic across repeated resolutions', () => {
    const first = resolveStage(catalog, 'stage.feature.verification');
    const second = resolveStage(catalog, 'stage.feature.verification');
    expect(first.ok && first.result.provenance).toEqual(second.ok && second.result.provenance);
  });

  it('does not guess a misspelled workflow ID', () => {
    const result = resolveWorkflow(catalog, 'workflow.featurr');
    expect(result.ok).toBe(false);
  });

  it('does not guess a misspelled stage ID', () => {
    const result = resolveStage(catalog, 'stage.feature.implementatoin');
    expect(result.ok).toBe(false);
  });

  it('does not accept a differently cased workflow ID', () => {
    const result = resolveWorkflow(catalog, 'Workflow.feature');
    expect(result.ok).toBe(false);
  });

  it('does not accept a differently cased stage ID', () => {
    const result = resolveStage(catalog, 'STAGE.feature.implementation');
    expect(result.ok).toBe(false);
  });
});

describe('resolver rejection on broken references', () => {
  it('fails cleanly when a stage command reference is missing', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.stages[0].commandRefs = ['command.unknown.missing' as never];
    const result = resolveStage(catalog, catalog.stages[0].id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'CATALOG_MISSING_REFERENCE')).toBe(true);
    }
  });

  it('fails cleanly when a stage rule reference is missing', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.stages[0].ruleRefs = ['rule.unknown.missing' as never];
    const result = resolveStage(catalog, catalog.stages[0].id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'CATALOG_MISSING_REFERENCE')).toBe(true);
    }
  });

  it('fails cleanly when the report contract reference is missing', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.stages[0].reportContractRef = 'report.missing' as never;
    const result = resolveStage(catalog, catalog.stages[0].id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'CATALOG_MISSING_REPORT_CONTRACT')).toBe(true);
    }
  });

  it('fails cleanly on a cyclic rule dependency reachable from a stage', () => {
    const catalog = clone(buildInstructionCatalog());
    catalog.rules[0].ruleRefs = [catalog.rules[1].id];
    catalog.rules[1].ruleRefs = [catalog.rules[0].id];
    catalog.stages[0].ruleRefs = [catalog.rules[0].id];
    const result = resolveStage(catalog, catalog.stages[0].id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'CATALOG_REFERENCE_CYCLE')).toBe(true);
    }
  });
});

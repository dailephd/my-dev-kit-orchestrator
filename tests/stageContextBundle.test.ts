import { buildInstructionCatalog } from '../src/instructions/catalog';
import {
  assembleStageContextBundle,
  STAGE_CONTEXT_BUNDLE_SCHEMA_VERSION,
  UpstreamArtifactReference,
} from '../src/instructions/stageContextBundle';
import { RunMetadata } from '../src/run';
import { getWorkflow } from '../src/workflows';

function makeMeta(): RunMetadata {
  const workflow = getWorkflow('feature');
  return {
    runId: 'run-1',
    mode: 'feature',
    request: 'do the thing',
    projectRoot: '/proj',
    runFolder: '/proj/.my-dev-kit-orchestrator/runs/run-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    currentStage: workflow.stages[0].name,
    stages: workflow.stages,
    status: 'in_progress',
  };
}

const upstream: UpstreamArtifactReference[] = [
  { stageName: 'request-brief', artifactFile: 'artifacts/request-brief.txt', path: '/proj/.../request-brief.txt', purpose: 'request context', required: true },
];

function assemble(overrides: Partial<Parameters<typeof assembleStageContextBundle>[0]> = {}) {
  return assembleStageContextBundle({
    catalog: buildInstructionCatalog(),
    runMetadata: makeMeta(),
    selectedStage: 'implementation',
    upstreamArtifacts: upstream,
    ...overrides,
  });
}

describe('assembleStageContextBundle', () => {
  it('assembles successfully for a valid stage', () => {
    expect(assemble().ok).toBe(true);
  });

  it('schema version is 1.0.0', () => {
    const result = assemble();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bundle.schemaVersion).toBe('1.0.0');
    expect(STAGE_CONTEXT_BUNDLE_SCHEMA_VERSION).toBe('1.0.0');
  });

  it('contains TaskState', () => {
    const result = assemble();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.taskState.selectedStage).toBe('implementation');
      expect(result.bundle.taskState.schemaVersion).toBe('1.0.0');
    }
  });

  it('contains the exact workflow instruction packet', () => {
    const result = assemble();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.workflowInstructionPacket.workflowId).toBe('workflow.feature');
      expect(result.bundle.workflowInstructionPacket.stageId).toBe('stage.feature.implementation');
    }
  });

  it('contains upstream artifact references', () => {
    const result = assemble();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bundle.upstreamArtifacts).toEqual(upstream);
  });

  it('repository evidence is absent for a non-context-sensitive stage', () => {
    const result = assemble({ selectedStage: 'architecture-context' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.repositoryEvidenceReference).toBeUndefined();
      expect(result.bundle.provenance.repositoryEvidenceSource).toBe('not-configured');
    }
  });

  // Batch 4: stage.feature.implementation is one of the 11 exact
  // context-sensitive stages, so a reference is now always attached -- with
  // status "missing" here because no supplemental files exist under the run
  // folder used by this fixture. See AGENTS.txt Batch 4 section 24.6.
  it('repository evidence is attached for a context-sensitive stage, with status missing when no files exist', () => {
    const result = assemble();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.repositoryEvidenceReference).toBeDefined();
      expect(result.bundle.repositoryEvidenceReference?.kind).toBe('implementation');
      expect(result.bundle.repositoryEvidenceReference?.role).toBe('implementation');
      expect(result.bundle.repositoryEvidenceReference?.status).toBe('missing');
      expect(result.bundle.repositoryEvidenceReference?.enforcement).toBe('informational');
      expect(result.bundle.provenance.repositoryEvidenceSource).toBe('supplemental-context-files');
      expect(result.bundle.provenance.repositoryEvidenceRequirementSource).toBe('stage-repository-evidence-requirements');
      expect(result.bundle.provenance.repositoryEvidenceEnforcement).toBe('informational');
    }
  });

  it('provenance is deterministic and free of timestamps or random identifiers', () => {
    const first = assemble();
    const second = assemble();
    expect(first.ok && first.bundle.provenance).toEqual(second.ok && second.bundle.provenance);
    expect(first.ok).toBe(true);
    if (first.ok) {
      const text = JSON.stringify(first.bundle);
      expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
  });

  it('packet assembly failure blocks bundle assembly', () => {
    const result = assembleStageContextBundle({
      catalog: buildInstructionCatalog(),
      runMetadata: makeMeta(),
      selectedStage: 'not-a-real-stage',
      upstreamArtifacts: [],
    });
    expect(result.ok).toBe(false);
  });

  it('packet inadequacy (over-budget required content) remains visible rather than hidden', () => {
    const result = assembleStageContextBundle({
      catalog: buildInstructionCatalog(),
      runMetadata: makeMeta(),
      selectedStage: 'implementation',
      upstreamArtifacts: upstream,
      limits: { maxCommands: null, maxRules: 0, maxRuleDepth: null, maxEntryCharacters: null, maxTotalCharacters: null },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.workflowInstructionPacket.adequacy.status).toBe('inadequate');
      expect(result.bundle.workflowInstructionPacket.adequacy.requiredContentComplete).toBe(true);
    }
  });

  it('bundle assembly does not mutate run metadata', () => {
    const meta = makeMeta();
    const before = JSON.stringify(meta);
    assembleStageContextBundle({ catalog: buildInstructionCatalog(), runMetadata: meta, selectedStage: 'implementation', upstreamArtifacts: [] });
    expect(JSON.stringify(meta)).toBe(before);
  });
});

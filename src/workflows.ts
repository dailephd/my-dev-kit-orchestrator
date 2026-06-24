import { WorkflowMode, VALID_MODES, isValidMode } from './types';

export interface StageDefinition {
  name: string;
  artifactFile: string;
  promptFile: string;
  additionalArtifactFiles?: string[];
}

export interface WorkflowDefinition {
  mode: WorkflowMode;
  stages: StageDefinition[];
}

const ARTIFACT_MAP: Record<string, string> = {
  'request-brief': 'artifacts/request-brief.txt',
  'architecture-context': 'artifacts/architecture-context-packet.txt',
  'behavior-model': 'artifacts/behavior-model.txt',
  'pseudocode-packet': 'artifacts/pseudocode-packet.txt',
  'test-strategy': 'artifacts/test-strategy-packet.txt',
  'implementation': 'artifacts/implementation-report.txt',
  'test-implementation': 'artifacts/test-implementation-report.txt',
  'verification': 'artifacts/verification-report.txt',
  'judge': 'artifacts/judge-report.txt',
  'final-report': 'artifacts/final-report.txt',
  // repair-specific
  'observed-behavior-report': 'artifacts/observed-behavior-report.txt',
  'behavior-trace': 'artifacts/behavior-trace.txt',
  'divergence-report': 'artifacts/divergence-report.txt',
  'correction-design': 'artifacts/correction-design.txt',
  'regression-test-strategy': 'artifacts/regression-test-strategy.txt',
  // test-specific
  'test-target-brief': 'artifacts/test-target-brief.txt',
  'behavior-reconstruction': 'artifacts/behavior-reconstruction.txt',
  'pseudocode-summary': 'artifacts/pseudocode-summary.txt',
  // refactor-specific
  'refactor-brief': 'artifacts/refactor-brief.txt',
  'existing-behavior-map': 'artifacts/existing-behavior-map.txt',
  'preserved-invariant-list': 'artifacts/preserved-invariant-list.txt',
  'compatibility-test-strategy': 'artifacts/compatibility-test-strategy.txt',
  'refactor-pseudocode-packet': 'artifacts/refactor-pseudocode-packet.txt',
  // harden-specific
  'hardening-brief': 'artifacts/hardening-brief.txt',
  'assumption-report': 'artifacts/assumption-report.txt',
  'failure-mode-matrix': 'artifacts/failure-mode-matrix.txt',
  'guard-pseudocode-packet': 'artifacts/guard-pseudocode-packet.txt',
  'resilience-test-strategy': 'artifacts/resilience-test-strategy.txt',
  // extraction-specific
  'source-architecture-context': 'artifacts/source-architecture-context-packet.txt',
  'source-workflow-map': 'artifacts/source-workflow-map.txt',
  'porting-map': 'artifacts/source-to-target-porting-map.txt',
  'golden-behavior-contract': 'artifacts/golden-behavior-contract.txt',
  'target-architecture': 'artifacts/target-architecture-proposal.txt',
  // design trace
  'design-map': 'artifacts/design-map.txt',
};

const ADDITIONAL_ARTIFACT_MAP: Record<string, string[]> = {
  'porting-map': ['artifacts/do-not-port-list.txt'],
};

function buildStages(stageNames: string[]): StageDefinition[] {
  return stageNames.map((name, index) => {
    const num = String(index + 1).padStart(2, '0');
    const artifactFile = ARTIFACT_MAP[name];
    if (!artifactFile) {
      throw new Error(`No artifact mapping for stage: ${name}`);
    }
    const additionalArtifactFiles = ADDITIONAL_ARTIFACT_MAP[name];
    return {
      name,
      artifactFile,
      promptFile: `prompts/${num}-${name}.prompt.txt`,
      ...(additionalArtifactFiles ? { additionalArtifactFiles } : {}),
    };
  });
}

const FEATURE_STAGES = buildStages([
  'request-brief',
  'architecture-context',
  'behavior-model',
  'pseudocode-packet',
  'test-strategy',
  'implementation',
  'test-implementation',
  'verification',
  'judge',
  'final-report',
]);

const REPAIR_STAGES = buildStages([
  'observed-behavior-report',
  'architecture-context',
  'behavior-trace',
  'divergence-report',
  'correction-design',
  'regression-test-strategy',
  'implementation',
  'test-implementation',
  'verification',
  'judge',
  'final-report',
]);

const TEST_STAGES = buildStages([
  'test-target-brief',
  'architecture-context',
  'behavior-reconstruction',
  'pseudocode-summary',
  'test-strategy',
  'test-implementation',
  'verification',
  'judge',
  'final-report',
]);

const REFACTOR_STAGES = buildStages([
  'refactor-brief',
  'architecture-context',
  'existing-behavior-map',
  'preserved-invariant-list',
  'compatibility-test-strategy',
  'refactor-pseudocode-packet',
  'implementation',
  'test-implementation',
  'verification',
  'judge',
  'final-report',
]);

const HARDEN_STAGES = buildStages([
  'hardening-brief',
  'architecture-context',
  'assumption-report',
  'failure-mode-matrix',
  'guard-pseudocode-packet',
  'resilience-test-strategy',
  'implementation',
  'test-implementation',
  'verification',
  'judge',
  'final-report',
]);

const EXTRACTION_STAGES = buildStages([
  'request-brief',
  'source-architecture-context',
  'source-workflow-map',
  'porting-map',
  'golden-behavior-contract',
  'target-architecture',
  'behavior-model',
  'pseudocode-packet',
  'test-strategy',
  'implementation',
  'test-implementation',
  'verification',
  'judge',
  'final-report',
]);

const WORKFLOW_DEFINITIONS: Record<WorkflowMode, WorkflowDefinition> = {
  feature: { mode: 'feature', stages: FEATURE_STAGES },
  repair: { mode: 'repair', stages: REPAIR_STAGES },
  test: { mode: 'test', stages: TEST_STAGES },
  refactor: { mode: 'refactor', stages: REFACTOR_STAGES },
  harden: { mode: 'harden', stages: HARDEN_STAGES },
  extraction: { mode: 'extraction', stages: EXTRACTION_STAGES },
};

export function getWorkflow(mode: WorkflowMode): WorkflowDefinition {
  return WORKFLOW_DEFINITIONS[mode];
}

export function getWorkflowOrThrow(mode: string): WorkflowDefinition {
  if (!isValidMode(mode)) {
    throw new Error(`Invalid workflow mode: "${mode}". Allowed: ${VALID_MODES.join(', ')}`);
  }
  return WORKFLOW_DEFINITIONS[mode];
}

export function getArtifactFile(stageName: string): string | undefined {
  return ARTIFACT_MAP[stageName];
}

export function getAllWorkflows(): WorkflowDefinition[] {
  return VALID_MODES.map((mode) => WORKFLOW_DEFINITIONS[mode]);
}

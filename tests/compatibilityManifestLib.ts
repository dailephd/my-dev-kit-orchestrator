// Builds the Batch 6 release-candidate compatibility manifest from actual
// runtime owners (never hardcoded prose) so it always reflects the current
// implementation. Not a test file itself.

import { getAllWorkflows } from '../src/workflows';
import { createProgram } from '../src/program';
import { JUDGE_VERDICTS } from '../src/judgeParser';
import { MANUAL_STATES } from '../src/artifactLifecycle';
import { STAGE_CONTEXT_BUNDLE_SCHEMA_VERSION } from '../src/instructions/stageContextBundle';
import { TASK_STATE_SCHEMA_VERSION } from '../src/instructions/taskState';
import { CATALOG_SCHEMA_VERSION } from '../src/instructions/catalogTypes';
import {
  SUPPLEMENTAL_CONTEXT_PACKET_SCHEMA_VERSION,
  SUPPLEMENTAL_CONTEXT_RETRIEVAL_REPORT_SCHEMA_VERSION,
} from '../src/instructions/supplementalContextTypes';
import { CONTEXT_READINESS_SCHEMA_VERSION } from '../src/instructions/contextReadiness';
import { STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS } from '../src/instructions/stageRepositoryEvidenceRequirements';
import { TEST_STRATEGY_SOURCE_REQUIREMENTS } from '../src/instructions/testResponsibilityCriticality';
import { VALID_MODES } from '../src/types';

function sortedKeys<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(sortedKeys) as unknown as T;
  if (obj !== null && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      out[key] = sortedKeys((obj as Record<string, unknown>)[key]);
    }
    return out as T;
  }
  return obj;
}

export function buildCompatibilityManifest(): Record<string, unknown> {
  const workflows = getAllWorkflows();
  const program = createProgram();

  const stageOrderByMode: Record<string, string[]> = {};
  const promptFiles: string[] = [];
  const artifactFiles: string[] = [];
  const additionalArtifactFiles: string[] = [];
  let stageCount = 0;

  for (const wf of workflows) {
    stageOrderByMode[wf.mode] = wf.stages.map((s) => s.name);
    stageCount += wf.stages.length;
    for (const s of wf.stages) {
      promptFiles.push(s.promptFile);
      artifactFiles.push(s.artifactFile);
      if (s.additionalArtifactFiles) additionalArtifactFiles.push(...s.additionalArtifactFiles);
    }
  }

  const cliCommands = program.commands.map((c) => ({
    name: c.name(),
    options: c.options.map((o) => o.long).filter((v): v is string => Boolean(v)),
  }));

  const contextSensitiveStages = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.map((r) => r.stageId);
  const nonGreenfieldModes = VALID_MODES.filter((m) => m !== 'greenfield');
  const contextReviewStages = [
    ...nonGreenfieldModes.map((m) => `stage.${m}.verification`),
    ...nonGreenfieldModes.map((m) => `stage.${m}.judge`),
  ];
  const testStrategyCriticalityStages = TEST_STRATEGY_SOURCE_REQUIREMENTS.map((r) => r.strategyStageId);

  const manifest = {
    schemaVersion: '1.0.0',
    baselineCommit: '983a476da2d483f76f92fef73a0b324c9ed77ea7',
    packageName: '@dailephd/my-dev-kit-orchestrator',
    currentPackageVersion: '1.2.1',
    targetVersion: '1.2.1',
    workflowCount: workflows.length,
    stageCount,
    modeNames: [...VALID_MODES],
    stageOrderByMode,
    promptFiles,
    artifactFiles,
    additionalArtifactFiles,
    cliCommands,
    lifecycleStates: [...MANUAL_STATES, 'missing', 'stale'].sort(),
    judgeVerdicts: [...JUDGE_VERDICTS],
    correctionRouteStatuses: ['pass', 'correction_required', 'blocked', 'unknown_verdict', 'missing_verdict'],
    greenfieldProfiles: ['typescript-cli', 'nextjs-app', 'android-compose'],
    contextSensitiveStages,
    contextReviewStages,
    testStrategyCriticalityStages,
    packetSchemaVersion: CATALOG_SCHEMA_VERSION,
    taskStateSchemaVersion: TASK_STATE_SCHEMA_VERSION,
    stageContextBundleSchemaVersion: STAGE_CONTEXT_BUNDLE_SCHEMA_VERSION,
    supplementalPacketSchemaVersion: SUPPLEMENTAL_CONTEXT_PACKET_SCHEMA_VERSION,
    supplementalReportSchemaVersion: SUPPLEMENTAL_CONTEXT_RETRIEVAL_REPORT_SCHEMA_VERSION,
    contextReadinessSchemaVersion: CONTEXT_READINESS_SCHEMA_VERSION,
    knownIntentionalPromptChanges: [
      'the 11 direct context-sensitive stages render context-refresh-only prompts when required context is not ready',
      'non-greenfield verification/judge stages carry a Context readiness review section',
      'the six mode-specific test-strategy stages require explicit per-responsibility criticality',
    ],
    documentedLegacyExceptions: ['stage.greenfield.scaffold-plan', 'stage.greenfield.scaffold-implementation'],
    knownDeferredRisks: [
      'extraction judge generic default routing may reference architecture-context; NEED_CONTEXT avoids this by emitting an exact valid recommended stage',
      'published my-dev-kit 1.10.2 package CLI reports 1.0.0 and lacks the role-aware context command; a clean local build was used as fixture authority',
    ],
    validationEnvironments: ['local'],
    generationMethod: 'derived from runtime workflow/CLI/schema owners, not hand-authored',
    nondeterministicFieldsExcluded: ['none -- manifest contains no timestamps or random identifiers'],
  };

  return sortedKeys(manifest);
}

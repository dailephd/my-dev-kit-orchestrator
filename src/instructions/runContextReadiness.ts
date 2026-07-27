// Mode-level context-readiness aggregation and NEED_CONTEXT recommendation
// policy (Batch 5). Never persisted; recomputed in memory per call.

import {
  ContextReadinessBlockerSummary,
  ContextReadinessIssue,
  ContextReadinessResult,
  compareContextReadinessIssues,
  createContextReadinessIssue,
  evaluateContextReadiness,
  notRequiredContextReadiness,
} from './contextReadiness';
import { requiredSupplementalContextKindsForMode, STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS } from './stageRepositoryEvidenceRequirements';

export interface RunContextReadinessSummary {
  mode: string;
  implementationContext?: ContextReadinessResult;
  testContext?: ContextReadinessResult;
  overallDecision: 'not-required' | 'ready' | 'refresh-required';
  blockingIssueCodes: string[];
  primaryBlocker?: ContextReadinessBlockerSummary;
  warnings: string[];
  recommendedNextStage: string | null;
  readyWithAssumptions: boolean;
  affectedStages: string[];
}

function requirementForKind(mode: string, kind: 'implementation' | 'test') {
  const stageName = kind === 'implementation' ? 'implementation' : 'test-implementation';
  const stageId = `stage.${mode}.${stageName}`;
  return STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.find((r) => r.stageId === stageId);
}

// Validates the recommended stage actually exists in the given workflow's
// stage-name list before it is ever surfaced -- prevents recommending a
// stage the mode doesn't have (AGENTS.txt Batch 5 section 13.4).
function recommendStage(candidate: string, workflowStageNames: readonly string[]): string | null {
  return workflowStageNames.includes(candidate) ? candidate : null;
}

export function evaluateRunContextReadiness(input: {
  mode: string;
  runFolder: string;
  workflowStageNames: readonly string[];
  projectRoot?: string;
}): RunContextReadinessSummary {
  const { mode, runFolder, workflowStageNames, projectRoot } = input;
  const requiredKinds = requiredSupplementalContextKindsForMode(mode);

  if (requiredKinds.length === 0) {
    return {
      mode,
      overallDecision: 'not-required',
      blockingIssueCodes: [],
      warnings: [],
      recommendedNextStage: null,
      readyWithAssumptions: false,
      affectedStages: [],
    };
  }

  let implementationContext: ContextReadinessResult | undefined;
  let testContext: ContextReadinessResult | undefined;

  if (requiredKinds.includes('implementation')) {
    const req = requirementForKind(mode, 'implementation');
    implementationContext = req
      ? evaluateContextReadiness({ requirement: req, stageId: req.stageId, runFolder, mode, projectRoot })
      : notRequiredContextReadiness(`stage.${mode}.implementation`, 'implementation', 'implementation');
  }
  if (requiredKinds.includes('test')) {
    const req = requirementForKind(mode, 'test');
    testContext = req
      ? evaluateContextReadiness({ requirement: req, stageId: req.stageId, runFolder, mode, projectRoot })
      : notRequiredContextReadiness(`stage.${mode}.test-implementation`, 'test', 'test-implementation');
  }

  const implementationReady = !implementationContext || implementationContext.decision !== 'refresh-required';
  const testReady = !testContext || testContext.decision !== 'refresh-required';
  const overallDecision: RunContextReadinessSummary['overallDecision'] = implementationReady && testReady ? 'ready' : 'refresh-required';

  const warnings = [...(implementationContext?.warnings ?? []), ...(testContext?.warnings ?? [])];

  // Recommendation policy (AGENTS.txt Batch 5 section 13): implementation
  // context is repaired first because test context must reflect the
  // post-implementation changed surface. Test-only modes recommend
  // test-implementation directly.
  let recommendedCandidate: string | null = null;
  if (!implementationReady) {
    recommendedCandidate = 'implementation';
  } else if (!testReady) {
    recommendedCandidate = 'test-implementation';
  }
  const recommendedNextStage = recommendedCandidate ? recommendStage(recommendedCandidate, workflowStageNames) : null;

  let blockingIssues: ContextReadinessIssue[] = [
    ...(implementationContext?.issues.filter((candidate) => candidate.severity === 'error') ?? []),
    ...(testContext?.issues.filter((candidate) => candidate.severity === 'error') ?? []),
  ].sort(compareContextReadinessIssues);
  if (overallDecision === 'refresh-required' && blockingIssues.length === 0) {
    const fallbackKind = !implementationReady ? 'implementation' : 'test';
    blockingIssues = [
      createContextReadinessIssue(
        'CONTEXT_READINESS_CONTRACT_VIOLATION',
        'error',
        'Run-level readiness is refresh-required but no child context exposed an actionable error issue.',
        `stage.${mode}.${recommendedCandidate ?? 'implementation'}`,
        fallbackKind,
      ),
    ];
  }
  const blockingIssueCodes = [...new Set(blockingIssues.map((candidate) => candidate.code))];
  const primaryIssue = overallDecision === 'refresh-required' ? blockingIssues[0] : undefined;
  const primaryBlocker =
    primaryIssue
      ? {
          contextKind: primaryIssue.contextKind,
          primaryCode: primaryIssue.code,
          primaryReason: primaryIssue.message,
          correctiveAction: primaryIssue.correctiveAction,
          evidenceTarget: primaryIssue.evidenceTarget,
          blockingIssueCodes,
          supportingIssueCodes: blockingIssueCodes.filter((code) => code !== primaryIssue.code),
        }
      : undefined;

  const affectedStages: string[] = [];
  if (!implementationReady) {
    for (const s of ['implementation', 'verification', 'judge']) {
      if (workflowStageNames.includes(s)) affectedStages.push(s);
    }
  }
  if (!testReady) {
    for (const s of ['test-implementation', 'verification', 'judge']) {
      if (workflowStageNames.includes(s) && !affectedStages.includes(s)) affectedStages.push(s);
    }
  }

  const readyWithAssumptions = Boolean(implementationContext?.readyWithAssumptions || testContext?.readyWithAssumptions);

  return {
    mode,
    implementationContext,
    testContext,
    overallDecision,
    blockingIssueCodes,
    ...(primaryBlocker ? { primaryBlocker } : {}),
    warnings,
    recommendedNextStage,
    readyWithAssumptions,
    affectedStages,
  };
}

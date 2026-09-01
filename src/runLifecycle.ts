import * as fs from 'fs';
import * as path from 'path';
import { readArtifactStateFile } from './artifactLifecycle';
import { evaluateJudgeIntegrity, evaluateFinalReportEligibility } from './judgeIntegrity';
import { evaluateRunIntegrityGate } from './runIntegrityGate';
import { getNextStageWithLifecycle, getNextStageWithRunIntegrity } from './stageDetector';
import type { RunMetadata } from './run';

/**
 * Reconciles the persisted run summary with the existing canonical artifact,
 * integrity, judge, correction, and final-report decisions. It deliberately
 * owns no lifecycle rules of its own.
 */
export function reconcileRunLifecycle(meta: RunMetadata): RunMetadata {
  const stateFile = readArtifactStateFile(meta.runFolder);
  // Establish lifecycle truth before asking readiness which requirements are
  // applicable.  This intentionally uses the non-gate lifecycle resolver:
  // the gate below then applies readiness to that reconciled phase.
  const lifecycleNextStage = getNextStageWithLifecycle(meta, stateFile);
  const gate = evaluateRunIntegrityGate({
    mode: meta.mode,
    runFolder: meta.runFolder,
    workflowStageNames: meta.stages.map((stage) => stage.name),
    currentStage: lifecycleNextStage?.name ?? '(complete)',
    projectRoot: meta.projectRoot,
  });
  const judgeIntegrity = evaluateJudgeIntegrity({ gate, runFolder: meta.runFolder, mode: meta.mode });
  const finalReportEligibility = evaluateFinalReportEligibility({
    gate,
    judgeIntegrity,
    runFolder: meta.runFolder,
    stages: meta.stages,
    stateFile,
  });
  const nextStage = getNextStageWithRunIntegrity(meta, stateFile, gate, finalReportEligibility.eligible);
  const correctionStage = judgeIntegrity.correctionRequired ? judgeIntegrity.acceptedCorrectionStage : null;
  const currentStage = correctionStage ?? nextStage?.name ?? '(complete)';
  const hasLifecycleEvidence = Object.keys(stateFile.artifacts).length > 0 ||
    meta.stages.some((stage) => fs.existsSync(path.join(meta.runFolder, stage.artifactFile)));
  const status: RunMetadata['status'] = nextStage === null && !correctionStage
    ? 'completed'
    : currentStage === meta.stages[0]?.name && meta.status === 'created' && !hasLifecycleEvidence
      ? 'created'
      : 'in_progress';

  if (meta.currentStage === currentStage && meta.status === status) return meta;

  const reconciled: RunMetadata = { ...meta, currentStage, status };
  const metadataPath = path.join(meta.runFolder, 'run.json');
  const temporaryPath = `${metadataPath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(reconciled, null, 2), 'utf8');
  fs.renameSync(temporaryPath, metadataPath);
  return reconciled;
}

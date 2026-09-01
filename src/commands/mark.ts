import { Command } from 'commander';
import * as path from 'path';
import { getMostRecentRun, loadRun, getRunFolder } from '../run';
import * as fs from 'fs';
import {
  isManualState,
  isForbiddenManualState,
  setArtifactManualState,
  readArtifactStateFile,
  ManualArtifactLifecycleState,
} from '../artifactLifecycle';
import { resolveArtifactState } from '../artifactLifecycle';
import { evaluateRunIntegrityGate, isRunIntegrityBlockedArtifactFile } from '../runIntegrityGate';
import { evaluateJudgeIntegrity, evaluateFinalReportEligibility } from '../judgeIntegrity';

function resolveArtifactKey(
  artifactName: string,
  runFolder: string,
  stages: { artifactFile: string; additionalArtifactFiles?: string[] }[],
): string | undefined {
  const allFiles: string[] = [];
  for (const stage of stages) {
    allFiles.push(stage.artifactFile);
    if (stage.additionalArtifactFiles) {
      allFiles.push(...stage.additionalArtifactFiles);
    }
  }

  // Exact match first (e.g., artifacts/request-brief.txt)
  if (allFiles.includes(artifactName)) return artifactName;

  // Basename match (e.g., request-brief.txt)
  const baseName = path.basename(artifactName);
  return allFiles.find((f) => path.basename(f) === baseName);
}

export function makeMarkCommand(): Command {
  const cmd = new Command('mark');
  cmd
    .description('Manually set the lifecycle state of a run artifact')
    .argument('<artifact-name>', 'artifact filename (e.g., request-brief.txt)')
    .requiredOption('--state <state>', 'lifecycle state: incomplete | blocked | complete')
    .option('--reason <reason>', 'reason for the state change (required for blocked and incomplete)')
    .option('--run <run-id>', 'select a specific workflow run by ID')
    .option('--root <path>', 'project root directory (default: current working directory)')
    .action(
      (
        artifactName: string,
        options: { state: string; reason?: string; run?: string; root?: string },
      ) => {
        const projectRoot = path.resolve(options.root ?? process.cwd());

        if (isForbiddenManualState(options.state)) {
          console.error(
            `Error: "${options.state}" cannot be set manually.\n` +
            `  "missing" is computed from file absence.\n` +
            `  "stale" is computed from upstream artifact timestamps.\n` +
            `Allowed manual states: incomplete, blocked, complete`,
          );
          process.exit(1);
        }

        if (!isManualState(options.state)) {
          console.error(
            `Error: invalid state "${options.state}".\n` +
            `Allowed manual states: incomplete, blocked, complete`,
          );
          process.exit(1);
        }

        const state = options.state as ManualArtifactLifecycleState;

        if ((state === 'blocked' || state === 'incomplete') && !options.reason) {
          console.error(
            `Error: --reason is required when marking an artifact as ${state}.\n` +
            `Example: my-dev-kit-orchestrator mark ${artifactName} --state ${state} --reason "Explain why"`,
          );
          process.exit(1);
        }

        let meta;
        if (options.run) {
          const runFolder = getRunFolder(projectRoot, options.run);
          if (!fs.existsSync(runFolder)) {
            console.error(`Error: run not found: ${options.run}`);
            process.exit(1);
          }
          try {
            meta = loadRun(runFolder);
          } catch {
            console.error(`Error: could not load run.json for: ${options.run}`);
            process.exit(1);
          }
        } else {
          meta = getMostRecentRun(projectRoot);
          if (!meta) {
            console.error('No runs found. Run: my-dev-kit-orchestrator start "<request>"');
            process.exit(1);
          }
        }

        const artifactKey = resolveArtifactKey(artifactName, meta.runFolder, meta.stages);
        if (!artifactKey) {
          const knownArtifacts = meta.stages.flatMap((s) => [
            s.artifactFile,
            ...(s.additionalArtifactFiles ?? []),
          ]);
          console.error(
            `Error: unknown artifact "${artifactName}".\n` +
            `Known artifacts for this run:\n` +
            knownArtifacts.map((f) => `  - ${path.basename(f)}`).join('\n'),
          );
          process.exit(1);
        }

        // Canonical run-integrity gate (v1.2.3 Batch 2 / invariant 6.3) and
        // final-report eligibility (v1.2.3 Batch 3 / invariant 10.2):
        // manual completion must never override machine readiness or an
        // unaccepted judge verdict. A refresh-required
        // implementation/test-implementation artifact, or an ineligible
        // final-report artifact, is rejected before any state mutation --
        // artifact-state.json is not touched, matching the "rejected mark
        // does not mutate lifecycle state" acceptance criterion.
        if (state === 'complete') {
          // Completion is an attempt to advance the artifact's own stage,
          // even when earlier missing artifacts keep the reconciled run
          // cursor behind it.  Evaluate that target phase so manual marking
          // cannot bypass its stage-owned evidence requirement.
          const targetStage = meta.stages.find(
            (stage) => stage.artifactFile === artifactKey || (stage.additionalArtifactFiles ?? []).includes(artifactKey),
          );
          const gate = evaluateRunIntegrityGate({
            mode: meta.mode,
            runFolder: meta.runFolder,
            workflowStageNames: meta.stages.map((s) => s.name),
            currentStage: targetStage?.name ?? meta.currentStage,
            projectRoot: meta.projectRoot,
          });
          const judgeIntegrity = evaluateJudgeIntegrity({ gate, runFolder: meta.runFolder, mode: meta.mode });
          const preMarkStateFile = readArtifactStateFile(meta.runFolder);
          const finalReportEligibility = evaluateFinalReportEligibility({
            gate,
            judgeIntegrity,
            runFolder: meta.runFolder,
            stages: meta.stages,
            stateFile: preMarkStateFile,
            proofOnly: meta.proofOnly === true,
            verificationResponsibility: meta.verificationResponsibility,
          });
          if (isRunIntegrityBlockedArtifactFile(gate, meta.stages, artifactKey, finalReportEligibility.eligible)) {
            const isFinalReport = path.basename(artifactKey) === 'final-report.txt';
            if (isFinalReport) {
              console.error(
                `Error: cannot mark "${path.basename(artifactKey)}" complete -- this run is not eligible for a final report.\n` +
                `  Expected judge verdict: ${judgeIntegrity.expectedJudgeVerdict}\n` +
                `  Judge verdict parse status: ${judgeIntegrity.judgeVerdictParseStatus}\n` +
                (judgeIntegrity.authoredJudgeVerdict ? `  Authored judge verdict: ${judgeIntegrity.authoredJudgeVerdict}\n` : '') +
                `  Judge verdict accepted: ${judgeIntegrity.judgeVerdictAccepted}\n` +
                (finalReportEligibility.primaryReason ? `  Reason: ${finalReportEligibility.primaryReason}\n` : '') +
                (judgeIntegrity.acceptedCorrectionStage ? `  Recommended correction stage: ${judgeIntegrity.acceptedCorrectionStage}\n` : '') +
                `\nManual completion cannot override an unaccepted judge verdict. Resolve the blocking issue and rerun\n` +
                `  my-dev-kit-orchestrator check\n` +
                `before marking this artifact complete.`,
              );
            } else {
              console.error(
                `Error: cannot mark "${path.basename(artifactKey)}" complete -- repository context is refresh-required.\n` +
                `  Readiness classification: ${gate.readinessClassification}\n` +
                (gate.primaryBlocker
                  ? `  Primary blocker: ${gate.primaryBlocker.primaryCode}\n` +
                    `  Reason: ${gate.primaryBlocker.primaryReason}\n` +
                    `  Corrective action: ${gate.primaryBlocker.correctiveAction}\n`
                  : '') +
                `  Recommended next stage: ${gate.recommendedCorrectionStage ?? '(none)'}\n\n` +
                `Manual completion cannot override machine readiness. Refresh the repository context and rerun\n` +
                `  my-dev-kit-orchestrator check\n` +
                `before marking this artifact complete.`,
              );
            }
            process.exit(1);
          }
        }

        setArtifactManualState(meta.runFolder, artifactKey, state, {
          reason: options.reason,
        });

        // Warn if marking complete but file is missing
        if (state === 'complete') {
          const stateFile = readArtifactStateFile(meta.runFolder);
          const effectiveState = resolveArtifactState(
            meta.runFolder,
            artifactKey,
            meta.stages,
            stateFile,
          );
          if (effectiveState === 'missing') {
            console.warn(
              `Warning: "${path.basename(artifactKey)}" was marked complete but the artifact file does not exist.\n` +
              `  Effective state remains: missing\n` +
              `  Create the file before the stage can be considered complete.`,
            );
          }
        }

        const reasonMsg = options.reason ? ` - ${options.reason}` : '';
        console.log(
          `Marked ${path.basename(artifactKey)} as ${state}${reasonMsg}\n` +
          `Run: ${meta.runId}`,
        );
      },
    );
  return cmd;
}

